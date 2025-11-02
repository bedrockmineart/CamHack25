import express from 'express';
const cors = require('cors');
import http from 'http';
import { Server } from 'socket.io';
import { setAudioRoutes } from './routes/audioRoutes';
import { setupSocket } from './sockets';
import { initTime, nowNs } from './utils/time';
import * as socketServer from './services/socketServer';
import * as phaseService from './services/phaseService';

const app = express();
const server = http.createServer(app);

// Initialize high-resolution server epoch mapping
initTime();

const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors({
    origin: (origin: string | undefined, cb: any) => {
        cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.options('*', cors());

// Simple request logger
app.use((req, _res, next) => {
    if (req.method === 'OPTIONS') {
        console.log('[CORS] Preflight request for', req.url);
    } else {
        console.log(`[HTTP] ${req.method} ${req.url}`);
    }
    next();
});

setAudioRoutes(app);
setupSocket(io);

// expose io to services
socketServer.setIo(io);

// Simple status endpoint
app.get('/api/status', (_req, res) => {
    res.json({
        serverTimeNs: nowNs().toString(),
        connectedSockets: io.sockets.sockets.size,
        connectedDevices: socketServer.getConnectedDevices()
    });
});

// Session control endpoints
app.post('/api/session/start', (req, res) => {
    const debugMode = req.body?.debugMode === true;
    const result = phaseService.startSession(debugMode);
    res.json(result);
});

app.post('/api/session/start-operation', (_req, res) => {
    const result = phaseService.startOperation();
    res.json(result);
});

app.post('/api/session/reset', (_req, res) => {
    const result = phaseService.resetSession();
    res.json(result);
});

app.get('/api/session/status', (_req, res) => {
    res.json(phaseService.getStatus());
});

// Inference status endpoint
app.get('/api/inference/status', (_req, res) => {
    const inferenceService = require('./services/inferenceService');
    res.json(inferenceService.getInferenceStatus());
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Single-device keystroke detection server running on port ${PORT}`);
    console.log(`📱 Connect your phone to get started`);
});
