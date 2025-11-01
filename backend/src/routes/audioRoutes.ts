import { Router } from 'express';
import AudioController from '../controllers/audioController';

const router = Router();
const audioController = new AudioController();

export function setAudioRoutes(app: Router) {
    app.post('/api/audio/receive', audioController.receiveAudio.bind(audioController));
    app.post('/api/audio/sync', audioController.syncAudio.bind(audioController));
}

router.use('/audio', router);