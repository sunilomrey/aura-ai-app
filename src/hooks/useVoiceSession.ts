import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Message, AppState } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WS_BASE_URL = 'ws://localhost:8000/ws/voice';
const AUDIO_SAMPLE_RATE = 16000; // 16 kHz

/**
 * useVoiceSession
 * ================
 * Full-duplex voice session hook that connects the React Native frontend
 * to the FastAPI WebSocket backend.
 *
 * Capabilities:
 *  - Captures microphone audio via getUserMedia + ScriptProcessor
 *  - Streams raw 16-bit PCM chunks to the backend over WebSocket
 *  - Receives interim & final transcripts + streamed agent responses
 *  - Plays incoming simulated TTS audio tones smoothly via Web Audio API
 *  - Supports Barge-in: stops audio playback and cancels server tasks instantly
 *  - Drives appState transitions based on server state changes
 */
export const useVoiceSession = () => {
  const [appState, setAppState] = useState<AppState>('DISCONNECTED');
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  // Refs for WebSocket and audio resources
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionIdRef = useRef<string>('');
  const agentWordsRef = useRef<string[]>([]);

  // Audio Playback references (for incoming TTS audio frames)
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // -----------------------------------------------------------------------
  // PCM conversion helpers
  // -----------------------------------------------------------------------

  /** Convert Float32Array audio samples to 16-bit signed PCM bytes */
  const float32ToPCM16 = (float32: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  /** Play incoming PCM audio frame in Web Audio API */
  const playPcmFrame = useCallback((buffer: ArrayBuffer) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    try {
      let pcmBytes = buffer;
      // Check for 4-byte 'AURA' header
      if (buffer.byteLength >= 4) {
        const headerBytes = new Uint8Array(buffer, 0, 4);
        const headerStr = String.fromCharCode(...headerBytes);
        if (headerStr === 'AURA') {
          pcmBytes = buffer.slice(4);
        }
      }

      if (pcmBytes.byteLength === 0) return;

      const int16 = new Int16Array(pcmBytes);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioCtx({ sampleRate: AUDIO_SAMPLE_RATE });
        nextPlaybackTimeRef.current = 0;
      }

      const ctx = playbackContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, AUDIO_SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlaybackTimeRef.current);
      source.start(startTime);
      nextPlaybackTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      };
    } catch (err) {
      console.warn('[Audio Playback] Error playing audio chunk:', err);
    }
  }, []);

  /** Stop and flush all audio playback queues (for barge-in) */
  const flushAudioPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (playbackContextRef.current) {
      nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
    }
    console.log('[Audio Playback] 🛑 Flushed playback buffer');
  }, []);

  /** Append or update the latest message in chat list */
  const appendMessage = useCallback((speaker: 'AURA' | 'USER', text: string, replace = false, isTyping = false) => {
    setMessages((prev) => {
      const copy = [...prev];
      if (replace && copy.length > 0 && copy[copy.length - 1].sender === speaker) {
        copy[copy.length - 1] = { sender: speaker, text, isTyping };
      } else {
        copy.push({ sender: speaker, text, isTyping });
      }
      return copy;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Microphone capture (Web)
  // -----------------------------------------------------------------------

  const startMicCapture = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    try {
      console.log('[Mic] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBuffer = float32ToPCM16(inputData);
        ws.send(pcmBuffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      console.log('[Mic] Audio capture streaming live to WebSocket backend.');
    } catch (err) {
      console.error('[Mic] Failed to start capture:', err);
    }
  }, []);

  const stopMicCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    console.log('[Mic] Audio capture stopped.');
  }, []);

  // -----------------------------------------------------------------------
  // WebSocket Message Handling
  // -----------------------------------------------------------------------

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      // Binary data -> TTS Audio Chunks
      if (event.data instanceof ArrayBuffer) {
        console.log('[WS] 🔊 Received binary TTS audio chunk:', event.data.byteLength, 'bytes');
        playPcmFrame(event.data);
        return;
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          console.log('[WS] 🔊 Received Blob TTS audio chunk:', buf.byteLength, 'bytes');
          playPcmFrame(buf);
        });
        return;
      }

      // JSON Control & Transcript Messages
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'state_change': {
            const serverState = msg.state;
            console.log(`[WS] ⚡ State changed → ${serverState}`);

            if (serverState === 'LISTENING') {
              setAppState('USER_SPEAKING');
              startMicCapture();
            } else if (serverState === 'PROCESSING_STT') {
              stopMicCapture();
            } else if (serverState === 'STREAMING_LLM_TTS') {
              setAppState('AGENT_RESPONDING');
              agentWordsRef.current = [];
            } else if (serverState === 'IDLE') {
              setAppState('IDLE');
              agentWordsRef.current = [];
              setInterimText('');
            }
            break;
          }

          case 'session_ready':
            console.log(`[WS] ✅ Session initialized: ${msg.session_id}`);
            break;

          case 'transcript_interim': {
            const partial = msg.payload?.text || '';
            console.log(`[WS] 📝 Interim STT: "${partial}"`);
            setInterimText(partial);
            appendMessage('USER', partial, true, true);
            break;
          }

          case 'transcript_stream': {
            const { speaker, text, is_final } = msg.payload || {};

            if (speaker === 'user') {
              console.log(`[WS] 👤 User final transcript: "${text}"`);
              setInterimText('');
              appendMessage('USER', text, true, false);
            } else if (speaker === 'agent') {
              agentWordsRef.current.push(text);
              const fullAgentResponse = agentWordsRef.current.join(' ');
              console.log(`[WS] 🤖 Agent streamed word: "${text}" | total: "${fullAgentResponse}"`);
              appendMessage('AURA', fullAgentResponse, true, !is_final);
            }
            break;
          }

          case 'flush_audio_buffer':
            console.log('[WS] 🛑 Flush audio confirmation received.');
            flushAudioPlayback();
            break;

          default:
            console.log('[WS] Control event:', msg);
        }
      } catch (err) {
        console.error('[WS] Failed to parse message JSON:', err);
      }
    },
    [appendMessage, playPcmFrame, flushAudioPlayback, startMicCapture, stopMicCapture]
  );

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected.');
      return;
    }

    const sessionId = `session-${Date.now()}`;
    sessionIdRef.current = sessionId;
    const url = `${WS_BASE_URL}/${sessionId}`;

    setAppState('CONNECTING');
    setMessages([{ sender: 'AURA', text: 'Connecting to real-time voice pipeline...' }]);
    console.log(`[WS] Connecting to WebSocket: ${url}...`);

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] ✅ Connected! Sending session_init...');
      ws.send(JSON.stringify({ type: 'session_init' }));
      setMessages([]);
    };

    ws.onmessage = handleWsMessage;

    ws.onerror = (err) => {
      console.error('[WS] ❌ Error:', err);
      setAppState('ERROR');
    };

    ws.onclose = (event) => {
      console.log(`[WS] Connection closed (code: ${event.code})`);
      stopMicCapture();
      flushAudioPlayback();
      setAppState('DISCONNECTED');
    };
  }, [handleWsMessage, stopMicCapture, flushAudioPlayback]);

  const disconnect = useCallback(() => {
    stopMicCapture();
    flushAudioPlayback();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setAppState('DISCONNECTED');
    setMessages([
      { sender: 'AURA', text: 'How can I help you today?' },
      { sender: 'USER', text: 'Tell me about my schedule.' },
    ]);
    setInterimText('');
    agentWordsRef.current = [];
    console.log('[WS] Disconnected.');
  }, [stopMicCapture, flushAudioPlayback]);

  // -----------------------------------------------------------------------
  // Interactive Commands
  // -----------------------------------------------------------------------

  const stopSpeaking = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop_audio' }));
      console.log('[WS] Sent stop_audio signal.');
    }
    stopMicCapture();
  }, [stopMicCapture]);

  const bargeIn = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'client_barge_in' }));
      console.log('[WS] Sent client_barge_in signal.');
    }
    flushAudioPlayback();
  }, [flushAudioPlayback]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        stopMicCapture();
      } else if (appState === 'USER_SPEAKING') {
        startMicCapture();
      }
      return next;
    });
  }, [appState, startMicCapture, stopMicCapture]);

  useEffect(() => {
    return () => {
      stopMicCapture();
      flushAudioPlayback();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopMicCapture, flushAudioPlayback]);

  return {
    appState,
    setAppState,
    messages,
    interimText,
    isMuted,
    toggleMute,
    connect,
    disconnect,
    stopSpeaking,
    bargeIn,
  };
};
