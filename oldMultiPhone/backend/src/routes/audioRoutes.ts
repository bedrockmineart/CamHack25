import { Router } from 'express';
import audioController from '../controllers/audioController';

export function setAudioRoutes(app: Router) {
    app.post('/api/audio/receive', audioController.receiveAudio.bind(audioController));
    app.post('/api/audio/sync', audioController.syncAudio.bind(audioController));
}