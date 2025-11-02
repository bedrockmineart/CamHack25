#!/usr/bin/env python3
"""
Standalone inference script for keystroke detection.
Takes an audio file path as input and outputs predicted keystrokes as JSON.
"""

import sys
import json
import numpy as np
import librosa
from scipy.signal import find_peaks

# Import the model and inference function from inference.py
try:
    from inference import run_model, segment_fixed, SR, FIXED_LEN
except ImportError as e:
    print(json.dumps([]), file=sys.stderr)
    print(f"Import error: {e}", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("ERROR: No audio file path provided", file=sys.stderr)
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)
    
    audio_file_path = sys.argv[1]
    print(f"[DEBUG] Loading audio file: {audio_file_path}", file=sys.stderr)
    
    try:
        # Load the audio file
        y, sr = librosa.load(audio_file_path, sr=SR, mono=True)
        print(f"[DEBUG] Audio loaded: duration={len(y)/sr:.2f}s, sample_rate={sr}Hz, samples={len(y)}", file=sys.stderr)
        
        # Segment the audio into individual keystrokes
        print(f"[DEBUG] Segmenting audio with fixed_len={FIXED_LEN}s", file=sys.stderr)
        segments = segment_fixed(y, sr, fixed_len=FIXED_LEN)
        print(f"[DEBUG] Found {len(segments)} keystroke segments", file=sys.stderr)
        
        if len(segments) == 0:
            # No keystrokes detected
            print("[DEBUG] No keystrokes detected, returning empty array", file=sys.stderr)
            print(json.dumps([]))
            sys.exit(0)
        
        # Run inference on each segment
        predictions = []
        for i, segment in enumerate(segments):
            try:
                print(f"[DEBUG] Running inference on segment {i+1}/{len(segments)}", file=sys.stderr)
                label = run_model(segment)
                print(f"[DEBUG] Segment {i+1} prediction: {label}", file=sys.stderr)
                predictions.append(label)
            except Exception as e:
                # If inference fails on a segment, log it but continue
                print(f"[WARNING] Failed to process segment {i+1}: {e}", file=sys.stderr)
                continue
        
        # Output predictions as JSON array
        print(f"[DEBUG] Final predictions: {predictions}", file=sys.stderr)
        print(json.dumps(predictions))
        sys.exit(0)
        
    except Exception as e:
        print(f"[ERROR] Failed to process audio file: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps([]))
        sys.exit(1)

if __name__ == "__main__":
    main()
