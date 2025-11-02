import { ClockOffsetEntry, DeviceId } from '../types';
import { nowNs } from '../utils/time';

// Simple in-memory store for device clock offsets (serverEpochNs - clientEpochNs)
const offsets = new Map<DeviceId, ClockOffsetEntry>();

export function setOffset(deviceId: DeviceId, offsetNs: bigint) {
    offsets.set(deviceId, { offsetNs, lastSeenNs: nowNs() });
}

export function getOffset(deviceId: DeviceId): bigint | null {
    const e = offsets.get(deviceId);
    return e ? e.offsetNs : null;
}

export function touch(deviceId: DeviceId) {
    const e = offsets.get(deviceId);
    if (e) e.lastSeenNs = nowNs();
}

export function listOffsets() {
    return Array.from(offsets.entries()).map(([deviceId, entry]) => ({ deviceId, offsetNs: entry.offsetNs, lastSeenNs: entry.lastSeenNs }));
}
