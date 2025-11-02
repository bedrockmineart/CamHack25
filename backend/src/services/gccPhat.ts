/**
 * GCC-PHAT (Generalized Cross-Correlation with Phase Transform)
 * 
 * Implements time delay estimation between two audio signals using
 * cross-correlation in the frequency domain with phase transform weighting.
 * 
 * Provides sub-millisecond precision for time-of-arrival measurements.
 */

import FFT from 'fft.js';

export interface GccPhatResult {
  /** Time delay in samples (positive means signal2 is delayed relative to signal1) */
  delaySamples: number;
  /** Time delay in seconds */
  delaySeconds: number;
  /** Correlation peak strength (0-1, higher is better) */
  confidence: number;
  /** Sharpness of correlation peak (higher is better) */
  sharpness: number;
}

/**
 * Apply Hamming window to reduce spectral leakage
 */
function applyHammingWindow(signal: Float32Array): Float32Array {
  const N = signal.length;
  const windowed = new Float32Array(N);
  
  for (let n = 0; n < N; n++) {
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
    windowed[n] = signal[n] * window;
  }
  
  return windowed;
}

/**
 * Find next power of 2 >= n for efficient FFT
 */
function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Zero-pad signal to target length
 */
function zeroPad(signal: Float32Array, targetLength: number): Float32Array {
  if (signal.length >= targetLength) {
    return signal;
  }
  
  const padded = new Float32Array(targetLength);
  padded.set(signal);
  return padded;
}

/**
 * Convert Float32Array to format expected by fft.js [real, imag, real, imag, ...]
 */
function toComplexArray(signal: Float32Array): number[] {
  const complex: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    complex.push(signal[i]); // real
    complex.push(0);          // imag
  }
  return complex;
}

/**
 * Compute GCC-PHAT cross-correlation between two signals
 * 
 * @param signal1 Reference signal (e.g., from device M₁)
 * @param signal2 Target signal (e.g., from device Mᵢ)
 * @param sampleRate Sample rate in Hz (e.g., 48000)
 * @returns Time delay estimation with confidence metrics
 */
export function computeGccPhat(
  signal1: Float32Array,
  signal2: Float32Array,
  sampleRate: number
): GccPhatResult {
  // Ensure signals are same length
  const maxLen = Math.max(signal1.length, signal2.length);
  const fftSize = nextPowerOf2(maxLen);
  
  // Apply windowing to reduce spectral leakage
  const windowed1 = applyHammingWindow(signal1);
  const windowed2 = applyHammingWindow(signal2);
  
  // Zero-pad to FFT size
  const padded1 = zeroPad(windowed1, fftSize);
  const padded2 = zeroPad(windowed2, fftSize);
  
  // Initialize FFT
  const fft = new FFT(fftSize);
  
  // Convert to complex format
  const complex1 = toComplexArray(padded1);
  const complex2 = toComplexArray(padded2);
  
  // Compute FFTs
  const freq1 = fft.createComplexArray();
  const freq2 = fft.createComplexArray();
  fft.realTransform(freq1, complex1);
  fft.realTransform(freq2, complex2);
  
  // Compute cross-power spectrum with PHAT weighting
  // PHAT: R₁₂(ω) = X₁(ω) × X₂*(ω) / |X₁(ω) × X₂*(ω)|
  const crossPower = new Array(fftSize * 2);
  
  for (let i = 0; i < fftSize; i++) {
    const idx = i * 2;
    
    // X₁(ω)
    const real1 = freq1[idx];
    const imag1 = freq1[idx + 1];
    
    // X₂(ω)
    const real2 = freq2[idx];
    const imag2 = freq2[idx + 1];
    
    // Complex conjugate multiplication: X₁(ω) × X₂*(ω)
    const crossReal = real1 * real2 + imag1 * imag2;
    const crossImag = imag1 * real2 - real1 * imag2;
    
    // Magnitude: |X₁(ω) × X₂*(ω)|
    const magnitude = Math.sqrt(crossReal * crossReal + crossImag * crossImag);
    
    // PHAT normalization (avoid division by zero)
    const epsilon = 1e-10;
    const normalizedMag = magnitude + epsilon;
    
    crossPower[idx] = crossReal / normalizedMag;
    crossPower[idx + 1] = crossImag / normalizedMag;
  }
  
  // Inverse FFT to get correlation in time domain
  const correlation = fft.createComplexArray();
  fft.inverseTransform(correlation, crossPower);
  
  // Extract real part and find peak
  const correlationReal = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    correlationReal[i] = correlation[i * 2]; // real part only
  }
  
  // Find peak in correlation (checking both positive and negative lags)
  let maxCorr = -Infinity;
  let maxIdx = 0;
  
  // Check positive lags [0, fftSize/2)
  for (let i = 0; i < fftSize / 2; i++) {
    if (correlationReal[i] > maxCorr) {
      maxCorr = correlationReal[i];
      maxIdx = i;
    }
  }
  
  // Check negative lags [fftSize/2, fftSize) -> map to negative values
  for (let i = fftSize / 2; i < fftSize; i++) {
    if (correlationReal[i] > maxCorr) {
      maxCorr = correlationReal[i];
      maxIdx = i - fftSize; // Convert to negative lag
    }
  }
  
  // Calculate confidence (normalized peak value)
  const confidence = Math.min(Math.max(maxCorr / fftSize, 0), 1);
  
  // Calculate sharpness (ratio of peak to mean)
  let sumCorr = 0;
  for (let i = 0; i < fftSize; i++) {
    sumCorr += Math.abs(correlationReal[i]);
  }
  const meanCorr = sumCorr / fftSize;
  const sharpness = meanCorr > 0 ? Math.abs(maxCorr) / meanCorr : 0;
  
  const delaySamples = maxIdx;
  const delaySeconds = delaySamples / sampleRate;
  
  return {
    delaySamples,
    delaySeconds,
    confidence,
    sharpness
  };
}

/**
 * Extract segment around calibration tone from audio buffer
 * 
 * @param audioBuffer Full audio samples
 * @param tonePlayTimestampNs When tone was played (nanoseconds)
 * @param chunkTimestampNs When audio chunk started (nanoseconds)
 * @param sampleRate Sample rate in Hz
 * @param windowMs Time window to extract (ms)
 * @returns Extracted segment or null if tone not in this chunk
 */
export function extractToneSegment(
  audioBuffer: Float32Array,
  tonePlayTimestampNs: bigint,
  chunkTimestampNs: bigint,
  sampleRate: number,
  windowMs: number = 1000
): Float32Array | null {
  // Convert timestamps to relative position
  const deltaMs = Number(tonePlayTimestampNs - chunkTimestampNs) / 1_000_000;
  
  // Check if tone is in this chunk
  const chunkDurationMs = (audioBuffer.length / sampleRate) * 1000;
  
  if (deltaMs < -windowMs || deltaMs > chunkDurationMs + windowMs) {
    return null; // Tone not in this chunk
  }
  
  // Calculate sample position
  const toneSample = Math.floor((deltaMs / 1000) * sampleRate);
  const windowSamples = Math.floor((windowMs / 1000) * sampleRate);
  
  // Extract segment (centered on expected tone position, or as much as possible)
  const startSample = Math.max(0, toneSample - windowSamples / 2);
  const endSample = Math.min(audioBuffer.length, toneSample + windowSamples / 2);
  
  return audioBuffer.slice(startSample, endSample);
}
