/**
 * AudioWorkletProcessor: Recorder Worklet (recorder-worklet.js)
 * ==============================================================
 * Runs on a dedicated Web Audio rendering thread off the main thread.
 * Converts raw Float32 audio samples (-1.0 to 1.0) into 16-bit signed PCM
 * (Int16Array: -32768 to 32767) for low-latency streaming to the backend.
 */

class RecorderWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    // Capture mono channel (first channel of first input)
    const float32Samples = input[0];
    if (!float32Samples || float32Samples.length === 0) {
      return true;
    }

    const sampleCount = float32Samples.length;
    const pcm16Data = new Int16Array(sampleCount);

    // ── Float32 to 16-bit PCM Conversion ───────────────────────────────
    // 1. Clamp sample between -1.0 and 1.0 to prevent arithmetic overflow.
    // 2. Multiply negative values by 0x8000 (32768) and positive values
    //    by 0x7FFF (32767) to map to standard signed 16-bit range [-32768, 32767].
    for (let i = 0; i < sampleCount; i++) {
      const sample = Math.max(-1.0, Math.min(1.0, float32Samples[i]));
      pcm16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    // Post transferable buffer back to main thread for WebSocket transmission
    this.port.postMessage(pcm16Data.buffer, [pcm16Data.buffer]);

    return true; // Keep processor alive for subsequent audio blocks
  }
}

registerProcessor('recorder-worklet', RecorderWorkletProcessor);
