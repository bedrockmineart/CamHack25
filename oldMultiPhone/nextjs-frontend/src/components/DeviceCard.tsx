'use client';

import React from 'react';

type Props = {
  deviceId: string;
  lastAligned?: string;
  status?: 'connected' | 'disconnected' | 'idle';
  chunkCount?: number;
  isBackground?: boolean;
};

export default function DeviceCard({ deviceId, lastAligned, status = 'idle', chunkCount = 0, isBackground = false }: Props) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>{isBackground ? 'Background' : `Recorder ${deviceId}`}</h4>
        <div style={{ fontSize: 12, color: status === 'connected' ? 'green' : status === 'disconnected' ? 'red' : '#666' }}>{status}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#444' }}>Last aligned: {lastAligned ?? '—'}</div>
        <div style={{ fontSize: 12, color: '#444' }}>Chunks: {chunkCount}</div>
      </div>
    </div>
  );
}
