# 🎙️ Aura AI — Real-Time Voice Agent & Web Component Platform

A complete end-to-end Voice AI platform featuring:
1. **React Native (Expo + TypeScript) Web App**: High-fidelity AI interface with animated visualizer orbs, live speech dialogue bubbles, persona selector, and floating control dock.
2. **FastAPI Real-Time WebSocket Backend**: Full-duplex WebSocket server managing 16kHz PCM audio streaming, simulated Speech-to-Text (STT), Large Language Model (LLM) token streaming, Text-to-Speech (TTS) binary audio generation, and instant Barge-in interruption.
3. **Embeddable Web Component (`widget.js`)**: A plug-and-play Vanilla JavaScript Custom Element (`<aura-voice-agent>`) using Shadow DOM for 100% CSS/DOM isolation, capable of being embedded into any third-party website, CRM, or SaaS platform with two lines of HTML.

---

## 🏗️ System Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │       FastAPI Backend (:8000)           │
                                    │                                         │
┌─────────────────────────┐         │  • /ws/voice/{session_id} (Direct App)  │
│ React Native Frontend   │◄───────►│  • /ws/proxy/{session_id} (Embeddable)  │
│ (Expo Web @ Port 8081)  │   WS    │  • /health                              │
└─────────────────────────┘         │  • /demo & /public/widget.js            │
                                    │                                         │
┌─────────────────────────┐         │  ┌──────────────┐     ┌──────────────┐  │
│ Embeddable Web Widget   │◄───────►│  │   Mock STT   │────►│ forward_to_  │  │
│ (<aura-voice-agent>)    │   WS    │  │ (Interim STT)│     │ agent()      │  │
│ in 3rd-Party CRM / Demo │         │  └──────────────┘     └──────┬───────┘  │
└─────────────────────────┘         │                              │          │
                                    │  ┌──────────────┐            ▼          │
                                    │  │ Barge-in &   │◄────┌──────────────┐  │
                                    │  │ Flush Buffer │     │   Mock TTS   │  │
                                    │  └──────────────┘     │ (16kHz PCM)  │  │
                                    │                       └──────────────┘  │
                                    └─────────────────────────────────────────┘
```

---

## 📋 Prerequisites

Before running locally, make sure you have:
* **Node.js** (v18.0.0 or higher) & `npm`
* **Python** (v3.9 or higher) & `pip`
* A modern web browser (Google Chrome, Microsoft Edge, or Safari)

---

## 🚀 Quick Start (Local Setup)

### 1. Backend Setup & Run (Port 8000)

Open a terminal window:

```bash
# Navigate to the backend directory
cd backend

# 1. Create a Python virtual environment
python3 -m venv venv

# 2. Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows (Command Prompt):
# venv\Scripts\activate.bat

# 3. Install required Python packages
pip install -r requirements.txt

# 4. Start the FastAPI server with Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

