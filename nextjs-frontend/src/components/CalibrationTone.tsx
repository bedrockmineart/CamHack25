'use client';

import React, { useRef, useState } from 'react';

type CalibrationToneProps = {
  onPlay?: () => void;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function CalibrationTone({ onPlay }: CalibrationToneProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [status, setStatus] = useState('');

  const playCalibrationTone = async () => {
    try {
      setCalibrating(true);
      setStatus('Starting calibration...');

      // Tell backend to start watching for peaks
      await fetch(`${BACKEND_URL}/api/calibration/start`, { method: 'POST' });
      setStatus('Calibration active. Playing tone...');

      // Wait a brief moment for backend to be ready
      await new Promise(r => setTimeout(r, 200));

      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      }
      
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      
      // Create a sharp, loud tone that's easy to detect
      // Using a 2000Hz sine wave with quick attack/decay for clear peak
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 2000; // 2kHz - high enough to be distinct
      
      // Sharp envelope: 0 -> 1 in 5ms, hold for 50ms, decay to 0 in 5ms
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.8, now + 0.005); // 5ms attack
      gainNode.gain.setValueAtTime(0.8, now + 0.055); // hold 50ms
      gainNode.gain.linearRampToValueAtTime(0, now + 0.06); // 5ms decay
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start(now);
      oscillator.stop(now + 0.1); // Stop after 100ms
      
      console.log('[Calibration] Playing sync tone at', Date.now());
      onPlay?.();

      setStatus('Tone played. Detecting peaks...');

      // Wait for calibration window to complete (3 seconds)
      await new Promise(r => setTimeout(r, 3500));

      // Check calibration results
      const statusRes = await fetch(`${BACKEND_URL}/api/calibration/status`);
      const statusData = await statusRes.json();

      if (statusData.peaksDetected > 0) {
        setStatus(`✓ Calibration complete! Detected peaks on ${statusData.peaksDetected} device(s). Offsets adjusted.`);
      } else {
        setStatus('⚠ No peaks detected. Make sure devices are recording and volume is up.');
      }

      setCalibrating(false);

      // Clear status after 5 seconds
      setTimeout(() => setStatus(''), 5000);

    } catch (error) {
      console.error('[Calibration] Error:', error);
      setStatus('❌ Calibration failed. Check console for details.');
      setCalibrating(false);
    }
  };

  return (
    <div style={{ 
      padding: 20, 
      background: '#2a2a2a', 
      borderRadius: 8,
      marginBottom: 20 
    }}>
      <h3 style={{ marginTop: 0 }}>Audio Calibration</h3>
      <p style={{ fontSize: 14, color: '#aaa' }}>
        Place all devices close together and click the button to play a calibration tone.
        All recording devices should capture this tone, allowing the system to sync their timing.
      </p>
      <button
        onClick={playCalibrationTone}
        disabled={calibrating}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          fontWeight: 'bold',
          background: calibrating ? '#666' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: calibrating ? 'not-allowed' : 'pointer',
          opacity: calibrating ? 0.6 : 1
        }}
      >
        {calibrating ? '⏳ Calibrating...' : '🔊 Play Calibration Tone'}
      </button>
      {status && (
        <div style={{ 
          marginTop: 12, 
          padding: 10, 
          background: '#1a1a1a', 
          borderRadius: 4,
          fontSize: 14,
          color: status.startsWith('✓') ? '#4CAF50' : status.startsWith('⚠') ? '#FFA726' : status.startsWith('❌') ? '#F44336' : '#fff'
        }}>
          {status}
        </div>
      )}
    </div>
  );
}
