import { Buffer } from 'buffer';

import { AudioChunkMeta } from '../types';
import { nowNs } from '../utils/time';

type StoredChunk = {
    meta: AudioChunkMeta;
    buffer: Buffer;
    serverAlignedNs: bigint;
    receivedAtNs: bigint;
};

const perDeviceBuffers = new Map<string, StoredChunk[]>();

export function pushChunk(meta: AudioChunkMeta, buffer: Buffer, alignedServerNs: bigint) {
    const entry: StoredChunk = {
        meta,
        buffer,
        serverAlignedNs: alignedServerNs,
        receivedAtNs: nowNs()
    };
    const arr = perDeviceBuffers.get(meta.deviceId) || [];
    arr.push(entry);
    perDeviceBuffers.set(meta.deviceId, arr);
    // Keep small in-memory buffer (configurable). For now, cap at 1000 chunks.
    if (arr.length > 1000) arr.shift();
}

export function getDeviceBuffer(deviceId: string) {
    return perDeviceBuffers.get(deviceId) || [];
}

export function listDevices() {
    return Array.from(perDeviceBuffers.keys());
}