* **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
* **Interactive CRM Demo with `<aura-voice-agent>`**: [http://localhost:8000/demo](http://localhost:8000/demo)
* **Direct Widget Script**: [http://localhost:8000/public/widget.js](http://localhost:8000/public/widget.js)

---

### 2. Frontend Setup & Run (Port 8081)

Open a **separate** terminal window:

```bash
# Navigate to the project root directory
cd aura-ai-app

# 1. Install Node dependencies
npm install

# 2. Start the Expo web application
npm run web
# Alternatively:
# npx expo start --web --port 8081
```

* **Frontend Web App**: [http://localhost:8081](http://localhost:8081)

---

## 🧪 How to Test Locally

### Test 1: React Native App ([http://localhost:8081](http://localhost:8081))
1. Open **[http://localhost:8081](http://localhost:8081)** in Chrome.
2. Open Developer Tools (`Cmd + Option + I` on Mac or `F12` on Windows) to view live WebSocket logs.
3. Click **CONNECT AURA AI** in the center or bottom dock.
4. When prompted, **Allow Microphone Access**.
5. Speak into your microphone:
   - Watch live **interim partial transcripts** (`"This"`, `"This is"`, ...) stream dynamically into the user chat bubble.
   - When you stop speaking, the backend resolves the STT and streams the agent response word-by-word with audible audio.
6. **Barge-In (Interruption)**:
   - While the AI is speaking, click the **"TAP TO INTERRUPT (BARGE-IN)"** button on screen.
   - Audio stops immediately, the server generation is cancelled, and the system resets to listening.
7. **Dev Controller**:
   - Tap the small **Layers icon** in the bottom-right corner to manually override any state (`DISCONNECTED`, `IDLE`, `USER_SPEAKING`, `AGENT_RESPONDING`, `ERROR`).

---

### Test 2: Embeddable Web Component Demo ([http://localhost:8000/demo](http://localhost:8000/demo))
1. Open **[http://localhost:8000/demo](http://localhost:8000/demo)** in Chrome.
2. Notice the host page is a simulated third-party Enterprise CRM.
3. Click either:
   - The **glowing blue floating microphone button** in the bottom-right corner, or
   - The **"Open Voice Assistant ➔"** button in the purple banner.
4. The glassmorphic voice agent drawer slides open.
5. Click **CONNECT** to start streaming your microphone and interacting with the proxy AI agent.
6. Click **"⚡ Tap to Interrupt (Barge-In)"** mid-speech to test instant cancellation.

---

### Test 3: Embedding `<aura-voice-agent>` in Any Custom Website

To drop the voice agent into any existing HTML, React, Vue, Angular, or PHP website:

```html
<!-- 1. Include the standalone script (Zero dependencies) -->
<script src="http://localhost:8000/public/widget.js"></script>

<!-- 2. Drop the custom element tag anywhere inside <body> -->
<aura-voice-agent
  agent-endpoint="ws://localhost:8000/ws/proxy/your-custom-session-id"
  theme="dark"
  voice-id="aura-advisor">
</aura-voice-agent>

<!-- 3. Optional: Trigger opening the widget from your own buttons -->
<button onclick="window.AuraVoice.open()">Talk to Voice AI</button>
```

#### Supported Component Attributes:
| Attribute | Type | Default | Description |
|---|---|---|---|
| `agent-endpoint` | `string` | `ws://localhost:8000/ws/proxy/...` | The target WebSocket endpoint URL. |
| `theme` | `string` | `"dark"` | Color theme (`"dark"` or `"light"`). |
| `voice-id` | `string` | `"aura-default"` | Identifier forwarded to the backend agent webhook. |

#### Global JavaScript API:
* `window.AuraVoice.open()` — Opens the voice assistant drawer.
* `window.AuraVoice.close()` — Closes the voice assistant drawer.
* `window.AuraVoice.toggle()` — Toggles open/closed state.

---

## 📡 WebSocket Protocol Specification

The WebSocket connection operates over a single, bidirectional full-duplex stream:

### Client ➔ Server
| Message Format | Type | Payload / Details |
|---|---|---|
| **Binary** | `ArrayBuffer` | Raw 16kHz, 16-bit mono signed PCM audio chunks. |
| **JSON** | `session_init` | `{"type": "session_init", "voice_id": "aura-advisor"}` |
| **JSON** | `stop_audio` | `{"type": "stop_audio"}` (User finished speaking) |
| **JSON** | `client_barge_in` | `{"type": "client_barge_in"}` (Interrupt active response) |

### Server ➔ Client
| Message Format | Type | Payload / Details |
|---|---|---|
| **JSON** | `state_change` | `{"type": "state_change", "state": "LISTENING" \| "PROCESSING_STT" \| "STREAMING_LLM_TTS" \| "IDLE"}` |
| **JSON** | `session_ready` | `{"type": "session_ready", "session_id": "..."}` |
| **JSON** | `transcript_interim` | `{"type": "transcript_interim", "payload": {"speaker": "user", "text": "...", "stability": 0.8}}` |
| **JSON** | `transcript_stream` | `{"type": "transcript_stream", "payload": {"speaker": "user" \| "agent", "text": "...", "is_final": true}}` |
| **JSON** | `flush_audio_buffer` | `{"type": "flush_audio_buffer"}` (Confirmation to flush playback queue) |
| **Binary** | `bytes` | 4-byte ASCII header `b"AURA"` + 16kHz 16-bit PCM audio frames. |

---

## 📂 Project Structure

```
aura-ai-app/
├── backend/
│   ├── main.py              # 🚀 FastAPI server, WebSockets (/ws/voice & /ws/proxy), mock STT/LLM/TTS
│   ├── requirements.txt     # Python dependencies (fastapi, uvicorn, websockets)
│   ├── public/
│   │   ├── widget.js        # 📦 Vanilla JS Custom Element (<aura-voice-agent>) with Shadow DOM
│   │   └── demo.html        # 💼 Third-party CRM demo page embedding widget.js
│   └── venv/                # Python virtual environment (ignored in git)
├── src/
│   ├── components/
│   │   ├── AuraOrb.tsx      # 🔮 Animated SVG Reanimated visualizer orb
│   │   ├── ControlDock.tsx  # 🎛️ Bottom controls, persona switcher, dev controller
│   │   └── TranscriptView.tsx # 💬 Real-time chat bubbles with animated typing indicator
│   ├── hooks/
│   │   ├── useVoiceSession.ts # 🎙️ Full-duplex WebSocket client & Web Audio PCM manager
│   │   └── useAudioRecorder.ts# Audio recorder fallback
│   ├── types.ts             # TypeScript definitions (AppState, Message, Persona)
│   └── theme.ts             # Color palette, spacing, and glassmorphism tokens
├── App.tsx                  # 📱 Root React Native application
├── package.json             # Node dependencies and scripts
├── tsconfig.json            # TypeScript compiler configuration
└── README.md                # 📖 Project documentation
```

---

## 🛠️ Tech Stack

* **Frontend**: React Native, Expo Web, TypeScript, React Native Reanimated v3, Lucide Icons.
* **Web Component**: Vanilla JavaScript (ES6+), Web Components API (`customElements.define`), Shadow DOM v1, Web Audio API (`AudioContext`, `ScriptProcessorNode`, `AudioBufferSourceNode`).
* **Backend**: Python 3.9+, FastAPI, Uvicorn, Python `websockets`, `asyncio`.
