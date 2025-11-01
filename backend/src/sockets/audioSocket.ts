import { Socket } from 'socket.io';
import * as syncService from '../services/syncService';
import * as audioService from '../services/audioService';
import { nowNs, nsToMsFloat } from '../utils/time';
import type { AudioChunkMeta } from '../types';

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

        // Optionally broadcast aligned info to processors
            socket.nsp.to('processors').emit('aligned-chunk', {
            deviceId,
            seq: metaTyped.seq,
            alignedServerNs: alignedServerNs.toString(),
            receivedAtNs: nowNs().toString(),
            sampleRate: metaTyped.sampleRate,
            channels: metaTyped.channels,
            format: metaTyped.format,
            length: buffer.length
        });
    });

    socket.on('join:processor', () => {
        socket.join('processors');
    });

    socket.on('disconnect', () => {
        // nothing fancy for now
    });
}

export default attachAudioHandlers;