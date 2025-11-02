# Debug Mode

## What is Debug Mode?

Debug mode records the **entire audio session** without doing any live inference. When you stop the session, it processes the complete recording all at once. This is useful for:

- Testing if the model works correctly without real-time complexity
- Getting better segmentation across the entire recording
- Debugging audio quality issues
- Analyzing longer sequences of keystrokes

## How to Use

### 1. Start Backend
```bash
cd backend
npm start
```

### 2. Start Frontend
```bash
cd nextjs-frontend
npm run dev
```

### 3. Enable Debug Mode
1. Go to the **Monitor page** (`http://localhost:3000/monitor`)
2. Connect your phone to the system
3. **Check the "Debug Mode" checkbox** before starting
4. Click **"Start Session"**

### 4. Record Your Session
1. Place phone as instructed
2. Click **"Start Operation"**
3. Type on your keyboard (multiple keys/words)
4. Click **"Stop Session"** when done

### 5. View Results
- The system will process the entire recording
- Check the console for detected keystrokes
- Audio is saved to `backend/temp/full_session_*.wav`
- Individual keystroke segments saved to `backend/temp/segments/`

## What Happens

### Normal Mode (Live Inference)
- ✅ Processes 850ms windows every 500ms
- ✅ Real-time keystroke detection
- ❌ More complex timing
- ❌ May miss keystrokes if CPU is slow

### Debug Mode
- ✅ Records entire session (no size limit)
- ✅ Processes everything when you stop
- ✅ Better segmentation across full audio
- ✅ Easier to debug
- ❌ No real-time feedback
- ❌ Only see results at the end

## Files Generated

- `backend/temp/full_session_TIMESTAMP.wav` - Complete recording
- `backend/temp/segments/segment_full_session_TIMESTAMP_N.wav` - Individual keystroke segments

## Tips

- Record at least 5-10 seconds with multiple keystrokes
- Type clearly with pauses between keys
- Check the full session WAV file to verify audio quality
- Listen to individual segments to see what the model is processing
