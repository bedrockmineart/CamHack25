# Sample Rate Standardization: 48000 Hz

## Summary

The entire system has been standardized to use **48000 Hz** to match iPhone Voice Memos recordings.

## What librosa.load() Does

```python
y, sr = librosa.load(audio_file, sr=48000, mono=True)
```

This does:
1. **Loads** the audio file (any format: WAV, M4A, MP3, etc.)
2. **Resamples** to exactly 48000 Hz (if original is different)
3. **Converts** to mono (averages channels if stereo)
4. **Returns** audio at exactly 48000 Hz, regardless of input

### Examples:
- Voice Memo at **48000 Hz** → Loads as-is → **48000 Hz** ✅
- Web recording at **48000 Hz** → Loads as-is → **48000 Hz** ✅  
- Old recording at **44100 Hz** → Resamples up → **48000 Hz** ✅
- Video audio at **44100 Hz** → Resamples up → **48000 Hz** ✅

**All files are processed at 48000 Hz internally**, ensuring consistency.

## System Configuration

### Frontend (Phone Recording)
**File**: `nextjs-frontend/src/app/phone/[id]/page.tsx`

```typescript
// Microphone constraints
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000  // ✅ Match Voice Memos
  } 
});

// AudioContext
const audioContext = new AudioContext({ sampleRate: 48000 });

// Metadata sent to server
const meta = {
  sampleRate: 48000,  // ✅ Explicitly set
  // ...
};
```

### Backend (Audio Processing)
**File**: `backend/src/services/inferenceService.ts`

```typescript
// Buffer configuration
let audioBuffer: AudioBuffer = {
  sampleRate: 48000,  // ✅ Match Voice Memos
  // ...
};

// Validation in addAudioChunk()
const targetRate = 48000;
if (sampleRate !== targetRate) {
  console.warn(`[INFERENCE] Unexpected sample rate: ${sampleRate}Hz (expected ${targetRate}Hz)`);
}
```

**File**: `backend/src/sockets/audioSocket.ts`

```typescript
// Default fallback
inferenceService.addAudioChunk(samples, nowNs(), meta.sampleRate || 48000);
```

### Python (ML Inference)
**File**: `backend/algorithm/inference.py`

```python
# Global configuration
SR = 48000  # ✅ Match Voice Memos/iPhone sample rate

# Usage in segmentation
def segment_fixed(y, sr, fixed_len=FIXED_LEN):
    fixed_samples = int(fixed_len * sr)  # Automatically uses 48000
    # ...
```

**File**: `backend/algorithm/run_inference.py`

```python
# Load audio
y, sr = librosa.load(audio_file_path, sr=SR, mono=True)
# All files resampled to 48000 Hz ✅
```

**File**: `backend/algorithm/compare_audio.py`

```python
# Analysis at consistent rate
y, sr = librosa.load(filepath, sr=48000, mono=True)
# Compare apples-to-apples ✅
```

## Benefits of 48000 Hz

1. **Matches iPhone standard** - Voice Memos uses 48 kHz
2. **Better frequency resolution** - More samples = more detail
3. **Standard pro audio rate** - Used in video (48 kHz is video standard)
4. **No loss when recording** - Native mic rate on many devices
5. **Consistent processing** - All audio treated identically

## What Changed from 44100 Hz

| Component | Before | After |
|-----------|--------|-------|
| Frontend AudioContext | 44100 Hz | **48000 Hz** |
| Frontend metadata | 44100 Hz | **48000 Hz** |
| Backend buffer | 44100 Hz | **48000 Hz** |
| Python SR | 44100 Hz | **48000 Hz** |
| Audio validation | 44100 Hz | **48000 Hz** |

## Verifying Sample Rate

### Check a WAV file:
```bash
# Using Python
cd /workspaces/CamHack25/backend/algorithm
python3 -c "import soundfile as sf; print(sf.info('path/to/file.wav'))"

# Or use the comparison tool
python3 compare_audio.py path/to/file.wav
```

### Check live recording:
Look for this log when audio chunks arrive:
```
[SOCKET] audio-chunk from device123 size=8192 bytes, sampleRate=48000Hz
```

### Check inference processing:
```
[DEBUG] Audio loaded: duration=4.52s, sample_rate=48000Hz, samples=217088
```

## Troubleshooting

### If you see "Unexpected sample rate" warning:
```
[INFERENCE] Unexpected sample rate: 44100Hz (expected 48000Hz)
```

**Cause**: Frontend not recording at 48000 Hz (browser may have ignored constraint)

**Solution**: Check browser console for warnings, or try different browser. The backend will still process it, but quality may differ.

### If segments aren't detected:
The window sizes are now different:
- 0.85s at 48000 Hz = **40,800 samples** (was 37,485 at 44100 Hz)
- 0.30s at 48000 Hz = **14,400 samples** (was 13,230 at 44100 Hz)

Peak detection may need adjustment if audio is very quiet.

## Testing

### Quick test:
```bash
cd /workspaces/CamHack25/backend/algorithm

# Test Voice Memo (should show 48000 Hz native)
python3 compare_audio.py /path/to/voice_memo.m4a

# Test web recording (should show 48000 Hz)
python3 compare_audio.py ../temp/full_session_*.wav

# Both should now have identical sample rates ✅
```

### Full test:
1. Record in Debug Mode from web interface
2. Record same content in Voice Memos
3. Convert Voice Memo to WAV
4. Compare both:
   ```bash
   python3 compare_audio.py voice_memo.wav ../temp/full_session_*.wav
   ```
5. Both should show:
   - `Original Sample Rate: 48000 Hz`
   - Similar RMS and energy characteristics

## Summary

✅ **All components now use 48000 Hz consistently**  
✅ **Matches Voice Memos standard**  
✅ **librosa.load() resamples everything to 48000 Hz**  
✅ **No sample rate mismatches**  
✅ **Better audio quality and resolution**
