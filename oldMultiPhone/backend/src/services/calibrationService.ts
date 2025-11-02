/**
 * Calibration service using GCC-PHAT cross-correlation for precise time-of-arrival
 */

import { nowNs } from '../utils/time';
import * as syncService from './syncService';
import * as socketServer from './socketServer';
import { computeGccPhat, extractToneSegment, GccPhatResult } from './gccPhat';

type WaveformBuffer = {
    deviceId: string;
    samples: Float32Array[];
    chunkTimestamps: bigint[];
    totalSamples: number;
};

type CorrelationResult = {
    deviceId: string;
    delaySamples: number;
    delayMs: number;
    confidence: number;
    sharpness: number;
};

// Per-device baseline noise tracking
type DeviceBaseline = {
    rmsHistory: number[];
    baselineRms: number;
    threshold: number;
};

let calibrationActive = false;
let calibrationStartTime: bigint | null = null;
let tonePlayTimeNs: bigint | null = null; // When the tone was actually played
let waveformBuffers: Map<string, WaveformBuffer> = new Map();
let correlationResults: CorrelationResult[] = [];
let deviceBaselines: Map<string, DeviceBaseline> = new Map();
const CALIBRATION_WINDOW_MS = 3000; // Look for waveforms within 3 seconds of calibration start
const BASELINE_HISTORY_SIZE = 50; // Keep last 50 RMS samples for baseline
const PEAK_MULTIPLIER = 5.0; // Peak must be 5x baseline RMS to be detected
const SAMPLE_RATE = 48000; // Expected sample rate
const REFERENCE_DEVICE_ID = '1'; // Device 1 is always the reference (M₁)

/**
 * Start calibration mode - system will collect audio waveforms for cross-correlation
 * @param tonePlayedAtNs - Server timestamp when tone was played from monitor
 */
export function startCalibration(tonePlayedAtNs?: bigint) {
    calibrationActive = true;
    calibrationStartTime = nowNs();
    tonePlayTimeNs = tonePlayedAtNs || calibrationStartTime;
    waveformBuffers.clear();
    correlationResults = [];
    console.log(`[CALIBRATION] Started GCC-PHAT mode. Tone played at: ${tonePlayTimeNs}, collecting waveforms...`);
}

/**
 * Stop calibration mode
 */
export function stopCalibration() {
    calibrationActive = false;
    calibrationStartTime = null;
    tonePlayTimeNs = null;
    console.log('[CALIBRATION] Stopped.');
}

/**
 * Check if we're currently in calibration mode
 */
export function isCalibrating(): boolean {
    return calibrationActive;
}

/**
 * Update baseline RMS for a device (called continuously during normal operation)
 */
export function updateBaseline(deviceId: string, rms: number) {
    // Don't update baseline during calibration
    if (calibrationActive) return;
    
    let baseline = deviceBaselines.get(deviceId);
    if (!baseline) {
        baseline = {
            rmsHistory: [],
            baselineRms: 0,
            threshold: 0.01 // Default fallback
        };
        deviceBaselines.set(deviceId, baseline);
    }
    
    // Add to history
    baseline.rmsHistory.push(rms);
    
    // Keep only recent history
    if (baseline.rmsHistory.length > BASELINE_HISTORY_SIZE) {
        baseline.rmsHistory.shift();
    }
    
    // Calculate baseline as median of recent RMS values (more robust than mean)
    if (baseline.rmsHistory.length >= 10) {
        const sorted = [...baseline.rmsHistory].sort((a, b) => a - b);
        baseline.baselineRms = sorted[Math.floor(sorted.length / 2)];
        baseline.threshold = Math.max(baseline.baselineRms * PEAK_MULTIPLIER, 0.005); // Minimum threshold of 0.005
    }
}

/**
 * Get dynamic threshold for a device
 */
function getThreshold(deviceId: string): number {
    const baseline = deviceBaselines.get(deviceId);
    if (!baseline || baseline.rmsHistory.length < 10) {
        // Not enough data, use default
        return 0.01;
    }
    return baseline.threshold;
}

/**
 * Process an audio chunk during calibration - buffer waveforms for GCC-PHAT
 */
