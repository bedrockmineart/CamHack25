import request from 'supertest';
import { app } from '../src/app'; // Adjust the import based on your app's export

describe('Audio API', () => {
    it('should receive audio stream from recorder 1', async () => {
        const response = await request(app)
            .post('/api/audio/recorder1')
            .send({ audioData: 'audio stream data' })
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Audio received');
    });

    it('should receive audio stream from recorder 2', async () => {
        const response = await request(app)
            .post('/api/audio/recorder2')
            .send({ audioData: 'audio stream data' })
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Audio received');
    });

    it('should receive audio stream from recorder 3', async () => {
        const response = await request(app)
            .post('/api/audio/recorder3')
            .send({ audioData: 'audio stream data' })
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Audio received');
    });

    it('should receive background noise stream', async () => {
        const response = await request(app)
            .post('/api/audio/background')
            .send({ audioData: 'background noise data' })
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Background noise received');
    });

    it('should sync audio streams', async () => {
        const response = await request(app)
            .post('/api/audio/sync')
            .send({ timestamps: [/* array of timestamps */] })
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Audio streams synced');
    });
});