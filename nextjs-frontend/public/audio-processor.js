// Audio Worklet Processor for capturing audio with precise timestamps
// This runs in the audio worklet thread

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // chunks of 4096 samples
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true; // Keep processor alive
    }

    const inputChannel = input[0]; // mono (first channel)
    
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      // When buffer is full, send it to main thread
      if (this.bufferIndex >= this.bufferSize) {
        // Copy buffer to avoid mutation
        const chunk = new Float32Array(this.buffer);
        
        // Send with current audio context time
        this.port.postMessage({
          audioData: chunk,
          timestamp: currentTime // AudioContext time in seconds
        });
        
        this.bufferIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
