#!/usr/bin/env node
/**
 * Simple Socket.IO test client for the audio backend.
 * Usage: node test-client.js [deviceId] [backendUrl]
 * Example: node test-client.js phone-1 http://localhost:5000
 */

const io = require('socket.io-client');

const deviceId = process.argv[2] || 'test-phone';
const backendUrl = process.argv[3] || 'http://localhost:5000';

console.log(`[TEST CLIENT] Connecting to ${backendUrl} as device ${deviceId}`);

const socket = io(backendUrl, {
  transports: ['websocket'],
  reconnection: true
});

socket.on('connect', () => {
  console.log(`[TEST CLIENT] Connected! Socket ID: ${socket.id}`);
  
  // Step 1: Register device
  socket.emit('register', { deviceId });
  console.log(`[TEST CLIENT] Sent 'register' event for ${deviceId}`);
  
  // Step 2: Perform simple clock sync (send ping)
  const clientSendNs = BigInt(Date.now()) * 1_000_000n; // ms to ns
  socket.emit('clock-ping', clientSendNs.toString(), (response) => {
    console.log(`[TEST CLIENT] Received clock-ping response:`, response);
    
    // For this test, just use offset = 0 (real client should compute from RTT)
    const offsetNs = '0';
    socket.emit('register-offset', { deviceId, offsetNs });
    console.log(`[TEST CLIENT] Sent 'register-offset' with offsetNs=${offsetNs}`);
    
    // Step 3: Send a few test audio chunks
    sendTestChunks(3);
  });
});

socket.on('connect_error', (err) => {
  console.error(`[TEST CLIENT] Connection error:`, err.message);
});

socket.on('disconnect', (reason) => {
  console.log(`[TEST CLIENT] Disconnected: ${reason}`);
});

socket.on('aligned-chunk', (payload) => {
  console.log(`[TEST CLIENT] Received 'aligned-chunk' broadcast:`, payload);
});

let chunkSeq = 0;

function sendTestChunks(count) {
  const interval = setInterval(() => {
    if (chunkSeq >= count) {
      clearInterval(interval);
      console.log(`[TEST CLIENT] Sent ${count} test chunks. Keeping connection open...`);
      console.log(`[TEST CLIENT] Press Ctrl+C to exit.`);
      return;
    }
    
    chunkSeq++;
    const clientTimestampNs = (BigInt(Date.now()) * 1_000_000n).toString();
    const meta = {
      deviceId,
      seq: chunkSeq,
      clientTimestampNs,
      sampleRate: 48000,
      channels: 1,
      format: 'pcm_s16le'
    };
    
    // Create a small dummy audio buffer (16 bytes)
    const buffer = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
      buffer[i] = (chunkSeq * 10 + i) % 256;
    }
    
    socket.emit('audio-chunk', meta, buffer);
    console.log(`[TEST CLIENT] Sent audio-chunk seq=${chunkSeq} size=${buffer.length} bytes`);
  }, 500); // send every 500ms
}

// Handle clean exit
process.on('SIGINT', () => {
  console.log(`\n[TEST CLIENT] Exiting...`);
  socket.disconnect();
  process.exit(0);
});
