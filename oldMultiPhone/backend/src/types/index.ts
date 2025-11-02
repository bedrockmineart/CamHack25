export type DeviceId = string;

export type ClockOffsetEntry = {
  // offset = serverEpochNs - deviceEpochNs
  offsetNs: bigint;
  lastSeenNs: bigint;
};

export type AudioChunkMeta = {
  deviceId: DeviceId;
  seq?: number;
  clientTimestampNs: bigint; // device-provided timestamp in ns (client epoch)
  sampleRate?: number;
  channels?: number;
  format?: string;
};

export {};
export interface AudioStream {
    deviceId: string;
    timestamp: number;
    audioData: Buffer;
}

export interface SyncData {
    deviceId: string;
    offset: number;
    syncTimestamp: number;
}