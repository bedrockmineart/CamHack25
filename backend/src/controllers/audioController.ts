import { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.join(__dirname, '../../temp/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = `upload_${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

export class AudioController {
    public uploadMiddleware = upload.single('audio');

    receiveAudio(req: Request, res: Response) {
        const { deviceId, audioData, timestamp } = req.body;
        res.status(200).json({ message: 'Audio received', deviceId });
    }

    syncAudio(req: Request, res: Response) {
        const { audioStreams } = req.body;
        res.status(200).json({ message: 'Audio streams synchronized' });
    }

    async uploadAudio(req: Request, res: Response) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const deviceId = req.body.deviceId || 'upload';
            const uploadedFile = req.file.path;

            console.log(`[UPLOAD] File: ${req.file.originalname} (${req.file.size} bytes)`);
            console.log(`[UPLOAD] Running inference (Python will handle conversion)`);
            
            const predictions = await this.runInferenceOnFile(uploadedFile);

            console.log(`[UPLOAD] Results:`, predictions);

            res.json({
                success: true,
                filename: req.file.originalname,
                predictions: predictions || [],
                deviceId
            });

        } catch (error: any) {
            console.error('[UPLOAD] Error:', error);
            res.status(500).json({ 
                error: 'Failed to process audio',
                details: error.message 
            });
        }
    }

    private runInferenceOnFile(wavFile: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../algorithm/run_inference.py');
            const python = spawn('python3', [pythonScript, wavFile]);

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                const stderrChunk = data.toString();
                stderr += stderrChunk;
                console.log('[UPLOAD] Python:', stderrChunk.trim());
            });

            python.on('close', (code) => {
                if (code === 0) {
                    try {
                        const lines = stdout.trim().split('\n');
                        const jsonLine = lines[lines.length - 1];
                        const predictions = JSON.parse(jsonLine);
                        resolve(predictions);
                    } catch (err: any) {
                        console.error('[UPLOAD] Parse error:', stdout);
                        console.error('[UPLOAD] Full stderr:', stderr);
                        reject(new Error('Failed to parse results'));
                    }
                } else {
                    console.error('[UPLOAD] Python failed with code:', code);
                    console.error('[UPLOAD] stderr:', stderr);
                    reject(new Error(`Inference failed: ${code}`));
                }
            });

            python.on('error', (err) => {
                reject(new Error(`Failed to spawn Python: ${err.message}`));
            });
        });
    }
}

export default new AudioController();
