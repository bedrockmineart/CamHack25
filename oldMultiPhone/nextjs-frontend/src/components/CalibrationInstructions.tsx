'use client';

import React from 'react';

type CalibrationInstructionsProps = {
  deviceId: string;
  isRecording: boolean;
};

export default function CalibrationInstructions({ deviceId, isRecording }: CalibrationInstructionsProps) {
  if (!isRecording) {
    return null; // Only show when recording
  }

  return (
    <div style={{ 
      padding: 16, 
      background: '#2a2a2a', 
      borderRadius: 8,
      marginBottom: 16,
      border: '2px solid #4CAF50'
    }}>
      <h4 style={{ marginTop: 0, color: '#4CAF50' }}>📍 Calibration Ready</h4>
      <p style={{ fontSize: 14, color: '#ccc', margin: '8px 0' }}>
        Device <strong>{deviceId}</strong> is recording and ready for calibration.
      </p>
      <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>
        ✓ Place all devices close together (within 1 meter)<br/>
        ✓ Go to the monitor page and click "Play Calibration Tone"<br/>
        ✓ The system will automatically sync timing based on the audio peak
      </p>
    </div>
  );
}
