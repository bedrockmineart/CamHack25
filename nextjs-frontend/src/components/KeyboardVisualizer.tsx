'use client';

import React from 'react';

interface KeyboardVisualizerProps {
  currentKey?: string;
  devices?: { deviceId: string; x?: number; y?: number }[];
}

export default function KeyboardVisualizer({ currentKey, devices = [] }: KeyboardVisualizerProps) {
  // QWERTY keyboard layout
  const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  return (
    <div style={{ 
      padding: 24, 
      background: '#f5f5f5', 
      borderRadius: 12,
      display: 'inline-block'
    }}>
      <h3 style={{ marginBottom: 16, textAlign: 'center' }}>Keyboard Calibration</h3>
      
      {/* Keyboard */}
      <div style={{ marginBottom: 16 }}>
        {keyboardLayout.map((row, rowIndex) => (
          <div key={rowIndex} style={{ 
            display: 'flex', 
            gap: 4, 
            marginBottom: 4,
            marginLeft: rowIndex === 1 ? 20 : rowIndex === 2 ? 40 : 0 
          }}>
            {row.map(key => (
              <div
                key={key}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: currentKey === key ? '#2196f3' : '#fff',
                  color: currentKey === key ? '#fff' : '#333',
                  border: currentKey === key ? '3px solid #1976d2' : '2px solid #ddd',
                  borderRadius: 4,
                  fontWeight: currentKey === key ? 'bold' : 'normal',
                  fontSize: 16,
                  textTransform: 'uppercase',
                  cursor: 'default',
                  boxShadow: currentKey === key ? '0 4px 8px rgba(33, 150, 243, 0.3)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {key}
              </div>
            ))}
          </div>
        ))}
        
        {/* Spacebar */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'center' }}>
          <div
            style={{
              width: 240,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: currentKey === 'space' ? '#2196f3' : '#fff',
              color: currentKey === 'space' ? '#fff' : '#333',
              border: currentKey === 'space' ? '3px solid #1976d2' : '2px solid #ddd',
              borderRadius: 4,
              fontWeight: currentKey === 'space' ? 'bold' : 'normal',
              fontSize: 14,
              cursor: 'default',
              boxShadow: currentKey === 'space' ? '0 4px 8px rgba(33, 150, 243, 0.3)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            SPACE
          </div>
        </div>
      </div>

      {/* Device positions (placeholder - positions not calculated yet) */}
      {devices.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#666' }}>
            Device Positions (placeholder)
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {devices.map(device => (
              <div
                key={device.deviceId}
                style={{
                  padding: '4px 8px',
                  background: '#e3f2fd',
                  borderRadius: 4,
                  fontSize: 12,
                  border: '1px solid #2196f3'
                }}
              >
                {device.deviceId}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
