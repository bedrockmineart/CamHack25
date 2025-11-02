'use client';

import React, { useEffect, useRef } from 'react';

type DataPoint = {
  timestamp: number;
  rms: number;
};

type AudioLevelChartProps = {
  data: Map<string, DataPoint[]>; // deviceId -> array of data points
  devices: string[];
};

const DEVICE_COLORS: Record<string, string> = {
  '1': '#FF6384',
  '2': '#36A2EB',
  '3': '#FFCE56',
  'bg': '#4BC0C0'
};

export default function AudioLevelChart({ data, devices }: AudioLevelChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical lines (time grid)
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Use a fixed 5-second rolling window
    const WINDOW_SIZE_MS = 5000; // 5 seconds
    
    // Use current time as the end of the window (right edge)
    const now = Date.now();
    const maxTime = now;
    const minTime = now - WINDOW_SIZE_MS;
    const timeRange = WINDOW_SIZE_MS;

    // Find max RMS for scaling (zoom into small values)
    let maxRms = 0;
    for (const [_, points] of data) {
      for (const point of points) {
        maxRms = Math.max(maxRms, point.rms);
      }
    }
    
    // Set a minimum scale for visualization, with dynamic scaling for louder sounds
    const rmsScale = Math.max(maxRms * 1.2, 0.1); // At least 0.1 scale, or 120% of max

    // Draw waveforms for each device
    devices.forEach((deviceId) => {
      const points = data.get(deviceId) || [];
      if (points.length === 0) return;

      ctx.strokeStyle = DEVICE_COLORS[deviceId] || '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();

      let firstPoint = true;
      
      points.forEach((point) => {
        // Skip points outside the visible window
        if (point.timestamp < minTime || point.timestamp > maxTime) return;
        
        // Calculate X position based on timestamp relative to time range
        const x = ((point.timestamp - minTime) / timeRange) * width;
        
        // Calculate Y position: flip so 0 is at bottom, scale based on rmsScale
        const normalizedRms = Math.min(point.rms / rmsScale, 1.0); // Cap at 1.0
        const y = height - (normalizedRms * height);

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    });

    // Draw legend
    ctx.font = '12px monospace';
    let legendY = 20;
    devices.forEach((deviceId) => {
      ctx.fillStyle = DEVICE_COLORS[deviceId] || '#888';
      ctx.fillRect(10, legendY - 10, 15, 10);
      ctx.fillStyle = '#fff';
      const label = deviceId === 'bg' ? 'Background' : `Device ${deviceId}`;
      ctx.fillText(label, 30, legendY);
      legendY += 20;
    });

    // Draw scale labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    
    // Time labels
    const timeRangeSeconds = timeRange / 1000;
    ctx.fillText(`${timeRangeSeconds.toFixed(1)}s`, width - 40, height - 5);
    ctx.fillText('0s', 5, height - 5);
    
    // RMS scale labels
    ctx.fillText(`${rmsScale.toFixed(3)}`, 5, 15);
    ctx.fillText('0.000', 5, height - 15);

  }, [data, devices]);

  return (
    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#fff' }}>Audio Levels (Aligned)</h3>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={300}
        style={{ width: '100%', height: 'auto', maxHeight: 300 }}
      />
    </div>
  );
}
