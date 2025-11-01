import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setAudioRoutes } from './routes/audioRoutes';
import { setupSocket } from './sockets';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

setAudioRoutes(app);
setupSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});