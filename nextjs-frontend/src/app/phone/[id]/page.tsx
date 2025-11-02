'use client';

import React, { useEffect, useState, useRef, use } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import CalibrationInstructions from '../../../components/CalibrationInstructions';

export default function PhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { socket, emit, connected } = useSocket();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'recording' | 'error'>('idle');
  const [offsetNs, setOffsetNs] = useState<bigint | null>(null);
  const [chunksSent, setChunksSent] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [message, setMessage] = useState('Waiting to join');
  const [calibrationKey, setCalibrationKey] = useState<string>('');
  const [keyIndex, setKeyIndex] = useState<number>(0);
  const [totalKeys, setTotalKeys] = useState<number>(5);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const registeredRef = useRef(false);
  const chunkSeqRef = useRef(0);

  // Do not auto-register — require explicit join from user (Join button)
  useEffect(() => {
    // Listen for phase updates and short prompts
    if (!socket) return;

    const onPhase = (payload: any) => {
      const p = payload?.phase || payload;
      setMessage(String(p));
    };

    const onPromptPlaceClose = () => setMessage('Place phones close');
    
    const onStartMic = async () => {
      setMessage('Starting microphone');
      // Actually start recording when server tells us to
      if (status === 'idle') {
        console.log(`[Phone ${id}] Received start-mic, starting recording...`);
        await startRecording();
        // Notify server that mic permission was granted
        emit('mic-permission', { granted: true });
      }
    };
    
    const onPlayTone = () => {
      setMessage('Playing calibration tone');
      // TODO: Play calibration tone audio
    };
    
    const onPromptPlaceOnKeyboard = () => setMessage('Place on keyboard');
    
    const onCalibrateKey = (payload: any) => {
      setCalibrationKey(payload.key);
      setKeyIndex(payload.keyIndex);
      setTotalKeys(payload.totalKeys);
      setMessage(`Press key: ${payload.key}`);
    };

    socket.on('phase-update', onPhase);
    socket.on('prompt-place-close', onPromptPlaceClose);
    socket.on('start-mic', onStartMic);
    socket.on('play-calibration-tone', onPlayTone);
    socket.on('prompt-place-on-keyboard', onPromptPlaceOnKeyboard);
    socket.on('calibrate-key', onCalibrateKey);

    return () => {
      socket.off('phase-update', onPhase);
      socket.off('prompt-place-close', onPromptPlaceClose);
      socket.off('start-mic', onStartMic);
      socket.off('play-calibration-tone', onPlayTone);
      socket.off('prompt-place-on-keyboard', onPromptPlaceOnKeyboard);
      socket.off('calibrate-key', onCalibrateKey);
    };
  }, [socket, status, id, emit]);

  // Auto-register on connect so phone has no buttons
  useEffect(() => {
    if (connected && !registeredRef.current) {
      console.log(`[Phone ${id}] Auto-registering device`);
      emit('register', { deviceId: id });
      registeredRef.current = true;
      setMessage('Joined');
    }
  }, [connected, emit, id]);

  // Perform clock sync
  async function performClockSync() {
    if (!socket) return;
    setStatus('syncing');
    
    // Perform multiple pings to estimate offset
    const samples: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      // Use epoch time for clock sync (performance.timeOrigin + performance.now())
      const clientSendMs = performance.timeOrigin + performance.now();
      const clientSendNs = BigInt(Math.floor(clientSendMs * 1_000_000));
      
      await new Promise<void>((resolve) => {
        socket.emit('clock-ping', clientSendNs.toString(), (response: any) => {
          const clientRecvMs = performance.timeOrigin + performance.now();
          const clientRecvNs = BigInt(Math.floor(clientRecvMs * 1_000_000));
          const serverRecvNs = BigInt(response.serverRecvNs);
          const serverSendNs = BigInt(response.serverSendNs);
          
          // Estimate offset: offset = serverTime - clientTime
          // Use midpoint: offset ≈ ((serverRecv + serverSend)/2) - ((clientSend + clientRecv)/2)
          const serverMidNs = (serverRecvNs + serverSendNs) / BigInt(2);
          const clientMidNs = (clientSendNs + clientRecvNs) / BigInt(2);
          const offset = serverMidNs - clientMidNs;
          samples.push(offset);
          resolve();
        });
      });
      
      // Wait 100ms between pings
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Use median offset
    samples.sort((a, b) => Number(a - b));
    const medianOffset = samples[Math.floor(samples.length / 2)];
    setOffsetNs(medianOffset);
    
    // Send offset to server
    emit('register-offset', { deviceId: id, offsetNs: medianOffset.toString() });
    console.log(`[Phone ${id}] Clock sync complete. Offset: ${medianOffset}ns (${Number(medianOffset) / 1e6}ms)`);
  }

  // Start recording
  async function startRecording() {
    try {
      setErrorMsg('');
      
      // Perform clock sync first
      await performClockSync();
      
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
        
        // Use current time when we receive the chunk, not the AudioContext time
        // performance.now() gives ms since page load, performance.timeOrigin is epoch ms when page loaded
        const nowMs = performance.now();
        const clientEpochMs = performance.timeOrigin + nowMs;
        const clientTimestampNs = BigInt(Math.floor(clientEpochMs * 1_000_000)); // Convert ms to ns
        
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
        setChunksSent(prev => prev + 1);
      };
      
      source.connect(workletNode);
      workletNode.connect(audioContext.destination); // Optional: for monitoring
      
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
    setChunksSent(0);
    chunkSeqRef.current = 0;
    console.log(`[Phone ${id}] Recording stopped`);
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
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

      {calibrationKey && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
            Key {keyIndex + 1} of {totalKeys}
          </div>
          <div style={{ 
            fontSize: 72, 
            fontWeight: 'bold', 
            padding: 40, 
            background: '#e3f2fd',
            borderRadius: 16,
            margin: '0 auto',
            maxWidth: 200,
            border: '3px solid #2196f3'
          }}>
            {calibrationKey.toUpperCase()}
          </div>
          <button
            onClick={async () => {
              const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
              try {
                const res = await fetch(backend + '/api/session/next-key', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) {
                  console.error('Failed to advance key');
                }
              } catch (err) {
                console.error('Error calling next-key:', err);
              }
            }}
            style={{
              marginTop: 24,
              padding: '16px 32px',
              fontSize: 18,
              fontWeight: 600,
              background: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Next Key
          </button>
        </div>
      )}
    </div>
  );
}
