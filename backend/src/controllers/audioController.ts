import { Request, Response } from 'express';

export class AudioController {
    receiveAudio(req: Request, res: Response) {
        const { deviceId, audioData, timestamp } = req.body;
        res.status(200).json({ message: 'Audio received', deviceId });
    }

    syncAudio(req: Request, res: Response) {
        const { audioStreams } = req.body;
        res.status(200).json({ message: 'Audio streams synchronized' });
    }
}

export default new AudioController();