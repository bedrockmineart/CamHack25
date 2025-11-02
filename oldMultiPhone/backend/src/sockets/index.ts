import { Server } from 'socket.io';
import { attachAudioHandlers } from './audioSocket';

export function setupSocket(io: Server) {
    io.on('connection', (socket) => {
        console.log(`socket connected: ${socket.id}`);
        attachAudioHandlers(socket);
    });
}

export default setupSocket;