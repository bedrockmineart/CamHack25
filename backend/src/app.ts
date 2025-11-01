import express from 'express';
import { setAudioRoutes } from './routes/audioRoutes';
import { setupSocket } from './sockets/index';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

setAudioRoutes(app);
setupSocket(app);

export default app;