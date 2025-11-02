import * as socketServer from './socketServer';
import * as calibrationService from './calibrationService';
import { nowNs } from '../utils/time';

export type Phase = 
  | 'joining'
  | 'start-mic'
  | 'place-close'
  | 'play-tone'
  | 'place-keyboard'
  | 'keyboard-calibration'
  | 'operation'
  | 'idle';

// Diverse keys across the keyboard for proper calibration
const CALIBRATION_KEYS = ['q', 'p', 'a', 'l', 'space'];

interface SessionState {
  phase: Phase;
  expectedDevices: string[];
  micConfirmed: Set<string>;
  keypresses: Map<string, any[]>; // deviceId -> array of keypress events
  currentKeyIndex: number;
  calibrationKeys: string[];
  tonePlayedAtNs: bigint | null; // When monitor played calibration tone
}

let state: SessionState = {
  phase: 'idle',
  expectedDevices: [],
  micConfirmed: new Set(),
  keypresses: new Map(),
  currentKeyIndex: 0,
  calibrationKeys: CALIBRATION_KEYS,
  tonePlayedAtNs: null
};

export function setExpectedDevices(deviceIds: string[]) {
  state.expectedDevices = deviceIds;
}

export function startJoining() {
  state.phase = 'joining';
  state.micConfirmed.clear();
  state.keypresses.clear();
  // Don't lock devices yet - wait for start-mic
  broadcastPhase('joining');
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function startMicPhase() {
  // Lock in the currently connected devices as the expected devices for this session
  const connectedDevices = socketServer.getConnectedDevices();
  if (connectedDevices.length === 0) {
    console.warn('[PHASE] No devices connected, cannot start mic phase');
    return { success: false, error: 'No devices connected', phase: state.phase };
  }
  
  state.expectedDevices = connectedDevices;
  console.log(`[PHASE] Locked in expected devices: ${state.expectedDevices.join(', ')}`);
  
  state.phase = 'start-mic';
  broadcastPhase('start-mic');
  // Tell all devices to start their microphones
  socketServer.emitToAll('start-mic', {});
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function markMicConfirmed(deviceId: string) {
  state.micConfirmed.add(deviceId);
  console.log(`[PHASE] Mic confirmed for ${deviceId}. Total: ${state.micConfirmed.size}/${state.expectedDevices.length}`);
  broadcastStatus();
}

export function promptPlaceClose() {
  state.phase = 'place-close';
  broadcastPhase('place-close');
  socketServer.emitToAll('prompt-place-close', {});
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function broadcastPlayTone(deviceId?: string) {
  // Record when tone is played (server time)
  state.tonePlayedAtNs = nowNs();
  console.log(`[PHASE] Calibration tone played at server time: ${state.tonePlayedAtNs}`);
  
  // Start calibration mode to detect peaks, pass the tone play time
  calibrationService.startCalibration(state.tonePlayedAtNs);
  
  state.phase = 'play-tone';
  broadcastPhase('play-tone');
  if (deviceId) {
    socketServer.emitToDevice(deviceId, 'play-calibration-tone', {});
  } else {
    socketServer.emitToAll('play-calibration-tone', {});
  }
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function promptPlaceKeyboard() {
  state.phase = 'place-keyboard';
  broadcastPhase('place-keyboard');
  socketServer.emitToAll('prompt-place-keyboard', {});
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function startKeyboardCalibration() {
  state.phase = 'keyboard-calibration';
  state.keypresses.clear();
  state.currentKeyIndex = 0;
  broadcastPhase('keyboard-calibration');
  // Tell devices which key to calibrate first
  socketServer.emitToAll('calibrate-key', { 
    key: state.calibrationKeys[0],
    keyIndex: 0,
    totalKeys: state.calibrationKeys.length
  });
  broadcastStatus();
  return { success: true, phase: state.phase };
}

export function nextCalibrationKey() {
  if (state.phase !== 'keyboard-calibration') {
    return { success: false, error: 'Not in keyboard calibration phase' };
  }
  
  state.currentKeyIndex++;
  
  // Check if we've completed all keys
  if (state.currentKeyIndex >= state.calibrationKeys.length) {
    console.log('[PHASE] Keyboard calibration complete');
    return finishOperation();
  }
  
  const currentKey = state.calibrationKeys[state.currentKeyIndex];
  console.log(`[PHASE] Moving to calibration key ${state.currentKeyIndex + 1}/${state.calibrationKeys.length}: ${currentKey}`);
  
  // Tell devices which key to calibrate next
  socketServer.emitToAll('calibrate-key', { 
    key: currentKey,
    keyIndex: state.currentKeyIndex,
    totalKeys: state.calibrationKeys.length
  });
  broadcastStatus();
  
  return { 
    success: true, 
    currentKey,
    keyIndex: state.currentKeyIndex,
    totalKeys: state.calibrationKeys.length
  };
}

export function recordKeypress(deviceId: string, data: any) {
  if (!state.keypresses.has(deviceId)) {
    state.keypresses.set(deviceId, []);
  }
  state.keypresses.get(deviceId)!.push(data);
  console.log(`[PHASE] Keypress recorded for ${deviceId}. Total for device: ${state.keypresses.get(deviceId)!.length}`);
  broadcastStatus();
}

export function finishOperation() {
  state.phase = 'operation';
  broadcastPhase('operation');
  broadcastStatus();
  return { success: true, phase: state.phase, message: 'Calibration complete. System operational.' };
}

export function resetSession() {
  console.log('[PHASE] Resetting session to idle');
  state.phase = 'idle';
  state.expectedDevices = [];
  state.micConfirmed.clear();
  state.keypresses.clear();
  state.currentKeyIndex = 0;
  state.tonePlayedAtNs = null;
  
  // Stop any active calibration
  calibrationService.stopCalibration();
  
  broadcastPhase('idle');
  broadcastStatus();
  return { success: true, phase: state.phase, message: 'Session reset to idle.' };
}

export function getStatus() {
  return {
    phase: state.phase,
    expectedDevices: state.expectedDevices,
    connectedDevices: socketServer.getConnectedDevices(),
    micConfirmed: Array.from(state.micConfirmed),
    keypressCount: Object.fromEntries(
      Array.from(state.keypresses.entries()).map(([id, presses]) => [id, presses.length])
    ),
    currentKey: state.calibrationKeys[state.currentKeyIndex],
    keyIndex: state.currentKeyIndex,
    totalKeys: state.calibrationKeys.length
  };
}

function broadcastPhase(phase: Phase) {
  socketServer.emitToAll('phase-update', { phase });
}

function broadcastStatus() {
  socketServer.emitToAll('status-update', getStatus());
}
