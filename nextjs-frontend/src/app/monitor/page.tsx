'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import MonitorGrid from '../../components/MonitorGrid';
import AudioLevelChart from '../../components/AudioLevelChart';
import KeyboardVisualizer from '../../components/KeyboardVisualizer';

type DataPoint = {
  timestamp: number;
  rms: number;
};

export default function MonitorPage() {
  const { socket, connected, alignedChunks } = useSocket();
  const [phase, setPhase] = useState<string>('idle');
  const [chartData, setChartData] = useState<Map<string, DataPoint[]>>(new Map());
  const [joinedDevices, setJoinedDevices] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [waveformStatus, setWaveformStatus] = useState<Map<string, { samples: number; durationMs: string }>>(new Map());
  const [calibrationResult, setCalibrationResult] = useState<any>(null);

  // Listen for status updates via socket instead of polling
  useEffect(() => {
    if (!socket) return;
    
    const onStatusUpdate = (status: any) => {
      console.log('[Monitor] Status update:', status);
      setSessionStatus(status);
      setJoinedDevices(new Set(status.connectedDevices || []));
      setPhase(status.phase || 'idle');
    };
    
    socket.on('status-update', onStatusUpdate);
    
    // Listen for waveform collection during GCC-PHAT calibration
    const onWaveformCollected = (data: any) => {
      console.log('[Monitor] Waveform collected:', data);
      setWaveformStatus(prev => {
        const newStatus = new Map(prev);
        newStatus.set(data.deviceId, {
          samples: data.samplesCollected,
          durationMs: data.durationMs
        });
        return newStatus;
      });
    };
    
    const onCalibrationComplete = (data: any) => {
      console.log('[Monitor] Calibration complete:', data);
      setCalibrationResult(data);
      // Clear waveform status after a few seconds
      setTimeout(() => {
        setWaveformStatus(new Map());
      }, 5000);
    };
    
    socket.on('calibration-waveform-collected', onWaveformCollected);
    socket.on('calibration-complete', onCalibrationComplete);
    
    // Request initial status on connect
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    fetch(backend + '/api/session/status')
      .then(res => res.json())
      .then(status => {
        setSessionStatus(status);
        setJoinedDevices(new Set(status.connectedDevices || []));
        setPhase(status.phase || 'idle');
      })
      .catch(err => console.error('Failed to fetch initial status:', err));
    
    return () => {
      socket.off('status-update', onStatusUpdate);
      socket.off('calibration-waveform-collected', onWaveformCollected);
      socket.off('calibration-complete', onCalibrationComplete);
    };
  }, [socket]);

  // Update chart data when new chunks arrive
  useEffect(() => {
    const newData = new Map(chartData);
    const now = Date.now();
    const maxAge = 5000; // Keep 5 seconds of data

    // Add new chunks
    for (const chunk of alignedChunks.slice(0, 10)) { // Process last 10 chunks
      if (!chunk.rms) continue;
      
      // Convert nanoseconds to milliseconds
      // alignedServerNs is a string representation of nanoseconds
      const timestampNs = BigInt(chunk.alignedServerNs);
      const timestamp = Number(timestampNs / BigInt(1000000)); // Convert ns to ms
      
      if (!newData.has(chunk.deviceId)) {
        newData.set(chunk.deviceId, []);
      }
      
      const deviceData = newData.get(chunk.deviceId)!;
      
      // Only add if not duplicate (check last timestamp)
      if (deviceData.length === 0 || deviceData[deviceData.length - 1].timestamp !== timestamp) {
        deviceData.push({ timestamp, rms: chunk.rms });
      }
    }

    // Prune old data
    for (const [deviceId, points] of newData) {
      newData.set(
        deviceId,
        points.filter(p => now - p.timestamp < maxAge)
      );
    }

    setChartData(newData);
  }, [alignedChunks]);

  // Listen for phase updates from server
  useEffect(() => {
    if (!socket) return;
    
    // Join the processors room to receive device events
    socket.emit('join:processor');
    console.log('[Monitor] Joined processors room');
    
    return () => {
      // Cleanup if needed
    };
  }, [socket]);

  async function postEndpoint(path: string, body?: any) {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    try {
      const res = await fetch(backend + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Non-OK response from', path, res.status, text);
        return { ok: false, status: res.status, body: text };
      }
      // Try to parse JSON but handle HTML/text fallback
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return await res.json();
      const text = await res.text();
      return { ok: true, body: text };
    } catch (err) {
      console.error('Error calling', path, err);
      return null;
    }
  }

  function playCalibrationTone() {
    // Reset calibration state
    setWaveformStatus(new Map());
    setCalibrationResult(null);
    
    const audioContext = new AudioContext();
    const duration = 0.5; // 500ms - short and sharp
    
    // Create a click/pop sound - very sharp transient for easy alignment
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate a sharp click followed by a decay
    // This creates a very distinctive waveform that's easy to align
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      if (t < 0.005) {
        // Sharp attack - a click
        data[i] = Math.sin(2 * Math.PI * 1000 * t) * (1 - t / 0.005);
      } else {
        // Quick decay
        const decay = Math.exp(-(t - 0.005) * 20);
        data[i] = Math.sin(2 * Math.PI * 1000 * t) * decay * 0.5;
      }
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
    
    console.log('[Monitor] Playing calibration tone');
  }

  // derive per-device summary from alignedChunks
  const devices = useMemo(() => {
    const map = new Map<string, { lastAligned?: string; chunkCount: number; lastSeenMs: number; phase?: string }>();
    const now = Date.now();
    
    for (const c of alignedChunks) {
      const prev = map.get(c.deviceId) || { chunkCount: 0, lastSeenMs: 0 };
      const alignedMs = Number(BigInt(c.alignedServerNs) / BigInt(1000000));
      map.set(c.deviceId, { 
        lastAligned: new Date(alignedMs).toISOString(), 
        chunkCount: prev.chunkCount + 1,
        lastSeenMs: now, // chunks are in reverse order, so first seen is most recent
        phase: sessionStatus?.devicePhases?.[c.deviceId] || phase
      });
    }
    
  // ensure known device slots: include joined devices plus default slots
  const defaultIds = ['1', '2', '3', 'bg'];
  const ids = Array.from(new Set([...(Array.from(joinedDevices || [])), ...defaultIds]));
  return ids.map((id) => {
      const deviceData = map.get(id);
      const hasData = !!deviceData;
      const isRecent = hasData && (now - deviceData.lastSeenMs) < 5000; // seen in last 5 seconds
      
      let status: 'connected' | 'disconnected' | 'idle';
      if (!hasData) {
        status = 'idle';
      } else if (isRecent) {
        status = 'connected';
      } else {
        status = 'disconnected';
      }
      
      return { 
        deviceId: id, 
        lastAligned: deviceData?.lastAligned, 
        chunkCount: deviceData?.chunkCount || 0, 
        status, 
        isBackground: id === 'bg' 
      };
    });
  }, [alignedChunks, joinedDevices]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Live Monitor</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>Socket: <strong>{connected ? 'connected' : 'disconnected'}</strong></div>
        <div style={{ marginLeft: 12 }}>Phase: <strong>{phase}</strong></div>
        {sessionStatus && (
          <div style={{ marginLeft: 12, fontSize: 14, opacity: 0.7 }}>
            Devices: {sessionStatus.connectedDevices?.length || 0}
            {sessionStatus.expectedDevices?.length > 0 && ` (locked: ${sessionStatus.expectedDevices.join(', ')})`}
            {phase === 'start-mic' && ` | Mic Confirmed: ${sessionStatus.micConfirmed?.length || 0}/${sessionStatus.expectedDevices?.length || 0}`}
          </div>
        )}

        <div style={{ marginLeft: 'auto' }}>
          {(() => {
            const mapping: Record<string, { label: string; path: string; enabledWhen?: () => boolean; onClick?: () => void } | null> = {
              'idle': { 
                label: 'Start Session', 
                path: '/api/session/start-joining'
              },
              'joining': { 
                label: 'Start Mic', 
                path: '/api/session/start-mic',
                enabledWhen: () => {
                  // Wait for at least some devices to connect
                  const connectedCount = sessionStatus?.connectedDevices?.length || 0;
                  return connectedCount >= 1;
                }
              },
              'start-mic': { 
                label: 'Confirm Placement', 
                path: '/api/session/place-close',
                enabledWhen: () => {
                  // Wait for all expected devices to confirm mic
                  const expectedCount = sessionStatus?.expectedDevices?.length || 4;
                  const confirmedCount = sessionStatus?.micConfirmed?.length || 0;
                  return confirmedCount >= expectedCount;
                }
              },
              'place-close': { 
                label: 'Play Calibration Tone', 
                path: '/api/session/play-tone',
                onClick: () => {
                  // Play tone from monitor, then notify backend
                  playCalibrationTone();
                }
              },
              'play-tone': null, // Special case: show two buttons
              'place-keyboard': { label: 'Start Keyboard Calibration', path: '/api/session/start-keyboard-cal' },
              'keyboard-calibration': null, // Keys advance automatically, visualizer shows progress
              'align': { label: 'Play Calibration Tone', path: '/api/session/play-tone' },
              'operation': null
            };

            const action = mapping[phase] ?? null;
            if (!action && phase !== 'play-tone' && phase !== 'keyboard-calibration') return <span style={{ opacity: 0.6 }}>No action</span>;

            // Special case: after playing calibration tone, show two buttons
            if (phase === 'play-tone') {
              return (
                <>
                  <button
                    onClick={() => {
                      playCalibrationTone();
                    }}
                    disabled={!connected}
                    style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600,
                      opacity: connected ? 1 : 0.5,
                      cursor: connected ? 'pointer' : 'not-allowed',
                      marginRight: '8px'
                    }}
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => postEndpoint('/api/session/place-keyboard')}
                    disabled={!connected}
                    style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600,
                      opacity: connected ? 1 : 0.5,
                      cursor: connected ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => postEndpoint('/api/session/reset')}
                    disabled={!connected}
                    style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600,
                      marginLeft: '8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: connected ? 'pointer' : 'not-allowed',
                      opacity: connected ? 1 : 0.5
                    }}
                  >
                    Reset Session
                  </button>
                </>
              );
            }

            // Special case: keyboard calibration shows progress
            if (phase === 'keyboard-calibration') {
              const keyIndex = sessionStatus?.keyIndex ?? 0;
              const totalKeys = sessionStatus?.totalKeys ?? 5;
              const currentKey = sessionStatus?.currentKey ?? '';
              
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      Calibrating key {keyIndex + 1}/{totalKeys}: {currentKey.toUpperCase()}
                    </span>
                    <div style={{ 
                      width: 100, 
                      height: 8, 
                      background: '#e0e0e0', 
                      borderRadius: 4,
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        width: `${((keyIndex + 1) / totalKeys) * 100}%`,
                        height: '100%',
                        background: '#4caf50',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                  <button
                    onClick={() => postEndpoint('/api/session/reset')}
                    disabled={!connected}
                    style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600,
                      marginLeft: '8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: connected ? 'pointer' : 'not-allowed',
                      opacity: connected ? 1 : 0.5
                    }}
                  >
                    Reset Session
                  </button>
                </>
              );
            }

            const isEnabled = connected && (!action.enabledWhen || action.enabledWhen());

            return (
              <>
                <button
                  onClick={() => {
                    if (action.onClick) action.onClick();
                    postEndpoint(action.path);
                  }}
                  disabled={!isEnabled}
                  style={{ 
                    padding: '8px 12px', 
                    fontWeight: 600,
                    opacity: isEnabled ? 1 : 0.5,
                    cursor: isEnabled ? 'pointer' : 'not-allowed'
                  }}
                >
                  {action.label}
                </button>
                {phase !== 'idle' && (
                  <button
                    onClick={() => postEndpoint('/api/session/reset')}
                    disabled={!connected}
                    style={{ 
                      padding: '8px 12px', 
                      fontWeight: 600,
                      marginLeft: '8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: connected ? 'pointer' : 'not-allowed',
                      opacity: connected ? 1 : 0.5
                    }}
                  >
                    Reset Session
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <MonitorGrid devices={devices} />
      
      {phase === 'play-tone' && (
        <div style={{ marginTop: 20, padding: 16, background: '#fff3cd', borderRadius: 8, border: '1px solid #ffc107' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>📡 GCC-PHAT Calibration in Progress</h4>
          <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#856404' }}>
            Collecting audio waveforms from all devices for cross-correlation analysis...
          </p>
          
          {/* Show waveform collection status */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {Array.from(waveformStatus.entries()).map(([deviceId, status]) => (
              <div
                key={deviceId}
                style={{
                  padding: '6px 12px',
                  background: '#17a2b8',
                  color: 'white',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>📊</span>
                <span>Device {deviceId}</span>
                <span style={{ opacity: 0.8 }}>
                  {status.samples} samples ({status.durationMs}ms)
                </span>
              </div>
            ))}
            {waveformStatus.size === 0 && (
              <div style={{ fontSize: 13, color: '#856404', fontStyle: 'italic' }}>
                Waiting for waveforms...
              </div>
            )}
          </div>
          
          {/* Show calibration result */}
          {calibrationResult && (
            <div style={{ marginTop: 12, padding: 12, background: '#d4edda', borderRadius: 4, border: '1px solid #28a745' }}>
              <div style={{ fontWeight: 600, color: '#155724', marginBottom: 8 }}>
                ✅ GCC-PHAT Calibration Complete!
              </div>
              <div style={{ fontSize: 13, color: '#155724' }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Method:</strong> {calibrationResult.method || 'GCC-PHAT Cross-Correlation'}
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Reference Device:</strong> {calibrationResult.referenceDevice} (M₁)
                </div>
                <div><strong>Devices Calibrated:</strong> {calibrationResult.deviceCount}</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #c3e6cb' }}>
                  <strong>Time Offsets (sub-millisecond precision):</strong>
                  {calibrationResult.devices?.map((d: any) => (
                    <div key={d.deviceId} style={{ marginLeft: 12, marginTop: 4, fontFamily: 'monospace' }}>
                      • Device {d.deviceId}: 
                      {d.isReference ? (
                        <span style={{ fontWeight: 'bold', color: '#0056b3' }}> REFERENCE (0.000ms)</span>
                      ) : (
                        <>
                          <span style={{ fontWeight: 'bold' }}> {d.delayMs.toFixed(3)}ms</span>
                          <span style={{ opacity: 0.7 }}> ({d.delaySamples} samples)</span>
                          <span style={{ marginLeft: 8, opacity: 0.8 }}>
                            Confidence: {(d.confidence * 100).toFixed(1)}% | 
                            Sharpness: {d.sharpness.toFixed(2)}x
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {phase === 'keyboard-calibration' && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <KeyboardVisualizer 
            currentKey={sessionStatus?.currentKey}
            devices={devices.map(d => ({ deviceId: d.deviceId }))}
          />
        </div>
      )}
      
      <div style={{ marginTop: 20 }}>
        <AudioLevelChart data={chartData} devices={['1', '2', '3', 'bg']} />
      </div>
      
      <div style={{ marginTop: 20 }}>
        <h3>Recent aligned chunks</h3>
        <ul>
          {alignedChunks.slice(0, 50).map((c, i) => {
            const alignedMs = Number(BigInt(c.alignedServerNs) / BigInt(1000000));
            return (
              <li key={`${c.deviceId}-${i}`}>{`${c.deviceId} @ ${new Date(alignedMs).toISOString()} (${c.length} bytes, RMS: ${(c.rms || 0).toFixed(4)})`}</li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
