'use client';

import React from 'react';
import DeviceCard from './DeviceCard';

type DeviceInfo = {
  deviceId: string;
  lastAligned?: string;
  status?: 'connected' | 'disconnected' | 'idle';
  chunkCount?: number;
  isBackground?: boolean;
};

export default function MonitorGrid({ devices }: { devices: DeviceInfo[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {devices.map((d) => (
        <DeviceCard key={d.deviceId} deviceId={d.deviceId} lastAligned={d.lastAligned} status={d.status} chunkCount={d.chunkCount} isBackground={d.isBackground} />
      ))}
    </div>
  );
}
