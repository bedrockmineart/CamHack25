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
  const [uploading, setUploading] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const registeredRef = useRef(false);
  const chunkSeqRef = useRef(0);

  useEffect(() => {
    if (!socket) return;

    const onPhase = (payload: any) => {
      const p = payload?.phase || payload;
      setMessage(String(p));
    };

    const onStartMic = async () => {
      setMessage('Starting microphone...');
      if (status === 'idle') {
        console.log(`Phone ${id} starting recording`);
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
      console.log('Detected keys:', payload.predictions);
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

  useEffect(() => {
    if (connected && !registeredRef.current) {
      console.log(`Phone ${id} registering`);
      emit('register', { deviceId: id });
      registeredRef.current = true;
      setMessage('Connected - waiting to start');
    }
  }, [connected, emit, id]);

  async function startRecording() {
    try {
      setErrorMsg('');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        } 
      });
      streamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      
      workletNode.port.onmessage = (event) => {
        const { audioData } = event.data;
        
        const nowMs = performance.now();
        const clientEpochMs = performance.timeOrigin + nowMs;
        const clientTimestampNs = BigInt(Math.floor(clientEpochMs * 1_000_000));
        
        const int16Data = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32768)));
        }
        
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
      console.log(`Phone ${id} recording started`);
      
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start recording');
      setStatus('error');
      console.error(`Phone ${id} error:`, err);
    }
  }

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
    console.log(`Phone ${id} stopped`);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg('');
    setMessage(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('deviceId', id);

      const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backend}/api/audio/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);

      if (result.predictions && result.predictions.length > 0) {
        setMessage(`Detected: ${result.predictions.join(', ')}`);
      } else {
        setMessage('Upload complete - no keystrokes detected');
      }

    } catch (err: any) {
      setErrorMsg(err.message || 'Upload failed');
      setMessage('Upload failed');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <SingleDeviceWarning 
        show={showPlacementWarning} 
        onConfirm={() => {
          console.log('User confirmed placement');
          setShowPlacementWarning(false);
          
          const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
          console.log('Starting operation');
          
          fetch(backend + '/api/session/start-operation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
            .then(res => {
              console.log('Operation started:', res.status);
              return res.json();
            })
            .then(data => console.log(data))
            .catch(err => console.error('Error starting operation:', err));
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

      <div style={{ 
        marginTop: 30, 
        padding: 20, 
        border: '2px dashed #ccc', 
        borderRadius: 12, 
        textAlign: 'center',
        background: '#fafafa'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>
          Upload Voice Memo
        </h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
          Select a voice memo file (M4A, WAV, MP3) to analyze
        </p>
        <label style={{ 
          display: 'inline-block',
          padding: '12px 24px',
          background: uploading ? '#ccc' : '#2196F3',
          color: 'white',
          borderRadius: 8,
          cursor: uploading ? 'not-allowed' : 'pointer',
          fontSize: 16,
          fontWeight: 600
        }}>
          {uploading ? 'Uploading...' : 'Choose File'}
          <input 
            type="file" 
            accept="audio/*,.m4a"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
          Supported: M4A, WAV, MP3, and other audio formats
        </p>
      </div>
    </div>
  );
}
