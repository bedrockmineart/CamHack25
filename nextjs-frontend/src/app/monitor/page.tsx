'use client';

import React, { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';

export default function MonitorPage() {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<string>('idle');
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [inferenceResults, setInferenceResults] = useState<Array<{ keys: string[]; timestamp: number }>>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    
    const onStatusUpdate = (status: any) => {
      setSessionStatus(status);
      setPhase(status.phase || 'idle');
      setDeviceId(status.deviceId || null);
    };
    
    socket.on('status-update', onStatusUpdate);
    
    const onInferenceResult = (data: any) => {
      if (data.predictions && data.predictions.length > 0) {
        setInferenceResults(prev => [
          { keys: data.predictions, timestamp: data.timestamp || Date.now() },
          ...prev.slice(0, 19)
        ]);
      }
    };
    
    socket.on('inference-result', onInferenceResult);
    
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    fetch(backend + '/api/session/status')
      .then(res => res.json())
      .then(status => {
        setSessionStatus(status);
        setPhase(status.phase || 'idle');
        setDeviceId(status.deviceId || null);
      })
      .catch(err => console.error('Failed to fetch initial status:', err));
    
    return () => {
      socket.off('status-update', onStatusUpdate);
      socket.off('inference-result', onInferenceResult);
    };
  }, [socket]);

  const postEndpoint = async (path: string) => {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    try {
      const res = await fetch(backend + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        console.error(`Failed to POST ${path}`);
      }
    } catch (err) {
      console.error(`Error calling ${path}:`, err);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <h1>Keystroke Detection Monitor</h1>
      <p style={{ color: '#666' }}>Single-device acoustic keystroke detection</p>

      <div style={{ display: 'flex', gap: 24, padding: 16, background: '#f5f5f5', borderRadius: 8, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Server</div>
          <div style={{ fontWeight: 600 }}>{connected ? 'Connected' : 'Disconnected'}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Device</div>
          <div style={{ fontWeight: 600 }}>{deviceId ? `Phone ${deviceId}` : 'Not connected'}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Status</div>
          <div style={{ fontWeight: 600 }}>{phase}</div>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {phase === 'idle' && (
            <button onClick={() => postEndpoint('/api/session/start')} disabled={!connected}>
              Start Session
            </button>
          )}
          {phase !== 'idle' && (
            <button onClick={() => postEndpoint('/api/session/reset')} disabled={!connected}>
              Stop Session
            </button>
          )}
        </div>
      </div>

      {inferenceResults.length > 0 && (
        <div>
          <h3>Detected Keystrokes</h3>
          {inferenceResults.map((result, idx) => (
            <div key={idx} style={{ padding: 8, background: 'white', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 12, color: '#999' }}>{new Date(result.timestamp).toLocaleTimeString()}</span>
              {' - '}
              <strong>{result.keys.join(', ')}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
