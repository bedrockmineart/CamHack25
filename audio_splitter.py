from pydub import AudioSegment
from pydub.silence import split_on_silence
import os

# NOTE THIS DELETES THE LAST CLICK OF EACH FILE.
# --- Configuration ---
SOURCE_FILE_PATH = "./AI_AUDIO_FOLDER/a.m4a" # Folder containing your original audio files (a.wav, b.wav, etc.)
OUTPUT_DIR = "SPLIT_KEY_PRESSES" 

# Splitting parameters (you may need to adjust these based on your audio)
MIN_SILENCE_MS = 200     # Minimum duration (in ms) of silence to split on
SILENCE_THRESHOLD_DB = -45 # dBFS below which audio is considered silent
KEEP_SILENCE_MS = 100     # Keep this much silence padding on each side of the press

# Create output directory if it doesn't exist
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)
    print(f"Created output directory: {OUTPUT_DIR}")

# --- Main Logic ---
# Determine the base name (e.g., 'a' from 'a.wav') and the file path

print(f"\n--- Processing file: ---")

try:
    # Load the audio file
    sound = AudioSegment.from_file(SOURCE_FILE_PATH)
    
    # 2. Split Audio on Silence
    audio_chunks = split_on_silence(
        sound,
        min_silence_len=MIN_SILENCE_MS,
        silence_thresh=SILENCE_THRESHOLD_DB,
        keep_silence=KEEP_SILENCE_MS
    )
   
    # 3. Export Individual Segments with Sequential Naming
    for i, chunk in enumerate(audio_chunks):
        output_name = f"{i+1}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_name)
        
        # Export the chunk as a WAV file (you can change the format if needed)
        chunk.export(output_path, format="wav")
        
        print(f"  - Exported: {output_name}")

except Exception as e:
    print(f"ERROR processing file: {e}")
    print("Check your file path and ensure FFmpeg is correctly installed.")


print("\nAll files processed and segments exported.")