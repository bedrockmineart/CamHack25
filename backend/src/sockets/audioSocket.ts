import { Server } from "socket.io";

class AudioSocket {
    private io: Server;

    constructor(server: any) {
        this.io = new Server(server);
        this.setupSocketEvents();
    }

    private setupSocketEvents() {
        this.io.on("connection", (socket) => {
            console.log("New device connected:", socket.id);

            socket.on("audioStream", (data) => {
                this.handleAudioStream(data, socket.id);
            });

            socket.on("disconnect", () => {
                console.log("Device disconnected:", socket.id);
            });
        });
    }

    private handleAudioStream(data: any, deviceId: string) {
        // Process the incoming audio stream data
        console.log(`Received audio stream from ${deviceId}:`, data);
        // Here you would typically emit the data to other connected clients or process it further
        this.io.emit("audioStreamReceived", { deviceId, data });
    }
}

export default AudioSocket;