/**
 * Single-device inference service
 * Handles audio processing and keystroke detection using ML model
 * when only one device is connected (no triangulation needed)
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as socketServer from './socketServer';

interface AudioBuffer {
  samples: Float32Array[];
  timestamps: bigint[];
  sampleRate: number;
  totalSamples: number;
}

let inferenceActive = false;
let audioBuffer: AudioBuffer = {
  samples: [],
  timestamps: [],
  sampleRate: 48000,
  totalSamples: 0
};

const BUFFER_DURATION_MS = 5000; // Keep 5 seconds of audio
const INFERENCE_INTERVAL_MS = 1000; // Run inference every 1 second

let inferenceTimer: NodeJS.Timeout | null = null;

/**
 * Start single-device inference mode
 */
export function startInference(deviceId: string) {
  if (inferenceActive) {
    console.log('[INFERENCE] Already active');
    return;
  }

  inferenceActive = true;
  audioBuffer = {
    samples: [],
    timestamps: [],
    sampleRate: 48000,
    totalSamples: 0
  };

  console.log(`[INFERENCE] Started for device ${deviceId}`);
  
  // Start periodic inference
  inferenceTimer = setInterval(() => {
    runInference(deviceId);
  }, INFERENCE_INTERVAL_MS);

  // Notify clients
  socketServer.emitToAll('inference-started', { deviceId });
}

/**
 * Stop inference mode
 */
export function stopInference() {
  if (!inferenceActive) return;

  inferenceActive = false;
  
  if (inferenceTimer) {
    clearInterval(inferenceTimer);
    inferenceTimer = null;
  }

  audioBuffer = {
    samples: [],
    timestamps: [],
    sampleRate: 48000,
    totalSamples: 0
  };

  console.log('[INFERENCE] Stopped');
  socketServer.emitToAll('inference-stopped', {});
}

/**
 * Check if inference is currently active
 */
export function isInferenceActive(): boolean {
  return inferenceActive;
}

/**
 * Add audio chunk to buffer for inference
 */
export function addAudioChunk(samples: Float32Array, timestamp: bigint, sampleRate: number) {
  if (!inferenceActive) return;

  audioBuffer.samples.push(new Float32Array(samples));
  audioBuffer.timestamps.push(timestamp);
  audioBuffer.sampleRate = sampleRate;
  audioBuffer.totalSamples += samples.length;

  // Maintain buffer size (remove old samples)
  const maxSamples = Math.floor((BUFFER_DURATION_MS / 1000) * sampleRate);
  while (audioBuffer.totalSamples > maxSamples && audioBuffer.samples.length > 0) {
    const removed = audioBuffer.samples.shift();
    audioBuffer.timestamps.shift();
    if (removed) {
      audioBuffer.totalSamples -= removed.length;
    }
  }
}

/**
 * Run inference on buffered audio
 */
async function runInference(deviceId: string) {
  if (!inferenceActive || audioBuffer.samples.length === 0) {
    return;
  }

  try {
    // Concatenate audio buffer
    const combinedSamples = new Float32Array(audioBuffer.totalSamples);
    let offset = 0;
    for (const chunk of audioBuffer.samples) {
      combinedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    // Save audio to temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `inference_${Date.now()}.wav`);
    
    await saveWavFile(tempFile, combinedSamples, audioBuffer.sampleRate);

    // Run Python inference script
    const predictions = await runPythonInference(tempFile);

    if (predictions && predictions.length > 0) {
      console.log(`[INFERENCE] Detected ${predictions.length} keystrokes:`, predictions);
      
      // Broadcast predictions to clients
      socketServer.emitToAll('inference-result', {
        deviceId,
        predictions,
        timestamp: Date.now()
      });
    }

    // Clean up temp file
    fs.unlinkSync(tempFile);

  } catch (error) {
    console.error('[INFERENCE] Error during inference:', error);
  }
}

/**
 * Save Float32Array audio data as WAV file
 */
async function saveWavFile(filepath: string, samples: Float32Array, sampleRate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Convert Float32 to Int16 PCM
    const int16Samples = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Create WAV header
    const dataSize = int16Samples.length * 2;
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // audio format (PCM)
    header.writeUInt16LE(1, 22); // number of channels
    header.writeUInt32LE(sampleRate, 24); // sample rate
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    // Write to file
    const dataBuffer = Buffer.from(int16Samples.buffer);
    const wavBuffer = Buffer.concat([header, dataBuffer]);

    fs.writeFile(filepath, wavBuffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Run Python inference script on audio file
 */
async function runPythonInference(audioFile: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../algorithm/inference.py');
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[INFERENCE] Script not found: ${scriptPath}`);
      resolve([]);
      return;
    }

    const pythonProcess = spawn('python3', [scriptPath, audioFile]);
    
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[INFERENCE] Python process exited with code ${code}`);
        console.error(`[INFERENCE] stderr: ${stderr}`);
        resolve([]);
        return;
      }

      try {
        // Parse output - expected format: JSON array of predicted keys
        const predictions = JSON.parse(stdout.trim());
        resolve(predictions);
      } catch (error) {
        console.error('[INFERENCE] Failed to parse predictions:', error);
        console.error('[INFERENCE] stdout:', stdout);
        resolve([]);
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('[INFERENCE] Failed to start Python process:', error);
      resolve([]);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Inference timeout'));
    }, 5000);
  });
}

/**
 * Get inference status
 */
export function getInferenceStatus() {
  return {
    active: inferenceActive,
    bufferDurationMs: (audioBuffer.totalSamples / audioBuffer.sampleRate) * 1000,
    bufferSamples: audioBuffer.totalSamples,
    chunkCount: audioBuffer.samples.length
  };
}
