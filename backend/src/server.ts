import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setAudioRoutes } from './routes/audioRoutes';
import { setupSocket } from './sockets';
import { initTime } from './utils/time';

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

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
