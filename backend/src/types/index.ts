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