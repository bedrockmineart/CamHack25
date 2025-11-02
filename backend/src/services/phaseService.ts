import * as socketServer from './socketServer';

export type Phase = 
  | 'idle'
  | 'placement'
  | 'operation';

interface SessionState {
  phase: Phase;
  deviceId: string | null;
  micConfirmed: boolean;
}

let state: SessionState = {
  phase: 'idle',
  deviceId: null,
  micConfirmed: false
};

export function startSession() {
  const connectedDevices = socketServer.getConnectedDevices();
  
  if (connectedDevices.length === 0) {
    console.warn('[PHASE] No devices connected');
    return { success: false, error: 'No devices connected', phase: state.phase };
  }
  
  if (connectedDevices.length > 1) {
    console.warn('[PHASE] Multiple devices detected. This system only supports single device.');
    return { success: false, error: 'Only single device supported', phase: state.phase };
  }
  
  state.deviceId = connectedDevices[0];
  state.phase = 'placement';
  state.micConfirmed = false;
  
  console.log(`[PHASE] Starting session with device ${state.deviceId}`);
  
  // Tell device to start microphone
  socketServer.emitToAll('start-mic', {});
  
  // Show placement instructions
  broadcastPhase('placement');
  socketServer.emitToAll('show-placement', {
    message: 'Place your phone in the center of the keyboard, with the microphone facing the keys.'
  });
  
  broadcastStatus();
  return { success: true, phase: state.phase };
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
  
  // Start inference service
  const inferenceService = require('./inferenceService');
  if (state.deviceId) {
    inferenceService.startInference(state.deviceId);
  }
  
  broadcastStatus();
  console.log('[PHASE] Operation started');
  return { success: true, phase: state.phase, message: 'System is now listening for keystrokes.' };
}

export function resetSession() {
  console.log('[PHASE] Resetting session to idle');
  
  // Stop inference if active
  const inferenceService = require('./inferenceService');
  inferenceService.stopInference();
  
  state.phase = 'idle';
  state.deviceId = null;
  state.micConfirmed = false;
  
  broadcastPhase('idle');
  broadcastStatus();
  return { success: true, phase: state.phase, message: 'Session reset to idle.' };
}

export function getStatus() {
  return {
    phase: state.phase,
    deviceId: state.deviceId,
    connectedDevices: socketServer.getConnectedDevices(),
    micConfirmed: state.micConfirmed
  };
}

function broadcastPhase(phase: Phase) {
  socketServer.emitToAll('phase-update', { phase });
}

function broadcastStatus() {
  socketServer.emitToAll('status-update', getStatus());
}
