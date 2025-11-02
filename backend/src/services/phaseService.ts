import * as socketServer from './socketServer';

export type Phase = 'idle' | 'placement' | 'operation';

interface SessionState {
  phase: Phase;
  deviceId: string | null;
  micConfirmed: boolean;
  debugMode: boolean;
}

let state: SessionState = {
  phase: 'idle',
  deviceId: null,
  micConfirmed: false,
  debugMode: false
};

export function startSession(debugMode: boolean = true) {
  const connectedDevices = socketServer.getConnectedDevices();
  
  if (connectedDevices.length === 0) {
    console.warn('[PHASE] No devices connected');
    return { success: false, error: 'No devices connected', phase: state.phase };
  }
  
  if (connectedDevices.length > 1) {
    console.warn('[PHASE] Multiple devices - only single device supported');
    return { success: false, error: 'Only single device supported', phase: state.phase };
  }
  
  state.deviceId = connectedDevices[0];
  state.phase = 'placement';
  state.micConfirmed = false;
  state.debugMode = debugMode;
  
  console.log(`[PHASE] Starting session ${state.deviceId}${debugMode ? ' (DEBUG)' : ''}`);
  
  socketServer.emitToAll('start-mic', {});
  
  broadcastPhase('placement');
  socketServer.emitToAll('show-placement', {
    message: debugMode 
      ? 'DEBUG MODE: Recording session. Place phone and start. Stop to process.'
      : 'Place phone in center of keyboard, microphone facing keys.'
  });
  
  broadcastStatus();
  return { success: true, phase: state.phase, debugMode };
}

export function markMicConfirmed(deviceId: string) {
  if (deviceId === state.deviceId) {
    state.micConfirmed = true;
    console.log(`[PHASE] Mic confirmed for ${deviceId}`);
    broadcastStatus();
  }
}

export function startOperation() {
  if (state.phase !== 'placement') {
    return { success: false, error: 'Must be in placement phase' };
  }
  
  if (!state.micConfirmed) {
    return { success: false, error: 'Microphone not confirmed' };
  }
  
  state.phase = 'operation';
  broadcastPhase('operation');
  socketServer.emitToAll('start-operation', {});
  
  const inferenceService = require('./inferenceService');
  if (state.deviceId) {
    inferenceService.startInference(state.deviceId, state.debugMode);
  }
  
  broadcastStatus();
  console.log(`[PHASE] Operation started${state.debugMode ? ' (DEBUG)' : ''}`);
  return { 
    success: true, 
    phase: state.phase, 
    message: state.debugMode 
      ? 'Recording session - stop to process.' 
      : 'Listening for keystrokes.' 
  };
}

export function resetSession() {
  console.log('[PHASE] Resetting to idle');
  
  const inferenceService = require('./inferenceService');
  if (state.deviceId) {
    inferenceService.stopInference(state.deviceId);
  }
  
  state.phase = 'idle';
  state.deviceId = null;
  state.micConfirmed = false;
  state.debugMode = false;
  
  broadcastPhase('idle');
  broadcastStatus();
  return { success: true, phase: state.phase, message: 'Session reset.' };
}

export function getStatus() {
  return {
    phase: state.phase,
    deviceId: state.deviceId,
    connectedDevices: socketServer.getConnectedDevices(),
    micConfirmed: state.micConfirmed,
    debugMode: state.debugMode
  };
}

function broadcastPhase(phase: Phase) {
  socketServer.emitToAll('phase-update', { phase });
}

function broadcastStatus() {
  socketServer.emitToAll('status-update', getStatus());
}
