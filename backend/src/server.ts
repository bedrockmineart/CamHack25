import express from 'express';
// Use CORS so the Next.js front-end (possibly on a different origin) can call backend endpoints
const cors = require('cors');
import http from 'http';
import { Server } from 'socket.io';
import { setAudioRoutes } from './routes/audioRoutes';
import { setupSocket } from './sockets';
import { initTime } from './utils/time';
import { alignmentBuffer } from './services/alignmentBuffer';
import { startProcessor, stopProcessor, getProcessorStatus } from './services/processor';
import * as socketServer from './services/socketServer';
import * as phaseService from './services/phaseService';

const app = express();
const server = http.createServer(app);

// Initialize high-resolution server epoch mapping
initTime();

// Initialize alignment buffer with expected devices (still needed for buffer management)
alignmentBuffer.setExpectedDevices(['1', '2', '3', 'bg']);
// Don't set expected devices in phase service - they will be locked when session starts
// phaseService.setExpectedDevices(['1', '2', '3', 'bg']);

const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS and explicitly handle preflight.
// This echoes the request origin back in Access-Control-Allow-Origin, which is fine for local/dev
app.use(cors({
    origin: (origin: string | undefined, cb: any) => {
        // allow requests with no origin (e.g., curl, server-to-server)
        cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Ensure OPTIONS preflight requests are handled for all routes
app.options('*', cors());

// Optional: log preflight requests to help debug CORS issues
app.use((req, _res, next) => {
    if (req.method === 'OPTIONS') {
        console.log('[CORS] Preflight request for', req.url, 'Origin:', req.headers.origin);
    }
    next();
});

// Simple request logger — prints method, url, headers and body (if JSON).
app.use((req, _res, next) => {
    try {
        const headers = { ...req.headers };
        // hide large or sensitive headers if any
        if (headers.authorization) headers.authorization = '[REDACTED]';
        console.log(`[HTTP] ${req.method} ${req.url}`);
        console.log('  headers:', JSON.stringify(headers));
        const ct = req.headers['content-type'] || '';
        if (typeof req.body === 'object' && Object.keys(req.body || {}).length > 0) {
            console.log('  body:', JSON.stringify(req.body));
        } else if (ct && ct.toString().includes('application/json')) {
            // body parsed but empty
            console.log('  body: {}');
        } else {
            if (req.method !== 'GET') console.log('  body: <non-json or binary — omitted> content-type=' + ct);
        }
    } catch (err) {
        console.warn('Error logging request', err);
    }
    next();
});

setAudioRoutes(app);
setupSocket(io);

// expose io to services (also set inside setupSocket but ensure available)
socketServer.setIo(io);

// Status endpoint — returns per-device offsets, buffer sizes, and server info
app.get('/api/status', (_req, res) => {
    const syncService = require('./services/syncService');
    const audioService = require('./services/audioService');
    const { nowNs, nsToMsFloat } = require('./utils/time');
    
    const offsets = syncService.listOffsets();
    const devices = audioService.listDevices();
    const deviceStatus = devices.map((deviceId: string) => {
        const buffer = audioService.getDeviceBuffer(deviceId);
        const offset = syncService.getOffset(deviceId);
        return {
            deviceId,
            chunkCount: buffer.length,
            offsetNs: offset ? offset.toString() : null,
            offsetMs: offset ? nsToMsFloat(offset) : null,
            lastChunkAlignedNs: buffer.length > 0 ? buffer[buffer.length - 1].serverAlignedNs.toString() : null
        };
    });
    
    res.json({
        serverTimeNs: nowNs().toString(),
        serverTimeMs: nsToMsFloat(nowNs()),
        devices: deviceStatus,
        connectedSockets: io.sockets.sockets.size
    });
});

// Buffer stats endpoint
app.get('/api/buffer-stats', (_req, res) => {
    res.json(alignmentBuffer.getStats());
});

// Processor control endpoints
app.post('/api/processor/start', (_req, res) => {
    startProcessor();
    res.json({ success: true, status: getProcessorStatus() });
});

app.post('/api/processor/stop', (_req, res) => {
    stopProcessor();
    res.json({ success: true, status: getProcessorStatus() });
});

app.get('/api/processor/status', (_req, res) => {
    res.json(getProcessorStatus());
});

// Calibration endpoints
app.post('/api/calibration/start', (_req, res) => {
    const calibrationService = require('./services/calibrationService');
    calibrationService.startCalibration();
    res.json({ success: true, message: 'Calibration started' });
});

app.post('/api/calibration/stop', (_req, res) => {
    const calibrationService = require('./services/calibrationService');
    calibrationService.stopCalibration();
    res.json({ success: true, message: 'Calibration stopped' });
});

app.post('/api/calibration/finish', (_req, res) => {
    const calibrationService = require('./services/calibrationService');
    calibrationService.manualFinishCalibration();
    res.json({ success: true, message: 'Calibration finished and offsets adjusted' });
});

app.get('/api/calibration/status', (_req, res) => {
    const calibrationService = require('./services/calibrationService');
    res.json(calibrationService.getCalibrationStatus());
});

// Session/phase control endpoints (computer UI will call these)
app.post('/api/session/start-joining', (_req, res) => {
    const result = phaseService.startJoining();
    res.json(result);
});

app.post('/api/session/start-mic', (_req, res) => {
    const result = phaseService.startMicPhase();
    res.json(result);
});

app.post('/api/session/place-close', (_req, res) => {
    const result = phaseService.promptPlaceClose();
    res.json(result);
});

app.post('/api/session/play-tone', (req, res) => {
    const { deviceId } = req.body || {};
    const result = phaseService.broadcastPlayTone(deviceId);
    res.json(result);
});

app.post('/api/session/place-keyboard', (_req, res) => {
    const result = phaseService.promptPlaceKeyboard();
    res.json(result);
});

app.post('/api/session/start-keyboard-cal', (_req, res) => {
    const result = phaseService.startKeyboardCalibration();
    res.json(result);
});

app.post('/api/session/next-key', (_req, res) => {
    const result = phaseService.nextCalibrationKey();
    res.json(result);
});

app.post('/api/session/finish', (_req, res) => {
    const result = phaseService.finishOperation();
    res.json(result);
});

app.post('/api/session/reset', (_req, res) => {
    const result = phaseService.resetSession();
    res.json(result);
});

app.get('/api/session/status', (_req, res) => {
    res.json(phaseService.getStatus());
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
