import { AudioStream, SyncData } from '../types';
import { timeDifference } from '../utils/time';

export class SyncService {
    private audioStreams: Map<string, AudioStream> = new Map();

    constructor() {}

    public addAudioStream(deviceId: string, audioStream: AudioStream): void {
        this.audioStreams.set(deviceId, audioStream);
    }

    public syncStreams(): SyncData {
        const timestamps = Array.from(this.audioStreams.values()).map(stream => stream.timestamp);
        const minTimestamp = Math.min(...timestamps);
        
        const syncedStreams = Array.from(this.audioStreams.entries()).map(([deviceId, stream]) => {
            const offset = timeDifference(stream.timestamp, minTimestamp);
            return {
                deviceId,
                audioData: stream.audioData,
                offset
            };
        });

        return {
            syncedStreams,
            referenceTimestamp: minTimestamp
        };
    }
}