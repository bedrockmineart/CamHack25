import { Server } from 'socket.io';

let ioInstance: Server | null = null;
const connectedDevices = new Map<string, string>(); // deviceId -> socketId

export function setIo(io: Server) {
  ioInstance = io;
}

export function getIo(): Server {
  if (!ioInstance) throw new Error('Socket.io instance not initialized');
  return ioInstance;
}

export function emitToAll(event: string, payload?: any) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}

export function emitToDevice(deviceId: string, event: string, payload?: any) {
  if (!ioInstance) return;
  // assume clients join a room named by their deviceId
  ioInstance.to(deviceId).emit(event, payload);
}

export function registerDevice(deviceId: string, socketId: string) {
  connectedDevices.set(deviceId, socketId);
  console.log(`[SocketServer] Device ${deviceId} registered (socket: ${socketId})`);
  // Notify about device status change
  broadcastDeviceStatus();
}

export function unregisterDevice(deviceId: string) {
  if (connectedDevices.has(deviceId)) {
    connectedDevices.delete(deviceId);
    console.log(`[SocketServer] Device ${deviceId} unregistered`);
    // Notify about device status change
    broadcastDeviceStatus();
  }
}

export function getConnectedDevices(): string[] {
  return Array.from(connectedDevices.keys());
}

function broadcastDeviceStatus() {
  // Emit the current status whenever devices change
  // Import phaseService dynamically to avoid circular dependency
  const phaseService = require('./phaseService');
  emitToAll('status-update', phaseService.getStatus());
}

export default { setIo, getIo, emitToAll, emitToDevice, registerDevice, unregisterDevice, getConnectedDevices };
