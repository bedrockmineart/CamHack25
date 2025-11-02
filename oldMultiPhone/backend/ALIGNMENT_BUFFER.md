# Audio Alignment Buffer System

## Overview

The alignment buffer system collects audio chunks from multiple devices and organizes them into time windows for synchronized processing.

## How It Works

### 1. Time Windows
- Audio chunks are grouped into 100ms time windows
- Windows are identified by their start timestamp (aligned to window boundaries)
- Each window contains chunks from all active devices

### 2. Alignment Process
1. Devices stream audio chunks with high-resolution timestamps
2. Server receives chunks and applies clock offset correction
3. Aligned chunks are added to the appropriate time window
4. When a window has data from ALL expected devices, it's marked "complete"
5. Processor consumes complete windows in chronological order

### 3. Configuration
```typescript
WINDOW_SIZE_MS = 100          // 100ms windows
MAX_WINDOWS = 50              // Keep last 5 seconds
ALIGNMENT_TOLERANCE_NS = 10ms // Tolerance for timestamp matching
```

## API Endpoints

### Buffer Statistics
```bash
GET /api/buffer-stats
```
Returns:
- Total windows in buffer
- Complete vs incomplete windows
- Chunk counts per device
- Oldest/newest window timestamps

### Processor Control
```bash
POST /api/processor/start   # Start consuming windows
POST /api/processor/stop    # Stop processor
GET  /api/processor/status  # Get processor state
```

## Usage Example

### Start Recording on Multiple Devices
1. Open `/phone/1`, `/phone/2`, `/phone/3`, `/phone/bg`
2. Click "Start Recording" on each
3. Devices begin streaming audio chunks

### Check Buffer Status
```bash
curl http://localhost:5000/api/buffer-stats
```

Expected response:
```json
{
  "totalWindows": 15,
  "completeWindows": 12,
  "incompleteWindows": 3,
  "deviceChunkCounts": {
    "1": 48,
    "2": 47,
    "3": 48,
    "bg": 46
  },
  "oldestWindowNs": "1730469123000000000",
  "newestWindowNs": "1730469124500000000"
}
```

### Start Processor
```bash
curl -X POST http://localhost:5000/api/processor/start
```

The processor will:
- Poll for complete windows every 50ms
- Pop the oldest complete window
- Process synchronized audio from all devices
- Log timing deltas between device pairs

## Processing Logic

The processor in `services/processor.ts` demonstrates basic window processing:

1. **Extract chunks** from each device in the window
2. **Calculate timing deltas** between devices
3. **Implement custom logic** (e.g., TDOA, key detection)

Example output:
```
[Processor] Processing window 1730469123000000000 - 1730469123100000000
  Device 1: 4 chunks, 32768 bytes
  Device 2: 4 chunks, 32768 bytes
  Device 3: 4 chunks, 32768 bytes
  Device bg: 4 chunks, 32768 bytes
[Processor] Timing deltas: { '1-2': '0.123ms', '1-3': '0.456ms', '2-3': '0.333ms' }
```

## Key Features

✅ **Sub-millisecond alignment** - Uses BigInt nanosecond timestamps  
✅ **Clock sync** - Each device performs 5-ping median offset calculation  
✅ **Sliding window** - Keeps last 5 seconds of data in memory  
✅ **Complete detection** - Only processes when all devices have data  
✅ **Real-time** - Processes windows as they become complete

## Next Steps

Customize `services/processor.ts` to implement your specific audio analysis:
- TDOA (Time Difference of Arrival) for localization
- Key press detection from audio patterns
- Multi-device audio combining
- Cross-correlation analysis
