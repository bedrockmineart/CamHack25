import { alignmentBuffer, TimeWindow } from './alignmentBuffer';

/**
 * Audio processor that consumes complete time windows from the alignment buffer
 * This is where you would implement your actual audio processing logic
 */

let processorInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Start the processor (polls for complete windows)
 */
export function startProcessor(intervalMs: number = 50) {
  if (processorInterval) {
    console.log('[Processor] Already running');
    return;
  }

  console.log(`[Processor] Starting (polling every ${intervalMs}ms)`);
  
  processorInterval = setInterval(() => {
    processNextWindow();
  }, intervalMs);
}

/**
 * Stop the processor
 */
export function stopProcessor() {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    console.log('[Processor] Stopped');
  }
}

/**
 * Process the next available complete window
 */
async function processNextWindow() {
  if (isProcessing) return;
  
  isProcessing = true;
  
  try {
    const window = alignmentBuffer.popCompleteWindow();
    
    if (!window) {
      // No complete window available yet
      return;
    }
    
    console.log(`[Processor] Processing window ${window.startNs} - ${window.endNs}`);
    
    // Example: Log chunk info from each device
    for (const [deviceId, chunks] of window.chunks) {
      const totalBytes = chunks.reduce((sum, c) => sum + c.buffer.length, 0);
      console.log(`  Device ${deviceId}: ${chunks.length} chunks, ${totalBytes} bytes`);
    }
    
    // TODO: Implement your actual processing logic here
    // Example use cases:
    // - Combine audio from all devices
    // - Analyze timing differences (TDOA)
    // - Detect key presses based on audio patterns
    // - Calculate triangulation from time-of-arrival data
    
    await processWindow(window);
    
  } finally {
    isProcessing = false;
  }
}

/**
 * Actual processing logic for a complete window
 * Replace this with your specific audio processing needs
 */
async function processWindow(window: TimeWindow) {
  // Example: Calculate timing deltas between devices
  const devices = Array.from(window.chunks.keys());
  
  if (devices.length < 2) return;
  
  // Get first chunk timestamp from each device
  const timestamps = new Map<string, bigint>();
  for (const [deviceId, chunks] of window.chunks) {
    if (chunks.length > 0) {
      timestamps.set(deviceId, chunks[0].alignedServerNs);
    }
  }
  
  // Calculate deltas (example: time difference between device pairs)
  const deltas: Record<string, string> = {};
  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const dev1 = devices[i];
      const dev2 = devices[j];
      const ts1 = timestamps.get(dev1);
      const ts2 = timestamps.get(dev2);
      
      if (ts1 && ts2) {
        const deltaNs = ts2 - ts1;
        const deltaMs = Number(deltaNs) / 1_000_000;
        deltas[`${dev1}-${dev2}`] = `${deltaMs.toFixed(3)}ms`;
      }
    }
  }
  
  console.log(`[Processor] Timing deltas:`, deltas);
}

/**
 * Get processor status
 */
export function getProcessorStatus() {
  return {
    running: processorInterval !== null,
    processing: isProcessing
  };
}