export function processChunkForCalibration(
    deviceId: string,
    alignedServerNs: bigint,
    rms: number,
    samples?: Float32Array  // Raw audio samples
) {
    if (!calibrationActive || !calibrationStartTime) return;

    // Check if we're within the calibration window
    const elapsedNs = nowNs() - calibrationStartTime;
    const elapsedMs = Number(elapsedNs / 1_000_000n);
    
    if (elapsedMs > CALIBRATION_WINDOW_MS) {
        // Window expired, finish calibration
        finishCalibration();
        return;
    }

    // Buffer waveform data if samples provided
    if (samples && samples.length > 0) {
        let buffer = waveformBuffers.get(deviceId);
        if (!buffer) {
            buffer = {
                deviceId,
                samples: [],
                chunkTimestamps: [],
                totalSamples: 0
            };
            waveformBuffers.set(deviceId, buffer);
        }
        
        // Store this chunk
        buffer.samples.push(new Float32Array(samples)); // Copy to avoid reference issues
        buffer.chunkTimestamps.push(alignedServerNs);
        buffer.totalSamples += samples.length;
        
        console.log(`[CALIBRATION] Buffered ${samples.length} samples from device ${deviceId} (total: ${buffer.totalSamples} samples, ${(buffer.totalSamples / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
        
        // Broadcast collection status
        socketServer.emitToAll('calibration-waveform-collected', {
            deviceId,
            samplesCollected: buffer.totalSamples,
            durationMs: (buffer.totalSamples / SAMPLE_RATE * 1000).toFixed(1),
            totalDevices: waveformBuffers.size
        });
    }
}

/**
 * Finish calibration using GCC-PHAT cross-correlation for precise offset adjustment
 * 
 * GCC-PHAT Calibration Logic:
 * - Monitor plays tone at time T_monitor (server time)
 * - All phones record the tone in their local audio buffers
 * - Device 1 (M₁) is the fixed reference device
 * - For each device Mᵢ:
 *   1. Extract waveform segments containing the tone
 *   2. Cross-correlate with M₁'s waveform using GCC-PHAT
 *   3. Find time shift Δτ_audio (in samples, sub-millisecond precision)
 *   4. Calculate offset: Offset_i = T_local_i - (T_local_1 + Δτ_audio)
 * 
 * This provides 0.01-0.1ms precision vs 1-5ms from simple peak detection.
 */
function finishCalibration() {
    calibrationActive = false;
    
    if (waveformBuffers.size < 2) {
        console.log('[CALIBRATION] Need at least 2 devices for GCC-PHAT calibration.');
        waveformBuffers.clear();
        return;
    }

    if (!tonePlayTimeNs) {
        console.log('[CALIBRATION] No tone play time recorded, cannot calibrate.');
        waveformBuffers.clear();
        return;
    }

    console.log('[CALIBRATION] Starting GCC-PHAT cross-correlation analysis...');
    console.log(`[CALIBRATION] Tone was played at server time: ${tonePlayTimeNs}`);
    
    // Get reference device (M₁)
    const referenceBuffer = waveformBuffers.get(REFERENCE_DEVICE_ID);
    if (!referenceBuffer) {
        console.log(`[CALIBRATION] ERROR: Reference device ${REFERENCE_DEVICE_ID} not found!`);
        console.log(`[CALIBRATION] Available devices: ${Array.from(waveformBuffers.keys()).join(', ')}`);
        waveformBuffers.clear();
        return;
    }

    console.log(`[CALIBRATION] Using device ${REFERENCE_DEVICE_ID} as fixed reference (M₁)`);
    console.log(`[CALIBRATION] Reference has ${referenceBuffer.totalSamples} samples (${(referenceBuffer.totalSamples / SAMPLE_RATE * 1000).toFixed(1)}ms)`);
    
    // Concatenate all chunks into single waveform for reference
    const refWaveform = concatenateChunks(referenceBuffer);
    console.log(`[CALIBRATION] Reference waveform: ${refWaveform.length} samples`);
    
    // Cross-correlate each device with reference
    correlationResults = [];
    
    for (const [deviceId, buffer] of waveformBuffers.entries()) {
        if (deviceId === REFERENCE_DEVICE_ID) {
            // Reference device has zero offset
            correlationResults.push({
                deviceId,
                delaySamples: 0,
                delayMs: 0,
                confidence: 1.0,
                sharpness: 1.0
            });
            console.log(`  Device ${deviceId} (REFERENCE): delay=0.000ms`);
            continue;
        }
        
        // Concatenate chunks into waveform
        const deviceWaveform = concatenateChunks(buffer);
        console.log(`  Device ${deviceId} waveform: ${deviceWaveform.length} samples`);
        
        // Run GCC-PHAT cross-correlation
        console.log(`  Running GCC-PHAT correlation between M₁ and M${deviceId}...`);
        const result = computeGccPhat(refWaveform, deviceWaveform, SAMPLE_RATE);
        
        const delayMs = result.delaySeconds * 1000;
        
        correlationResults.push({
            deviceId,
            delaySamples: result.delaySamples,
            delayMs,
            confidence: result.confidence,
            sharpness: result.sharpness
        });
        
        console.log(`  Device ${deviceId}:`);
        console.log(`    - Time shift: ${result.delaySamples} samples (${delayMs.toFixed(3)}ms)`);
        console.log(`    - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`    - Sharpness: ${result.sharpness.toFixed(2)}x`);
    }
    
    // Apply offset adjustments
    console.log('[CALIBRATION] Applying offset adjustments...');
    
    for (const result of correlationResults) {
        if (result.deviceId === REFERENCE_DEVICE_ID) {
            // Reference device offset stays the same
            const currentOffset = syncService.getOffset(result.deviceId) || 0n;
            console.log(`  Device ${result.deviceId} (REFERENCE): offset unchanged = ${currentOffset}ns`);
            continue;
        }
        
        // For other devices: adjust offset based on time shift
        // Offset_i = T_local_i - (T_local_1 + Δτ_audio)
        // Since offsets are stored as serverTime - clientTime,
        // we need to adjust by -Δτ_audio (convert to nanoseconds)
        const currentOffset = syncService.getOffset(result.deviceId) || 0n;
        const adjustmentNs = BigInt(Math.round(result.delayMs * 1_000_000));
        const newOffset = currentOffset - adjustmentNs;
        
        syncService.setOffset(result.deviceId, newOffset);
        console.log(`  Device ${result.deviceId}:`);
        console.log(`    - Adjustment: ${adjustmentNs}ns (${result.delayMs.toFixed(3)}ms)`);
        console.log(`    - New offset: ${currentOffset} → ${newOffset}`);
    }

    console.log('[CALIBRATION] Complete. Offsets adjusted using GCC-PHAT cross-correlation.');
    
    // Broadcast calibration complete with GCC-PHAT results
    socketServer.emitToAll('calibration-complete', {
        method: 'GCC-PHAT',
        deviceCount: correlationResults.length,
        referenceDevice: REFERENCE_DEVICE_ID,
        devices: correlationResults.map(r => ({
            deviceId: r.deviceId,
            delayMs: r.delayMs,
            delaySamples: r.delaySamples,
            confidence: r.confidence,
            sharpness: r.sharpness,
            isReference: r.deviceId === REFERENCE_DEVICE_ID
        }))
    });
    
    waveformBuffers.clear();
    correlationResults = [];
}

/**
 * Concatenate audio chunks into single waveform
 */
function concatenateChunks(buffer: WaveformBuffer): Float32Array {
    const combined = new Float32Array(buffer.totalSamples);
    let offset = 0;
    
    for (const chunk of buffer.samples) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }
    
    return combined;
}

/**
 * Get current calibration status
 */
export function getCalibrationStatus() {
    return {
        active: calibrationActive,
        waveformsCollected: waveformBuffers.size,
        devices: Array.from(waveformBuffers.entries()).map(([deviceId, buffer]) => ({
            deviceId,
            samplesCollected: buffer.totalSamples,
            durationMs: (buffer.totalSamples / SAMPLE_RATE * 1000).toFixed(1)
        }))
    };
}

/**
 * Manually finish calibration (useful for testing/debugging)
 */
export function manualFinishCalibration() {
    finishCalibration();
}
