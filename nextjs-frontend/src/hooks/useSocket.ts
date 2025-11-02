'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

type AlignedChunk = {
  deviceId: string;
  seq?: number;
  alignedServerNs: string;
  receivedAtNs: string;
  sampleRate?: number;
  channels?: number;
  format?: string;
  length?: number;
  rms?: number;
};

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [alignedChunks, setAlignedChunks] = useState<AlignedChunk[]>([]);

  useEffect(() => {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    console.log('[useSocket] Connecting to backend:', backend);
    const socket = io(backend, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[useSocket] Connected');
      setConnected(true);
      // Join processors room to receive aligned-chunk broadcasts
      socket.emit('join:processor');
    });
    
    socket.on('disconnect', () => {
      console.log('[useSocket] Disconnected');
      setConnected(false);
    });

    socket.on('aligned-chunk', (payload: AlignedChunk) => {
      console.log('[useSocket] Received aligned-chunk:', payload);
      setAlignedChunks((s) => [payload, ...s].slice(0, 200));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { socket: socketRef.current, connected, alignedChunks, emit };
}
