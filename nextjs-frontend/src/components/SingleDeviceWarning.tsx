'use client';

import React from 'react';

interface SingleDeviceWarningProps {
  show: boolean;
  onConfirm?: () => void;
}

export default function SingleDeviceWarning({ show, onConfirm }: SingleDeviceWarningProps) {
  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
      overflowY: 'auto'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 32,
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
        margin: 'auto'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24
        }}>
          <div style={{
            fontSize: 48,
            lineHeight: 1
          }}>⚠️</div>
          <h2 style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            color: '#333'
          }}>
            Single Device Mode
          </h2>
        </div>

        <div style={{
          fontSize: 16,
          lineHeight: 1.6,
          color: '#555',
          marginBottom: 24
        }}>
          <p style={{ marginTop: 0 }}>
            <strong>Only one device is connected.</strong> The system will use machine learning inference instead of triangulation.
          </p>
          
          <div style={{
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: 8,
            padding: 16,
            marginTop: 16,
            marginBottom: 16
          }}>
            <h3 style={{
              margin: '0 0 12px 0',
              fontSize: 18,
              fontWeight: 600,
              color: '#856404'
            }}>
              📍 Required Phone Placement:
            </h3>
            <ul style={{
              margin: 0,
              paddingLeft: 20,
              color: '#856404'
            }}>
              <li>Place your phone <strong>in the center of the keyboard</strong></li>
              <li>Position it between the <strong>G, H, B, N keys</strong></li>
              <li>The <strong>microphone should face down</strong> toward the keys</li>
              <li>Keep the phone <strong>stable and stationary</strong> during use</li>
              <li>Ensure there is <strong>minimal background noise</strong></li>
            </ul>
          </div>

          <p style={{
            fontSize: 14,
            color: '#666',
            margin: 0
          }}>
            <em>Note: This mode requires precise placement for accurate keystroke detection. For best results, use multiple devices with calibration.</em>
          </p>
        </div>

        <button
          onClick={() => {
            console.log('[SingleDeviceWarning] Continue button clicked');
            if (onConfirm) {
              onConfirm();
            }
          }}
          style={{
            width: '100%',
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: 600,
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#0056b3'}
          onMouseOut={(e) => e.currentTarget.style.background = '#007bff'}
        >
          I Understand - Continue
        </button>
      </div>
    </div>
  );
}
