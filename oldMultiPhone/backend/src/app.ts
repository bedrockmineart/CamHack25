import express from 'express';
import { setAudioRoutes } from './routes/audioRoutes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

setAudioRoutes(app);

export default app;