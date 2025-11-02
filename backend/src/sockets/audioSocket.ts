import { Socket } from 'socket.io';
import * as inferenceService from '../services/inferenceService';
import { nowNs } from '../utils/time';
import type { AudioChunkMeta } from '../types';
import { registerDevice, unregisterDevice } from '../services/socketServer';

/**
 * Simplified audio socket handlers for single-device inference
 */
export function attachAudioHandlers(socket: Socket) {
    socket.on('register', (payload: { deviceId: string }) => {
        socket.data.deviceId = payload?.deviceId;
        console.log(`[SOCKET] Device registered: ${socket.data.deviceId} (socket: ${socket.id})`);
        try {
            if (payload?.deviceId) {
                socket.join(payload.deviceId);
                registerDevice(payload.deviceId, socket.id);
            }
            socket.nsp.to('processors').emit('device-joined', { deviceId: payload?.deviceId });
        } catch (e) {
            console.warn('Error emitting device-joined', e);
        }
    });

    // Simple ping-pong for basic clock sync
    socket.on('clock-ping', (clientTimestampNs: number | string, cb?: (res: any) => void) => {
        const serverTime = nowNs();
        if (cb) cb({ serverRecvNs: serverTime.toString(), serverSendNs: serverTime.toString() });
    });

    // Handle audio chunks
    socket.on('audio-chunk', (meta: any, chunk: ArrayBuffer | Buffer) => {
        const deviceId = meta?.deviceId || socket.data.deviceId;
        if (!deviceId) {
            console.warn('[SOCKET] audio-chunk without deviceId');
            return;
        }

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
        
        console.log(`[SOCKET] audio-chunk from ${deviceId} size=${buffer.length} bytes`);

        // Calculate RMS and convert to Float32 for inference
        let rms = 0;
        let samples: Float32Array | undefined;
        
        if (buffer.length > 0) {
            const alignedBuffer = Buffer.from(buffer);
            const int16Samples = new Int16Array(alignedBuffer.buffer, alignedBuffer.byteOffset, alignedBuffer.length / 2);
            
            const float32Samples = new Float32Array(int16Samples.length);
            let sum = 0;
            for (let i = 0; i < int16Samples.length; i++) {
                const normalized = int16Samples[i] / 32768.0;
                float32Samples[i] = normalized;
                sum += normalized * normalized;
            }
            rms = Math.sqrt(sum / int16Samples.length);
            samples = float32Samples;
        }

        // Send to inference if active
        if (inferenceService.isInferenceActive() && samples) {
            inferenceService.addAudioChunk(samples, nowNs(), meta.sampleRate || 48000);
        }

        // Broadcast to monitors
        socket.nsp.to('processors').emit('aligned-chunk', {
            deviceId,
            seq: meta.seq,
            receivedAtNs: nowNs().toString(),
            sampleRate: meta.sampleRate,
            channels: meta.channels,
            length: buffer.length,
            rms: rms
        });
    });

    socket.on('join:processor', () => {
        socket.join('processors');
    });

    socket.on('mic-permission', (payload: { granted: boolean }) => {
        const deviceId = socket.data.deviceId;
        if (deviceId && payload?.granted) {
            console.log(`[SOCKET] Mic permission granted for ${deviceId}`);
            const phaseService = require('../services/phaseService');
            phaseService.markMicConfirmed(deviceId);
        }
    });

    socket.on('disconnect', () => {
        const deviceId = socket.data.deviceId;
        if (deviceId) {
            console.log(`[SOCKET] Device disconnected: ${deviceId}`);
            unregisterDevice(deviceId);
            socket.nsp.to('processors').emit('device-left', { deviceId });
        }
    });
}

export default attachAudioHandlers;
