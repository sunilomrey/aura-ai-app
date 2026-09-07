"""
Aura AI — Real-Time Voice Agent & Proxy Orchestrator Backend
=============================================================

A FastAPI WebSocket server that provides:
1. Direct Voice Agent WebSocket: `/ws/voice/{session_id}`
2. Third-Party Proxy Orchestrator: `/ws/proxy/{session_id}`
3. Static Web Component & Demo Host: `/public/widget.js`, `/demo`

Pipeline Architecture:
    Client Audio (PCM) ──► Mock STT ──► forward_to_agent() ──► Mock TTS ──► Client Audio (PCM)

Protocol
--------
Client → Server:
  - Binary:  Raw 16kHz 16-bit mono PCM audio chunks
  - JSON:    {"type": "session_init", "voice_id": "..."}   Start the session
  - JSON:    {"type": "stop_audio"}                        User stopped speaking
  - JSON:    {"type": "client_barge_in"}                   Interrupt agent mid-stream

Server → Client:
  - JSON:    {"type": "state_change",  "state": "<state>"}
  - JSON:    {"type": "transcript_stream", "payload": {...}}
  - JSON:    {"type": "transcript_interim", "payload": {...}}
  - JSON:    {"type": "flush_audio_buffer"}
  - Binary:  b"AURA" + dummy PCM bytes  (4-byte ASCII header for identification)
"""

import asyncio
import json
import logging
import math
import os
import struct
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("aura-backend")

