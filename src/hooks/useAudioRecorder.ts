import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

// Interfaces for Web Speech API types to satisfy TypeScript check
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [key: number]: {
      [key: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface WebSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  }
}

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  // Native recording reference
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  // Web Speech recognition reference
  const webRecognitionRef = useRef<WebSpeechRecognition | null>(null);

  // Initialize Web Speech Recognition if on web browser
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isSecureContext =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      console.log('[STT Diagnostics] Web Speech API Supported:', !!SpeechRecognition);
      console.log('[STT Diagnostics] Secure context (required for mic):', isSecureContext);

      if (!isSecureContext) {
        console.warn(
          '[STT Security Alert] Microphone access and Web Speech API are restricted by the browser on insecure non-localhost HTTP connections. Please load the app via localhost or HTTPS.'
        );
      }

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('[STT] Speech recognition session started.');
          setIsRecording(true);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            // Note: results list properties might be objects or arrays
            const result = (event.results as any)[i];
            if (result && result[0]) {
              currentTranscript += result[0].transcript;
            }
          }
          if (currentTranscript.trim()) {
            setTranscript(currentTranscript);
            console.log(`[STT Live Transcribed Text]: "${currentTranscript}"`);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('[STT Error]', event.error, event.message);
          if (event.error === 'not-allowed') {
            console.warn('[STT Error Warning] Microphone permission was denied by the browser.');
          }
        };

        recognition.onend = () => {
          console.log('[STT] Speech recognition session ended.');
          setIsRecording(false);
        };

        webRecognitionRef.current = recognition;
      } else {
        console.warn('Web Speech API is not supported in this browser.');
      }
    }

    return () => {
      if (webRecognitionRef.current) {
        webRecognitionRef.current.abort();
      }
    };
  }, []);

  const startRecording = async () => {
    setTranscript('');
    console.log('[Audio] Initializing recording sequence...');

    if (Platform.OS === 'web') {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          console.log('[Audio Web] Explicitly requesting microphone permission...');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop track immediately to free the resource
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        console.error('[Audio Web] Failed or denied microphone access request:', err);
      }

      if (webRecognitionRef.current) {
        try {
          webRecognitionRef.current.start();
        } catch (err) {
          console.error('Failed to start web speech recognition:', err);
        }
      } else {
        console.log('[Audio Web Fallback] Microphones are active but SpeechRecognition is unsupported.');
        setIsRecording(true);
      }
    } else {
      // Native iOS/Android implementation using expo-av
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          console.warn('Microphone permission denied.');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
        console.log('[Audio Native] Recording started.');
      } catch (err) {
        console.error('Failed to start native recording:', err);
      }
    }
  };

  const stopRecording = async () => {
    console.log('[Audio] Stopping recording...');

    if (Platform.OS === 'web') {
      if (webRecognitionRef.current) {
        webRecognitionRef.current.stop();
      } else {
        setIsRecording(false);
      }
    } else {
      // Native stop
      const recording = recordingRef.current;
      if (!recording) return;

      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        console.log(`[Audio Native Success] Recording saved successfully to: ${uri}`);
        console.log('[Audio Native Success] File available for transcription.');
        setIsRecording(false);
        recordingRef.current = null;
      } catch (err) {
        console.error('Failed to stop native recording:', err);
      }
    }
  };

  const resetTranscript = () => {
    setTranscript('');
  };

  return {
    isRecording,
    transcript,
    startRecording,
    stopRecording,
    resetTranscript,
  };
};
