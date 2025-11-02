#!/usr/bin/env python3
"""
Compare audio characteristics between Voice Memos recordings and web recordings
"""

import sys
import numpy as np
import librosa
import soundfile as sf

def analyze_audio(filepath):
    """Analyze audio file and print characteristics"""
    print(f"\n{'='*60}")
    print(f"Analyzing: {filepath}")
    print(f"{'='*60}")
    
    # Load with librosa at 48000 Hz (same as Voice Memos and inference)
    y, sr = librosa.load(filepath, sr=48000, mono=True)
    
    # Get file info
    info = sf.info(filepath)
    print(f"\nFile Info:")
    print(f"  Original Sample Rate: {info.samplerate} Hz")
    print(f"  Channels: {info.channels}")
    print(f"  Duration: {info.duration:.2f}s")
    print(f"  Format: {info.format}")
    print(f"  Subtype: {info.subtype}")
    
    # Audio statistics
    print(f"\nAudio Statistics (after loading at 48000 Hz):")
    print(f"  Samples: {len(y)}")
    print(f"  Duration: {len(y)/sr:.2f}s")
    print(f"  Min: {np.min(y):.6f}")
    print(f"  Max: {np.max(y):.6f}")
    print(f"  Mean: {np.mean(y):.6f}")
    print(f"  Std Dev: {np.std(y):.6f}")
    print(f"  RMS: {np.sqrt(np.mean(y**2)):.6f}")
    print(f"  Peak: {np.max(np.abs(y)):.6f}")
    
    # Energy analysis
    energy = np.square(y)
    mean_energy = np.mean(energy)
    std_energy = np.std(energy)
    threshold = mean_energy + 0.5 * std_energy
    
    print(f"\nEnergy Analysis:")
    print(f"  Mean Energy: {mean_energy:.8f}")
    print(f"  Std Energy: {std_energy:.8f}")
    print(f"  Threshold (mean + 0.5*std): {threshold:.8f}")
    
    # Check for peaks
    from scipy.signal import find_peaks
    peaks, properties = find_peaks(energy, height=threshold, distance=int(0.8*0.30*sr))
    print(f"  Peaks found: {len(peaks)}")
    
    # Frequency analysis
    fft = np.fft.rfft(y)
    freq_magnitude = np.abs(fft)
    freqs = np.fft.rfftfreq(len(y), 1/sr)
    
    # Find dominant frequencies
    top_freqs_idx = np.argsort(freq_magnitude)[-10:][::-1]
    print(f"\nTop 10 Dominant Frequencies:")
    for idx in top_freqs_idx:
        print(f"  {freqs[idx]:.1f} Hz: magnitude {freq_magnitude[idx]:.2f}")
    
    # Check for DC offset
    dc_offset = np.mean(y)
    print(f"\nDC Offset: {dc_offset:.6f}")
    if abs(dc_offset) > 0.001:
        print(f"  ⚠️  WARNING: Significant DC offset detected!")
    
    # Check for clipping
    clipping_threshold = 0.99
    clipped_samples = np.sum(np.abs(y) > clipping_threshold)
    if clipped_samples > 0:
        print(f"\n⚠️  WARNING: {clipped_samples} samples appear clipped (>{clipping_threshold})")
    
    # Check dynamic range
    dynamic_range_db = 20 * np.log10(np.max(np.abs(y)) / (np.mean(np.abs(y)) + 1e-10))
    print(f"\nDynamic Range: {dynamic_range_db:.2f} dB")
    
    return y, sr

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 compare_audio.py <audio_file1> [audio_file2] ...")
        print("\nExample:")
        print("  python3 compare_audio.py ../temp/full_session_*.wav")
        print("  python3 compare_audio.py voice_memo_converted.wav web_recording.wav")
        sys.exit(1)
    
    for filepath in sys.argv[1:]:
        try:
            analyze_audio(filepath)
        except Exception as e:
            print(f"\n❌ Error analyzing {filepath}: {e}")
    
    print(f"\n{'='*60}")
    print("Analysis complete!")
    print(f"{'='*60}\n")
