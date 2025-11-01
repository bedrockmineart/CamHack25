import { Server } from 'socket.io';

const setupSocketServer = (httpServer) => {
    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('audioStream', (data) => {
            // Handle incoming audio stream data
            console.log('Received audio stream from device:', socket.id);
            // Process the audio data here
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

export default setupSocketServer;