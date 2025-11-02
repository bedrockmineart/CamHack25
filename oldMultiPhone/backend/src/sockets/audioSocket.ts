import { Socket } from 'socket.io';
import * as syncService from '../services/syncService';
import * as audioService from '../services/audioService';
import * as calibrationService from '../services/calibrationService';
import * as inferenceService from '../services/inferenceService';
import { alignmentBuffer } from '../services/alignmentBuffer';
import { nowNs, nsToMsFloat } from '../utils/time';
import type { AudioChunkMeta } from '../types';
import { registerDevice, unregisterDevice } from '../services/socketServer';

/**
 * Attach handlers to a connected socket.
 * Protocol:
 * - Clients should perform clock sync (ping/pong) and then send 'register-offset' with offsetNs = serverEpochNs - clientEpochNs
 * - Clients send binary audio chunks via 'audio-chunk' event: socket.emit('audio-chunk', meta, ArrayBuffer)
 */
export function attachAudioHandlers(socket: Socket) {
    socket.on('register', (payload: { deviceId: string }) => {
        socket.data.deviceId = payload?.deviceId;
        console.log(`[SOCKET] Device registered: ${socket.data.deviceId} (socket: ${socket.id})`);
        try {
            // join a room for direct device messages
            if (payload?.deviceId) {
                socket.join(payload.deviceId);
                registerDevice(payload.deviceId, socket.id);
            }
            // notify processors/monitors that a device joined
            socket.nsp.to('processors').emit('device-joined', { deviceId: payload?.deviceId });
        } catch (e) {
            console.warn('Error emitting device-joined', e);
        }
    });

    // Client sends its computed offset (serverEpochNs - clientEpochNs)
    socket.on('register-offset', (payload: { deviceId: string; offsetNs: number | string }) => {
        const deviceId = payload.deviceId || socket.data.deviceId;
        if (!deviceId) return;
        const offsetNs = BigInt(payload.offsetNs);
        syncService.setOffset(deviceId, offsetNs);
        console.log(`[SOCKET] Offset stored for ${deviceId}: ${nsToMsFloat(offsetNs)} ms (${offsetNs.toString()} ns)`);
    });

    // Simple ping-pong for clients to compute offset themselves.
    socket.on('clock-ping', (clientTimestampNs: number | string, cb?: (res: any) => void) => {
        // server receives ping; reply with server receive time and server send time
        const serverRecv = nowNs();
        // reply immediately with server send time; client can use recv/send to estimate RTT/offset
        const serverSend = nowNs();
        if (cb) cb({ serverRecvNs: serverRecv.toString(), serverSendNs: serverSend.toString() });
    });

    // audio-chunk: (meta, ArrayBuffer)
    socket.on('audio-chunk', (meta: any, chunk: ArrayBuffer | Buffer) => {
        const deviceId = meta?.deviceId || socket.data.deviceId;
        if (!deviceId) {
            console.warn('audio-chunk without deviceId');
            return;
        }
        // ensure meta fields
        const metaTyped: AudioChunkMeta = {
            deviceId,
            seq: meta?.seq,
            clientTimestampNs: BigInt(meta.clientTimestampNs),
            sampleRate: meta.sampleRate,
            channels: meta.channels,
            format: meta.format
        };

        // get stored offset: serverEpochNs - clientEpochNs
        const offset = syncService.getOffset(deviceId) ?? 0n;
        // aligned server time = clientTimestamp + offset
        const alignedServerNs = metaTyped.clientTimestampNs + offset;

        // accept Buffer or ArrayBuffer
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
            // Log chunk receipt for debugging/testing
            try {
                console.log(`[SOCKET] audio-chunk received from ${deviceId} seq=${metaTyped.seq ?? '-'} size=${buffer.length} bytes alignedServerNs=${alignedServerNs.toString()}`);
                // Optionally print a shortened hex or first bytes for debugging
                // console.log(buffer.slice(0,16).toString('hex'));
            } catch (e) {
                console.warn('Error logging audio chunk', e);
            }

            audioService.pushChunk(metaTyped, buffer, alignedServerNs);
        syncService.touch(deviceId);

        // Add to alignment buffer for synchronized processing
        alignmentBuffer.addChunk({
            deviceId,
            buffer,
            alignedServerNs,
            seq: metaTyped.seq || 0,
            sampleRate: metaTyped.sampleRate || 48000,
            channels: metaTyped.channels || 1
        });

        // Calculate RMS (Root Mean Square) audio level for visualization
        let rms = 0;
        let samples: Float32Array | undefined;
        
        if (buffer.length > 0) {
            // Assuming Int16 PCM data
            // Copy buffer to ensure proper alignment for Int16Array
            const alignedBuffer = Buffer.from(buffer);
            const int16Samples = new Int16Array(alignedBuffer.buffer, alignedBuffer.byteOffset, alignedBuffer.length / 2);
            
            // Convert to Float32 for processing
            const float32Samples = new Float32Array(int16Samples.length);
            let sum = 0;
            for (let i = 0; i < int16Samples.length; i++) {
                const normalized = int16Samples[i] / 32768.0; // Normalize to -1.0 to 1.0
                float32Samples[i] = normalized;
                sum += normalized * normalized;
            }
            rms = Math.sqrt(sum / int16Samples.length);
            
            // Store samples for calibration
            if (calibrationService.isCalibrating()) {
                samples = float32Samples;
            }
        }

        // Check if we're in calibration mode and process for peak detection
        if (calibrationService.isCalibrating()) {
            calibrationService.processChunkForCalibration(deviceId, alignedServerNs, rms, samples);
        } else if (inferenceService.isInferenceActive()) {
            // Single-device inference mode
            if (samples) {
                inferenceService.addAudioChunk(samples, alignedServerNs, metaTyped.sampleRate || 48000);
            }
        } else {
            // Update baseline when not calibrating (learning quiet background noise)
            calibrationService.updateBaseline(deviceId, rms);
        }

        // Optionally broadcast aligned info to processors
            socket.nsp.to('processors').emit('aligned-chunk', {
            deviceId,
            seq: metaTyped.seq,
            alignedServerNs: alignedServerNs.toString(),
            receivedAtNs: nowNs().toString(),
            sampleRate: metaTyped.sampleRate,
            channels: metaTyped.channels,
            format: metaTyped.format,
            length: buffer.length,
            rms: rms
        });
    });

    socket.on('join:processor', () => {
        socket.join('processors');
    });

    socket.on('mic-permission', (payload: { granted: boolean }) => {
        const deviceId = socket.data.deviceId;
        if (deviceId) {
            console.log(`[SOCKET] Mic permission ${payload?.granted ? 'granted' : 'denied'} for ${deviceId}`);
            // Import phaseService to mark mic confirmed
            const phaseService = require('../services/phaseService');
            if (payload?.granted) {
                phaseService.markMicConfirmed(deviceId);
            }
        }
    });

    socket.on('keyboard-key', (payload: any) => {
        const deviceId = socket.data.deviceId;
        if (deviceId) {
            console.log(`[SOCKET] Keyboard key from ${deviceId}:`, payload);
            // Import phaseService to record keypress
            const phaseService = require('../services/phaseService');
            phaseService.recordKeypress(deviceId, payload);
        }
    });

    socket.on('disconnect', () => {
        const deviceId = socket.data.deviceId;
        if (deviceId) {
            console.log(`[SOCKET] Device disconnected: ${deviceId} (socket: ${socket.id})`);
            unregisterDevice(deviceId);
            // notify processors/monitors that a device left
            socket.nsp.to('processors').emit('device-left', { deviceId });
        }
    });
}

export default attachAudioHandlers;