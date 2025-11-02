import { nowNs } from '../utils/time';

type DeviceId = string;

type AlignedAudioChunk = {
  deviceId: DeviceId;
  buffer: Buffer;
  alignedServerNs: bigint;
  seq: number;
  sampleRate: number;
  channels: number;
};

type TimeWindow = {
  startNs: bigint;
  endNs: bigint;
  chunks: Map<DeviceId, AlignedAudioChunk[]>;
};

// Configuration
const WINDOW_SIZE_MS = 100; // 100ms windows
const WINDOW_SIZE_NS = BigInt(WINDOW_SIZE_MS * 1_000_000);
const MAX_WINDOWS = 50; // Keep last 5 seconds of data
const ALIGNMENT_TOLERANCE_NS = BigInt(10_000_000); // 10ms tolerance

class AlignmentBuffer {
  private windows: TimeWindow[] = [];
  private expectedDevices: Set<DeviceId> = new Set();

  /**
   * Register expected devices (e.g., '1', '2', '3', 'bg')
   */
  setExpectedDevices(deviceIds: DeviceId[]) {
    this.expectedDevices = new Set(deviceIds);
    console.log(`[AlignmentBuffer] Expected devices:`, Array.from(this.expectedDevices));
  }

  /**
   * Add a chunk to the appropriate time window
   */
  addChunk(chunk: AlignedAudioChunk) {
    const windowIndex = this.getOrCreateWindow(chunk.alignedServerNs);
    const window = this.windows[windowIndex];
    
    if (!window.chunks.has(chunk.deviceId)) {
      window.chunks.set(chunk.deviceId, []);
    }
    
    window.chunks.get(chunk.deviceId)!.push(chunk);
    
    // Sort chunks by sequence number
    window.chunks.get(chunk.deviceId)!.sort((a, b) => a.seq - b.seq);
    
    // Clean up old windows
    this.pruneOldWindows();
  }

  /**
   * Get or create a window for the given timestamp
   */
  private getOrCreateWindow(timestampNs: bigint): number {
    // Calculate window start time (round down to nearest window boundary)
    const windowStart = (timestampNs / WINDOW_SIZE_NS) * WINDOW_SIZE_NS;
    const windowEnd = windowStart + WINDOW_SIZE_NS;
    
    // Find existing window
    const existingIndex = this.windows.findIndex(w => w.startNs === windowStart);
    if (existingIndex !== -1) {
      return existingIndex;
    }
    
    // Create new window
    const newWindow: TimeWindow = {
      startNs: windowStart,
      endNs: windowEnd,
      chunks: new Map()
    };
    
    this.windows.push(newWindow);
    
    // Sort windows by start time
    this.windows.sort((a, b) => Number(a.startNs - b.startNs));
    
    // Return index of new window
    return this.windows.findIndex(w => w.startNs === windowStart);
  }

  /**
   * Remove windows older than MAX_WINDOWS
   */
  private pruneOldWindows() {
    if (this.windows.length > MAX_WINDOWS) {
      const removed = this.windows.splice(0, this.windows.length - MAX_WINDOWS);
      console.log(`[AlignmentBuffer] Pruned ${removed.length} old windows`);
    }
  }

  /**
   * Get all windows that have data from all expected devices
   */
  getCompleteWindows(): TimeWindow[] {
    return this.windows.filter(window => {
      // Check if all expected devices have sent data for this window
      for (const deviceId of this.expectedDevices) {
        if (!window.chunks.has(deviceId) || window.chunks.get(deviceId)!.length === 0) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get the oldest complete window and remove it from buffer
   */
  popCompleteWindow(): TimeWindow | null {
    const completeWindows = this.getCompleteWindows();
    if (completeWindows.length === 0) {
      return null;
    }
    
    const oldestWindow = completeWindows[0];
    const index = this.windows.indexOf(oldestWindow);
    this.windows.splice(index, 1);
    
    return oldestWindow;
  }

  /**
   * Get statistics about the buffer
   */
  getStats() {
    const completeCount = this.getCompleteWindows().length;
    const incompleteCount = this.windows.length - completeCount;
    
    const deviceCounts = new Map<DeviceId, number>();
    for (const window of this.windows) {
      for (const [deviceId, chunks] of window.chunks) {
        deviceCounts.set(deviceId, (deviceCounts.get(deviceId) || 0) + chunks.length);
      }
    }
    
    return {
      totalWindows: this.windows.length,
      completeWindows: completeCount,
      incompleteWindows: incompleteCount,
      deviceChunkCounts: Object.fromEntries(deviceCounts),
      oldestWindowNs: this.windows.length > 0 ? this.windows[0].startNs.toString() : null,
      newestWindowNs: this.windows.length > 0 ? this.windows[this.windows.length - 1].startNs.toString() : null
    };
  }

  /**
   * Clear all windows
   */
  clear() {
    this.windows = [];
  }
}

// Singleton instance
const alignmentBuffer = new AlignmentBuffer();

export { alignmentBuffer, AlignedAudioChunk, TimeWindow };
