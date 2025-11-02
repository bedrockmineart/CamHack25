#!/usr/bin/env python3

import sys
import os
import json
import numpy as np
import librosa
import soundfile as sf
from scipy.signal import find_peaks

try:
    from inference import run_model, segment_fixed, SR, FIXED_LEN
except ImportError as e:
    print(json.dumps([]), file=sys.stderr)
    print(f"Import error: {e}", file=sys.stderr)
    sys.exit(1)

SAVE_SEGMENTS = True
from pydub import AudioSegment

def convertm4a( input_path, output_path ):

    # Load .m4a file
    audio = AudioSegment.from_file(input_path, format="m4a")

    # Export as .wav
    audio.export(output_path, format="wav")
def main():
    if len(sys.argv) < 2:
        print("ERROR: No audio file provided", file=sys.stderr)
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)
    
    audio_file = sys.argv[1]
    print(f"Loading {audio_file}", file=sys.stderr)
    
    try:
        # Convert to WAV if not already WAV
        file_ext = os.path.splitext(audio_file)[1].lower()
        print(f"File extension detected: {file_ext}", file=sys.stderr)
        
        if file_ext in ['.m4a', '.mp3', '.aac', '.ogg', '.flac']:
            print(f"Non-WAV format detected, converting {file_ext} to WAV", file=sys.stderr)
            wav_file = audio_file.rsplit('.', 1)[0] + '_converted.wav'
            print(f"Conversion target: {wav_file}", file=sys.stderr)
            convertm4a(audio_file, wav_file)
            audio_file = wav_file
            print(f"Conversion complete. Using file: {audio_file}", file=sys.stderr)
        else:
            print(f"File is already WAV or supported format: {audio_file}", file=sys.stderr)
        
        print(f"Loading audio from: {audio_file}", file=sys.stderr)
        y, sr = librosa.load(audio_file, sr=SR, mono=True)
        duration = len(y) / sr
        print(f"Audio: {duration:.2f}s, {sr}Hz, {len(y)} samples", file=sys.stderr)
        print(f"Stats: min={np.min(y):.6f}, max={np.max(y):.6f}, rms={np.sqrt(np.mean(y**2)):.6f}", file=sys.stderr)

        is_full_session = 'full_session' in audio_file or 'upload' in audio_file

        if is_full_session:
            print(f"Processing full session ({duration:.2f}s)", file=sys.stderr)
        else:
            window_duration = 0.85
            window_samples = int(window_duration * sr)
            
            if len(y) > window_samples:
                y = y[-window_samples:]
                print(f"Using last {window_duration}s ({len(y)} samples)", file=sys.stderr)
            else:
                print(f"Using entire audio (< {window_duration}s)", file=sys.stderr)
        
        print(f"Segmenting with fixed_len={FIXED_LEN}s", file=sys.stderr)
        segments = segment_fixed(y, sr, fixed_len=FIXED_LEN)
        print(f"Found {len(segments)} segments", file=sys.stderr)
        
        if len(segments) == 0:
            print("No keystrokes detected", file=sys.stderr)
            print(json.dumps([]))
            sys.exit(0)
        
        predictions = []
        
        if SAVE_SEGMENTS:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            segments_dir = os.path.join(script_dir, '../temp/segments')
            os.makedirs(segments_dir, exist_ok=True)
            timestamp = os.path.basename(audio_file).replace('inference_', '').replace('.wav', '')
            print(f"Saving segments to {segments_dir}", file=sys.stderr)
        
        for i, segment in enumerate(segments):
            try:
                print(f"Processing segment {i+1}/{len(segments)}", file=sys.stderr)
                
                if SAVE_SEGMENTS:
                    segment_path = os.path.join(segments_dir, f'segment_{timestamp}_{i+1}.wav')
                    sf.write(segment_path, segment, SR)
                    print(f"Saved to {segment_path}", file=sys.stderr)
                
                label = run_model(segment)
                print(f"Segment {i+1}: {label}", file=sys.stderr)
                predictions.append(label)
            except Exception as e:
                print(f"Failed segment {i+1}: {e}", file=sys.stderr)
                continue
        
        print(f"Final: {predictions}", file=sys.stderr)
        print(json.dumps(predictions))
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps([]))
        sys.exit(1)

if __name__ == "__main__":
    main()
