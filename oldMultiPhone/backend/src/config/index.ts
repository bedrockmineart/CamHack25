import dotenv from 'dotenv';

dotenv.config();

const config = {
    port: process.env.PORT || 3000,
    dbUri: process.env.DB_URI || 'mongodb://localhost:27017/multi-source-audio',
    audioStreamLimit: process.env.AUDIO_STREAM_LIMIT || 10 * 1024 * 1024,
    syncThreshold: process.env.SYNC_THRESHOLD || 100, 
};

export default config;