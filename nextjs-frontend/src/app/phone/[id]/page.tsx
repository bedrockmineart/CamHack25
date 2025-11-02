'use client';

import React, { useEffect, useState, useRef, use } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import SingleDeviceWarning from '../../../components/SingleDeviceWarning';

export default function PhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { socket, emit, connected } = useSocket();
  const [status, setStatus] = useState<'idle' | 'recording' | 'error'>('idle');
  const [message, setMessage] = useState('Waiting to connect');
  const [showPlacementWarning, setShowPlacementWarning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const registeredRef = useRef(false);
  const chunkSeqRef = useRef(0);

  // Listen for phase updates
  useEffect(() => {
    if (!socket) return;

    const onPhase = (payload: any) => {
      const p = payload?.phase || payload;
      setMessage(String(p));
    };

    const onStartMic = async () => {
      setMessage('Starting microphone...');
      if (status === 'idle') {
        console.log(`[Phone ${id}] Received start-mic, starting recording...`);
        await startRecording();
        emit('mic-permission', { granted: true });
      }
    };
    
    const onShowPlacement = (payload: any) => {
      setMessage(payload.message || 'Place phone on keyboard');
      setShowPlacementWarning(true);
    };
    
    const onStartOperation = () => {
      setMessage('Listening for keystrokes...');
    };
    
    const onInferenceResult = (payload: any) => {
      console.log('[INFERENCE] Detected keys:', payload.predictions);
      if (payload.predictions && payload.predictions.length > 0) {
        setMessage(`Detected: ${payload.predictions.join(', ')}`);
      }
    };

    socket.on('phase-update', onPhase);
    socket.on('start-mic', onStartMic);
    socket.on('show-placement', onShowPlacement);
    socket.on('start-operation', onStartOperation);
    socket.on('inference-result', onInferenceResult);

    return () => {
      socket.off('phase-update', onPhase);
      socket.off('start-mic', onStartMic);
      socket.off('show-placement', onShowPlacement);
      socket.off('start-operation', onStartOperation);
      socket.off('inference-result', onInferenceResult);
    };
  }, [socket, status, id, emit]);

  // Auto-register on connect
  useEffect(() => {
    if (connected && !registeredRef.current) {
      console.log(`[Phone ${id}] Auto-registering device`);
      emit('register', { deviceId: id });
      registeredRef.current = true;
      setMessage('Connected - waiting to start');
    }
  }, [connected, emit, id]);

  // Start recording
  async function startRecording() {
    try {
      setErrorMsg('');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        } 
      });
      streamRef.current = stream;
      
      // Create AudioContext
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      
      // Load audio worklet for precise capture
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      
      // Handle audio chunks from worklet
      workletNode.port.onmessage = (event) => {
        const { audioData } = event.data;
        
        const nowMs = performance.now();
        const clientEpochMs = performance.timeOrigin + nowMs;
        const clientTimestampNs = BigInt(Math.floor(clientEpochMs * 1_000_000));
        
        // Convert Float32Array to Int16 PCM
        const int16Data = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32768)));
        }
        
        // Send to server
        const meta = {
          deviceId: id,
          seq: chunkSeqRef.current++,
          clientTimestampNs: clientTimestampNs.toString(),
          sampleRate: 48000,
          channels: 1,
          format: 'pcm_s16le'
        };
        
        emit('audio-chunk', meta, int16Data.buffer);
      };
      
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      
      setStatus('recording');
      console.log(`[Phone ${id}] Recording started`);
      
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start recording');
      setStatus('error');
      console.error(`[Phone ${id}] Error:`, err);
    }
  }

  // Stop recording
  function stopRecording() {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStatus('idle');
    chunkSeqRef.current = 0;
    console.log(`[Phone ${id}] Recording stopped`);
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <SingleDeviceWarning 
        show={showPlacementWarning} 
        onConfirm={() => {
          setShowPlacementWarning(false);
          const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
          fetch(backend + '/api/session/start-operation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }).catch(err => console.error('Error starting operation:', err));
        }}
      />
      
      <h2>Phone {id}</h2>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 14 }}>
          {connected ? (
            <span style={{ color: 'green' }}>● Connected</span>
          ) : (
            <span style={{ color: 'gray' }}>● Disconnected</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: '#f7f7f8', minHeight: 48 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{message}</div>
      </div>
      
      {errorMsg && (
        <div style={{ marginTop: 12, padding: 12, background: '#fee', borderRadius: 8, color: '#c33' }}>
          {errorMsg}
        </div>
      )}
      
      {status === 'recording' && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{ 
            width: 60, 
            height: 60, 
            borderRadius: '50%', 
            background: '#4caf50',
            margin: '0 auto',
            animation: 'pulse 2s ease-in-out infinite'
          }}/>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(1.1); }
            }
          `}</style>
          <p style={{ marginTop: 12, color: '#666' }}>Recording...</p>
        </div>
      )}
    </div>
  );
}
