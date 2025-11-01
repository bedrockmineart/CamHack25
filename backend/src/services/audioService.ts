export class AudioService {
    private audioStreams: Map<string, Buffer[]>;

    constructor() {
        this.audioStreams = new Map();
    }

    public receiveAudio(deviceId: string, audioData: Buffer): void {
        if (!this.audioStreams.has(deviceId)) {
            this.audioStreams.set(deviceId, []);
        }
        this.audioStreams.get(deviceId)?.push(audioData);
    }

    public getAudio(deviceId: string): Buffer[] | undefined {
        return this.audioStreams.get(deviceId);
    }

    public clearAudio(deviceId: string): void {
        this.audioStreams.delete(deviceId);
    }

    public getAllAudioStreams(): Map<string, Buffer[]> {
        return this.audioStreams;
    }
}