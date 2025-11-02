# Audio Recording Comparison: Voice Memos vs Web Recording

## Summary of Differences

### Voice Memos (M4A → WAV)
- **Format**: M4A (AAC encoded) → converted to WAV
- **Sample Rate**: Typically 48 kHz or 44.1 kHz (iPhone standard)
- **Processing**: May include Apple's audio enhancements
- **Quality**: Professional mobile recording codec
- **Characteristics**: 
  - Natural AGC (Automatic Gain Control)
  - Noise reduction algorithms
  - Dynamic range compression
  - Optimized for voice/environmental recording

### Web Recording (Your Implementation)
- **Format**: Raw PCM via Web Audio API → WAV
- **Sample Rate**: 44.1 kHz (explicitly set)
- **Processing**: Flags set to disable (but may not be fully honored)
  - `echoCancellation: false`
  - `noiseSuppression: false`
  - `autoGainControl: false`
- **Quality**: Direct microphone capture
- **Characteristics**:
  - May still have browser-level processing
  - Different frequency response
  - Potentially more noise
  - Different dynamic range

## Potential Issues

### 1. **Browser Audio Processing**
Even with flags set to `false`, browsers may still apply:
- **Automatic Gain Control** (AGC) - adjusts volume automatically
- **Noise Suppression** - removes background noise
- **Echo Cancellation** - for video calls
- **High-pass filtering** - removes low frequencies

**Solution**: The browser constraints are hints, not guarantees. Mobile Safari/Chrome may ignore them entirely.

### 2. **Audio Normalization Differences**
- Voice Memos likely normalizes loudness
- Your web recording captures raw levels
- Model may be trained on normalized data

**Solution**: Add normalization to your audio before inference.

### 3. **Frequency Response**
- Phone microphones have different frequency responses
- Voice Memos may apply EQ
- Web Audio gets raw mic response

### 4. **DC Offset**
- Web audio may have DC offset (non-zero mean)
- Can affect energy detection and peak finding

## How to Diagnose

### Step 1: Compare Audio Files

Run the comparison script on both types of recordings:

```bash
cd /workspaces/CamHack25/backend/algorithm

# Compare a Voice Memo (converted to WAV) with a web recording
python3 compare_audio.py /path/to/voice_memo.wav ../temp/full_session_*.wav
```

Look for differences in:
- **RMS levels** - Should be similar
- **Peak values** - Check if clipping occurs
- **Mean Energy** - Affects peak detection
- **DC Offset** - Should be near 0
- **Dynamic Range** - Should be reasonable (20-40 dB)

### Step 2: Test with Debug Mode

1. **Enable Debug Mode** in the monitor UI
2. **Record a test session** typing the same keys
3. **Check the audio files**:
   - `backend/temp/full_session_*.wav` - Your web recording
   - Compare with your Voice Memo WAV file

### Step 3: Listen to the Audio

```bash
# On your local machine (if you have audio output):
play backend/temp/full_session_*.wav

# Or download and listen on your computer
```

Listen for:
- Volume levels (too quiet or too loud?)
- Background noise
- Clarity of keystrokes
- Any distortion or clipping

### Step 4: Check Segment Files

```bash
python3 run_inference.py ../temp/full_session_*.wav
```

Then listen to the segments:
```bash
ls -lh ../temp/segments/
# Listen to each segment to verify keystrokes were detected
```

## Possible Solutions

### Solution 1: Add Audio Normalization

Normalize audio before inference to match training data:

```python
# In run_inference.py, after loading:
y = y / (np.max(np.abs(y)) + 1e-10)  # Peak normalization
# OR
y = y / (np.std(y) + 1e-10) * 0.1    # RMS normalization
```

### Solution 2: Adjust Peak Detection Threshold

If web audio is quieter, lower the threshold:

```python
# In inference.py segment_fixed():
threshold = mean_energy + 0.3 * std_energy  # Lower from 0.5 to 0.3
```

### Solution 3: Apply High-Pass Filter

Remove DC offset and low-frequency noise:

```python
from scipy.signal import butter, filtfilt

def highpass_filter(y, sr, cutoff=80):
    nyq = sr / 2
    b, a = butter(4, cutoff / nyq, btype='high')
    return filtfilt(b, a, y)

# Apply after loading:
y = highpass_filter(y, sr)
```

### Solution 4: Try MediaRecorder API Instead

If Web Audio API has too much processing, try MediaRecorder:

```javascript
// Alternative approach - captures what the phone actually records
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000
});
```

But this would require converting opus/webm to WAV on the backend.

## Test Procedure

1. **Record same content** (type "hello world") using both methods:
   - Voice Memos on phone → convert to WAV
   - Web interface in Debug Mode
   
2. **Run comparison script** on both files

3. **Run inference** on both files:
   ```bash
   python3 run_inference.py voice_memo.wav
   python3 run_inference.py ../temp/full_session_*.wav
   ```

4. **Compare results**:
   - Number of segments detected
   - Predicted keystrokes
   - Confidence scores

5. **Adjust normalization/thresholds** based on findings

## Quick Test

```bash
# In backend/algorithm directory

# Test your Voice Memo file
python3 compare_audio.py /path/to/your/voice_memo.wav

# Record using web interface with Debug Mode, then test
python3 compare_audio.py ../temp/full_session_*.wav

# Compare side-by-side
python3 compare_audio.py /path/to/voice_memo.wav ../temp/full_session_*.wav
```

This will show you exactly what's different!
