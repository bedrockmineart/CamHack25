# GCC-PHAT Testing Guide

## Prerequisites

1. **Device 1 is mandatory** - It serves as the fixed reference (M₁)
2. All devices should be clustered within 5-10cm
3. Quiet environment for best results
4. Monitor has working speaker

## Quick Test Steps

### 1. Start Backend
```bash
cd /workspaces/CamHack25/backend
npm start
```

### 2. Start Frontend
```bash
cd /workspaces/CamHack25/nextjs-frontend
npm run dev
```

### 3. Connect Devices

**On Monitor (Computer):**
- Open: `http://localhost:3000/monitor`

**On Phone 1 (REQUIRED):**
- Open: `http://localhost:3000/phone/1`

**On Phone 2:**
- Open: `http://localhost:3000/phone/2`

**On Phone 3 (optional):**
- Open: `http://localhost:3000/phone/3`

### 4. Run Calibration Flow

1. **Click "Start Session"** on monitor
   - Status changes to `joining`
   - Connected devices: should show 1, 2, (3)

2. **Click "Start Microphones"** on monitor
   - Status changes to `start-mic`
   - All phones start recording
   - Device lock activates (only connected devices allowed)

3. **Click "Place Devices Close Together"** on monitor
   - Status changes to `place-close`
   - Position phones within 5-10cm, pointing toward speaker

4. **Click "Play Calibration Tone"** on monitor
   - Status changes to `play-tone`
   - **Monitor plays 500ms click/pop sound**
   - Backend automatically collects waveforms for 3 seconds
   - Watch monitor UI for waveform collection status:
     ```
     📊 Device 1: 144000 samples (3000ms)
     📊 Device 2: 144000 samples (3000ms)
     📊 Device 3: 144000 samples (3000ms)
     ```

5. **Wait for GCC-PHAT to complete** (~3-5 seconds)
   - Monitor shows: "✅ GCC-PHAT Calibration Complete!"
   - Check results:
     ```
     Method: GCC-PHAT Cross-Correlation
     Reference Device: 1 (M₁)
     Devices Calibrated: 3
     
     Time Offsets (sub-millisecond precision):
     • Device 1: REFERENCE (0.000ms)
     • Device 2: 0.127ms (6 samples) Confidence: 87.3% | Sharpness: 4.52x
     • Device 3: -0.083ms (-4 samples) Confidence: 91.1% | Sharpness: 5.21x
     ```

6. **If needed, click "Play Again"** to retry calibration

7. **Click "Continue"** to proceed to keyboard calibration

## Expected Results

### Good Calibration
- **Confidence**: 60-95%
- **Sharpness**: 3.0-8.0x
- **Offsets**: -1ms to +1ms (for phones within 10cm)
- **Sample differences**: Usually <50 samples @ 48kHz

### Marginal Calibration
- **Confidence**: 40-60%
- **Sharpness**: 2.0-3.0x
- **Action**: Try "Play Again", reduce background noise

### Poor Calibration
- **Confidence**: <40%
- **Sharpness**: <2.0x
- **Possible causes**:
  - Background noise too high
  - Devices too far apart
  - Speaker volume too low
  - One device didn't record
- **Action**: Check connections, increase volume, retry

## Debugging

### Check Backend Console
```bash
# Look for these log messages:
[CALIBRATION] Started GCC-PHAT mode. Tone played at: ...
[CALIBRATION] Buffered X samples from device Y...
[CALIBRATION] Starting GCC-PHAT cross-correlation analysis...
[CALIBRATION] Using device 1 as fixed reference (M₁)
[CALIBRATION] Running GCC-PHAT correlation between M₁ and M2...
[CALIBRATION] Complete. Offsets adjusted using GCC-PHAT cross-correlation.
```

### Check for Errors
```bash
# Common errors:
ERROR: Reference device 1 not found!
  → Device 1 must be connected before calibration

Need at least 2 devices for GCC-PHAT calibration.
  → Connect more devices

# Check device registry:
[SOCKET] Device registered: 1
[SOCKET] Device registered: 2
```

### Verify Waveform Collection
Monitor UI should show increasing sample counts:
```
📊 Device 1: 48000 samples (1000.0ms)
📊 Device 2: 48000 samples (1000.0ms)
...updating every ~100ms...
📊 Device 1: 144000 samples (3000.0ms)
📊 Device 2: 144000 samples (3000.0ms)
```

If stuck at 0 samples:
- Check mic permissions on phones
- Verify recording started (check phone UI for red recording indicator)
- Check network connectivity

## Performance Benchmarks

### Expected Timing
- **Tone play**: 500ms
- **Waveform collection**: 3000ms
- **GCC-PHAT computation**: 50-200ms (depends on device count)
- **Total**: ~3.5-4 seconds

### Memory Usage
- **Per device**: ~200KB buffered audio
- **5 devices**: ~1MB total (acceptable)

### CPU Usage
- **FFT computation**: Brief spike during correlation
- **Normal operation**: Minimal overhead

## Phone Spacing Experiments

Try different phone positions to see precision:

### Experiment 1: Tight Cluster (2cm apart)
- **Expected offset difference**: ~0.06ms
- **GCC-PHAT should measure**: 0.04-0.08ms

### Experiment 2: Medium Spacing (5cm apart)
- **Expected offset difference**: ~0.15ms
- **GCC-PHAT should measure**: 0.13-0.17ms

### Experiment 3: Wide Spacing (10cm apart)
- **Expected offset difference**: ~0.30ms
- **GCC-PHAT should measure**: 0.28-0.32ms

### Experiment 4: Very Close (<1cm apart)
- **Expected offset difference**: <0.03ms
- **GCC-PHAT precision limit**: ~0.02ms (1 sample @ 48kHz)

## Troubleshooting Tips

### 1. Low Confidence Values
**Problem**: All devices show <50% confidence

**Solutions**:
- Increase speaker volume
- Move devices closer to speaker (30-50cm optimal)
- Reduce background noise
- Check all devices are recording

### 2. One Device Shows Poor Correlation
**Problem**: Device X has confidence <30%, others >70%

**Solutions**:
- Check Device X microphone (may be obstructed)
- Check Device X placement (may be facing away)
- Verify Device X is recording (check RMS levels in chart)

### 3. Reference Device Not Found
**Problem**: "ERROR: Reference device 1 not found!"

**Solutions**:
- Connect Device 1 before starting calibration
- Check Device 1 is recording
- Verify Device 1 socket connection (check backend logs)

### 4. No Waveforms Collected
**Problem**: Waveform status shows 0 devices

**Solutions**:
- Check mic permissions on all phones
- Verify "Start Microphones" was clicked
- Check socket connections (should see "Device registered" in logs)
- Refresh phone pages and reconnect

## Next Steps After Calibration

1. **Keyboard Calibration**: Click "Continue" to enter keyboard calibration phase
2. **Monitor Charts**: Check Audio Level Chart for synchronized RMS values
3. **Test Operation**: Enter operation mode to test triangulation

## Known Limitations

1. **Minimum precision**: ~0.02ms (1 sample @ 48kHz)
2. **Maximum range**: ~1 meter (physical sound travel time becomes significant)
3. **Processing delay**: 3-4 seconds (acceptable for one-time calibration)
4. **Device 1 requirement**: Must be present and recording

## Success Criteria

✅ All devices show confidence >60%  
✅ All devices show sharpness >3.0x  
✅ Offsets make physical sense (proportional to distance)  
✅ Reference device (1) shows 0.000ms  
✅ Calibration completes within 4 seconds  

---

**Ready to test!** Start with 2-3 devices for initial validation.