# ---------------------------------------------------------------------------
# FastAPI Application & CORS
# ---------------------------------------------------------------------------
app = FastAPI(title="Aura AI Voice & Proxy Orchestrator", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static directory setup
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DIR.mkdir(exist_ok=True)

app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")


@app.get("/health")
async def health_check():
    """Simple health-check endpoint."""
    return {"status": "ok", "service": "aura-voice-proxy-backend", "version": "0.2.0"}


@app.get("/demo")
async def serve_demo():
    """Serve the static CRM demo page showcasing the embeddable Web Component."""
    demo_file = PUBLIC_DIR / "demo.html"
    if demo_file.exists():
        return FileResponse(str(demo_file))
    return {"error": "demo.html not yet generated in public directory"}


# ---------------------------------------------------------------------------
# Constants & Audio Configuration
# ---------------------------------------------------------------------------
AUDIO_HEADER = b"AURA"
SAMPLE_RATE = 16000           # 16 kHz
SAMPLE_WIDTH = 2              # 16-bit (2 bytes per sample)
BYTES_PER_SECOND = SAMPLE_RATE * SAMPLE_WIDTH  # 32000 bytes/sec

# Simulated timing (seconds)
STT_SILENCE_TIMEOUT = 2.0     # Max seconds of audio before auto-transcribe
STT_INTERIM_INTERVAL = 0.3    # Interval between interim partials
STT_FINAL_DELAY = 0.1         # Short pause before final transcript pass
LLM_THINKING_DELAY = 0.3      # Simulated agent inference thinking delay
LLM_WORD_DELAY = 0.08         # Delay between streamed tokens

# TTS audio chunk sizing
TTS_FRAME_DURATION = 0.1      # 100ms per audio frame
TTS_FRAME_SIZE = int(BYTES_PER_SECOND * TTS_FRAME_DURATION)  # 3200 bytes
TTS_FRAMES_PER_WORD = 3       # 3 frames (300ms audio) per word

MOCK_DEFAULT_RESPONSE = (
    "This is a hardcoded agent response that simulates "
    "realistic streaming latency from a large language model."
)

MOCK_INTERIM_PARTIALS = [
    "Tell",
    "Tell me",
    "Tell me about",
    "Tell me about the recent",
    "Tell me about the recent quarterly updates.",
]


# ---------------------------------------------------------------------------
# Audio Tone Generator (Audible PCM for testing)
# ---------------------------------------------------------------------------
def generate_tone_pcm(
    frequency: float = 440.0,
    duration_s: float = 0.1,
    amplitude: float = 0.25,
    sample_rate: int = SAMPLE_RATE,
) -> bytes:
    """Generate 16-bit signed PCM sine-wave bytes for audible test streaming."""
    num_samples = int(sample_rate * duration_s)
    max_val = 32767 * amplitude
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        sample = int(max_val * math.sin(2.0 * math.pi * frequency * t))
        samples.append(sample)
    return struct.pack(f"<{num_samples}h", *samples)


# ---------------------------------------------------------------------------
# Session State Model
# ---------------------------------------------------------------------------
class SessionState:
    """Tracks state for a single WebSocket voice or proxy session."""

    def __init__(self, session_id: str, voice_id: Optional[str] = None):
        self.session_id = session_id
        self.voice_id = voice_id or "aura-default"
        self.state: str = "IDLE"

        # Audio buffer
        self.audio_buffer = bytearray()
        self.audio_start_time: Optional[float] = None
        self.audio_chunk_count: int = 0

        # Background tasks
        self.pipeline_task: Optional[asyncio.Task] = None
        self.interim_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# WebSocket Helpers
# ---------------------------------------------------------------------------
async def send_json(ws: WebSocket, data: dict) -> None:
    """Send JSON message over WebSocket safely."""
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def send_state(ws: WebSocket, session: SessionState, new_state: str) -> None:
    """Transition session state and notify the client."""
    session.state = new_state
    logger.info("Session %s → %s", session.session_id, new_state)
    await send_json(ws, {"type": "state_change", "state": new_state})


# ---------------------------------------------------------------------------
# Mock STT (Speech-to-Text) Service
# ---------------------------------------------------------------------------
async def stream_interim_transcripts(ws: WebSocket, session: SessionState) -> None:
    """Stream progressive interim partial transcripts during user speech."""
    for idx, partial in enumerate(MOCK_INTERIM_PARTIALS):
        if session.state not in ("LISTENING", "PROCESSING_STT"):
            return

        is_last = idx == len(MOCK_INTERIM_PARTIALS) - 1
        stability = round(0.5 + (0.5 * idx / max(len(MOCK_INTERIM_PARTIALS) - 1, 1)), 2)

        await send_json(ws, {
            "type": "transcript_interim",
            "payload": {
                "speaker": "user",
                "text": partial,
                "is_final": False,
                "stability": stability,
            },
        })

        if not is_last:
            await asyncio.sleep(STT_INTERIM_INTERVAL)


async def mock_stt(ws: WebSocket, session: SessionState) -> str:
    """Process buffered audio and return the final user transcript."""
    await send_state(ws, session, "PROCESSING_STT")

    # Cancel any running interim generator
    if session.interim_task and not session.interim_task.done():
        session.interim_task.cancel()
        try:
            await session.interim_task
        except asyncio.CancelledError:
            pass
        session.interim_task = None

    await asyncio.sleep(STT_FINAL_DELAY)

    user_text = "Tell me about the recent quarterly updates."

    logger.info(
        "Session %s — Mock STT complete (%d chunks, %d bytes). User: '%s'",
        session.session_id, session.audio_chunk_count, len(session.audio_buffer), user_text,
    )

    await send_json(ws, {
        "type": "transcript_stream",
        "payload": {
            "speaker": "user",
            "text": user_text,
            "is_final": True,
        },
    })

    session.audio_buffer.clear()
    session.audio_start_time = None
    session.audio_chunk_count = 0

    return user_text


# ---------------------------------------------------------------------------
# Third-Party Proxy Webhook Dispatcher
# ---------------------------------------------------------------------------
async def forward_to_agent(text: str, session_id: str, voice_id: Optional[str] = None) -> str:
    """
    Simulate forwarding the transcribed text to a third-party webhook/agent workflow
    (e.g., LangGraph, n8n, Flowise, or CRM backend) and returning the resulting response.
    """
    logger.info(
        "Session %s — [PROXY FORWARD] Dispatching to external agent webhook: '%s' (voice_id=%s)",
        session_id, text, voice_id,
    )

    # Simulate network latency of external webhook
    await asyncio.sleep(0.25)

    lower = text.lower()
    if "quarterly" in lower or "updates" in lower or "report" in lower:
        return (
            "Based on the latest Q3 reports, customer retention has increased by 14% "
            "and European expansion is progressing ahead of schedule."
        )
    elif "schedule" in lower or "meeting" in lower or "calendar" in lower:
        return "You have two meetings scheduled today: Team Standup at 10 AM and Client Review at 3 PM."
    elif "crm" in lower or "deal" in lower or "lead" in lower:
        return "I synchronized with the CRM. You have 5 new qualified enterprise leads awaiting follow-up."
    else:
        return (
            f"The proxy agent received your request regarding '{text}' "
            "and executed the workflow action successfully."
        )


# ---------------------------------------------------------------------------
# Mock LLM & TTS Streaming Pipeline
# ---------------------------------------------------------------------------
async def mock_streaming_tts_pipeline(
    ws: WebSocket, session: SessionState, response_text: str
) -> None:
    """Stream response tokens and concurrent TTS PCM audio frames to the client."""
    await send_state(ws, session, "STREAMING_LLM_TTS")

    logger.info("Session %s — Agent thinking (%.0fms)…", session.session_id, LLM_THINKING_DELAY * 1000)
    await asyncio.sleep(LLM_THINKING_DELAY)

    words = response_text.split()
    total_words = len(words)
    base_freq = 360.0
    freq_step = 8.0

    for idx, word in enumerate(words):
        is_final = idx == total_words - 1

        # Send word transcript
        await send_json(ws, {
            "type": "transcript_stream",
            "payload": {
                "speaker": "agent",
                "text": word,
                "is_final": is_final,
                "word_index": idx,
                "total_words": total_words,
            },
        })

        # Send TTS audio frames
        word_freq = base_freq + (idx % 10) * freq_step
        for frame_idx in range(TTS_FRAMES_PER_WORD):
            tone_pcm = generate_tone_pcm(
                frequency=word_freq,
                duration_s=TTS_FRAME_DURATION,
            )
            frame_data = AUDIO_HEADER + tone_pcm
            try:
                await ws.send_bytes(frame_data)
            except Exception:
                return

            if frame_idx < TTS_FRAMES_PER_WORD - 1:
                await asyncio.sleep(0.015)

        if not is_final:
            await asyncio.sleep(LLM_WORD_DELAY)

    logger.info("Session %s — Agent response complete.", session.session_id)
    await send_state(ws, session, "IDLE")


# ---------------------------------------------------------------------------
# Barge-in Interruption Handler
# ---------------------------------------------------------------------------
async def handle_barge_in(ws: WebSocket, session: SessionState) -> None:
    """Cancel any active LLM/TTS generation and flush client audio queues."""
    logger.info("Session %s — [BARGE-IN] Interruption received!", session.session_id)

    if session.pipeline_task and not session.pipeline_task.done():
        session.pipeline_task.cancel()
        try:
            await session.pipeline_task
        except asyncio.CancelledError:
            pass
        session.pipeline_task = None

    if session.interim_task and not session.interim_task.done():
        session.interim_task.cancel()
        try:
            await session.interim_task
        except asyncio.CancelledError:
            pass
        session.interim_task = None

    await send_json(ws, {"type": "flush_audio_buffer"})
    logger.info("Session %s — Pipeline cancelled, flush confirmation sent.", session.session_id)
    await send_state(ws, session, "LISTENING")


# ---------------------------------------------------------------------------
# Proxy Pipeline Runner (STT ──► forward_to_agent ──► TTS)
# ---------------------------------------------------------------------------
async def run_proxy_pipeline(ws: WebSocket, session: SessionState) -> None:
    """Execute the proxy pipeline: STT -> forward_to_agent() -> TTS."""
    user_text = await mock_stt(ws, session)
    agent_response = await forward_to_agent(user_text, session.session_id, session.voice_id)

    session.pipeline_task = asyncio.create_task(
        mock_streaming_tts_pipeline(ws, session, agent_response)
    )


async def run_default_pipeline(ws: WebSocket, session: SessionState) -> None:
    """Execute default mock pipeline."""
    user_text = await mock_stt(ws, session)
    session.pipeline_task = asyncio.create_task(
        mock_streaming_tts_pipeline(ws, session, MOCK_DEFAULT_RESPONSE)
    )


# ---------------------------------------------------------------------------
# Silence Auto-trigger Timer
# ---------------------------------------------------------------------------
async def audio_silence_timer(ws: WebSocket, session: SessionState, is_proxy: bool = False) -> None:
    """Auto-trigger STT processing if silence timeout is reached."""
    await asyncio.sleep(STT_SILENCE_TIMEOUT)

    if session.state == "LISTENING" and session.audio_buffer:
        logger.info(
            "Session %s — Silence timeout (%.1fs reached), triggering pipeline.",
            session.session_id, STT_SILENCE_TIMEOUT,
        )
        if is_proxy:
            await run_proxy_pipeline(ws, session)
        else:
            await run_default_pipeline(ws, session)


# ---------------------------------------------------------------------------
# Route 1: Third-Party Proxy Orchestrator WebSocket (/ws/proxy/{session_id})
# ---------------------------------------------------------------------------
@app.websocket("/ws/proxy/{session_id}")
async def proxy_websocket(
    ws: WebSocket,
    session_id: str,
    voice_id: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for third-party embeddable clients (e.g. widget.js).
    Routes incoming audio to STT, invokes forward_to_agent(), and streams TTS back.
    """
    await ws.accept()
    session = SessionState(session_id, voice_id=voice_id)
    silence_timer_task: Optional[asyncio.Task] = None

    logger.info("Session %s — [PROXY WS] Client connected (voice_id=%s).", session_id, session.voice_id)

    try:
        while True:
            message = await ws.receive()

            # Binary audio PCM chunk
            if "bytes" in message and message["bytes"] is not None:
                audio_chunk: bytes = message["bytes"]
                if session.state != "LISTENING":
                    continue

                session.audio_buffer.extend(audio_chunk)
                session.audio_chunk_count += 1

                if session.audio_start_time is None:
                    session.audio_start_time = time.monotonic()

                    if silence_timer_task and not silence_timer_task.done():
                        silence_timer_task.cancel()
                    silence_timer_task = asyncio.create_task(
                        audio_silence_timer(ws, session, is_proxy=True)
                    )

                    if session.interim_task and not session.interim_task.done():
                        session.interim_task.cancel()
                    session.interim_task = asyncio.create_task(
                        stream_interim_transcripts(ws, session)
                    )

                logger.debug("Session %s — [PROXY] Audio chunk #%d (%d bytes)",
                             session_id, session.audio_chunk_count, len(audio_chunk))

            # JSON control signal
            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    logger.warning("Session %s — Invalid JSON.", session_id)
                    continue

                msg_type = data.get("type", "")
                logger.info("Session %s — [PROXY] Control message: %s", session_id, msg_type)

                if msg_type == "session_init":
                    if "voice_id" in data:
                        session.voice_id = data["voice_id"]
                    await send_state(ws, session, "LISTENING")
                    await send_json(ws, {
                        "type": "session_ready",
                        "session_id": session_id,
                        "voice_id": session.voice_id,
                        "proxy": True,
                    })

                elif msg_type == "stop_audio":
                    if silence_timer_task and not silence_timer_task.done():
                        silence_timer_task.cancel()

                    if session.audio_buffer:
                        await run_proxy_pipeline(ws, session)
                    else:
                        logger.info("Session %s — stop_audio received with empty buffer.", session_id)

                elif msg_type == "client_barge_in":
                    await handle_barge_in(ws, session)

                else:
                    logger.warning("Session %s — Unknown message type: %s", session_id, msg_type)

            elif message.get("type") == "websocket.disconnect":
                break

    except WebSocketDisconnect:
        logger.info("Session %s — [PROXY] Client disconnected.", session_id)
    except Exception as exc:
        logger.exception("Session %s — [PROXY] Unexpected error: %s", session_id, exc)
    finally:
        for task in [silence_timer_task, session.pipeline_task, session.interim_task]:
            if task and not task.done():
                task.cancel()
        logger.info("Session %s — [PROXY] Session closed.", session_id)


# ---------------------------------------------------------------------------
# Route 2: Default Voice Agent WebSocket (/ws/voice/{session_id})
# ---------------------------------------------------------------------------
@app.websocket("/ws/voice/{session_id}")
async def voice_websocket(ws: WebSocket, session_id: str):
    """Direct Voice Agent WebSocket handler."""
    await ws.accept()
    session = SessionState(session_id)
    silence_timer_task: Optional[asyncio.Task] = None

    logger.info("Session %s — [DIRECT WS] Client connected.", session_id)

    try:
        while True:
            message = await ws.receive()

            if "bytes" in message and message["bytes"] is not None:
                audio_chunk: bytes = message["bytes"]
                if session.state != "LISTENING":
                    continue

                session.audio_buffer.extend(audio_chunk)
                session.audio_chunk_count += 1

                if session.audio_start_time is None:
                    session.audio_start_time = time.monotonic()

                    if silence_timer_task and not silence_timer_task.done():
                        silence_timer_task.cancel()
                    silence_timer_task = asyncio.create_task(
                        audio_silence_timer(ws, session, is_proxy=False)
                    )

                    if session.interim_task and not session.interim_task.done():
                        session.interim_task.cancel()
                    session.interim_task = asyncio.create_task(
                        stream_interim_transcripts(ws, session)
                    )

            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type", "")

                if msg_type == "session_init":
                    await send_state(ws, session, "LISTENING")
                    await send_json(ws, {
                        "type": "session_ready",
                        "session_id": session_id,
                    })

                elif msg_type == "stop_audio":
                    if silence_timer_task and not silence_timer_task.done():
                        silence_timer_task.cancel()

                    if session.audio_buffer:
                        await run_default_pipeline(ws, session)

                elif msg_type == "client_barge_in":
                    await handle_barge_in(ws, session)

            elif message.get("type") == "websocket.disconnect":
                break

    except WebSocketDisconnect:
        logger.info("Session %s — Client disconnected.", session_id)
    except Exception as exc:
        logger.exception("Session %s — Unexpected error: %s", session_id, exc)
    finally:
        for task in [silence_timer_task, session.pipeline_task, session.interim_task]:
            if task and not task.done():
                task.cancel()
        logger.info("Session %s — Session closed.", session_id)
