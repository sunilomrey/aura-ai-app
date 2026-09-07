"""
Aura AI — Real-Time Voice Agent & Proxy Orchestrator Backend
=============================================================
Specialized Stage Demo Flow:
Showcasing Telemetry-Driven Semantic Audio Compression (T-SAC)
for Enterprise Telecom Edge Infrastructure.

Flow:
1. Baseline Trigger: "Aura, what are the steps to reroute traffic from a failing edge server?"
2. Extended Telecom Ops Response (15-20s duration with 0.8s sentence cadence).
3. Crisis Trigger: Ctrl+Shift+D -> RTT: 1250ms.
4. Instant Semantic Truncation -> "\\n\\n[Bandwidth critical. Switching to low-latency stream. Reroute command executed.]"
5. High-visibility projector log: "[CRITICAL] SYSTEM_OVERRIDE: T-SAC Engaged."
"""

import asyncio
import json
import logging
import math
import os
import struct
import time
import uuid
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("aura-backend")

# ---------------------------------------------------------------------------
# Mock Edge Node Inventory (Enterprise Telecom Data)
# ---------------------------------------------------------------------------
EDGE_NODE_INVENTORY = [
    {
        "node_id": "MEC-BLR-01",
        "region": "ap-south-1 (Bengaluru)",
        "role": "5G UPF / Edge Compute",
        "status": "CRITICAL",
        "active_alarms": ["BGP_ROUTE_FLAP", "HIGH_LATENCY"],
        "cpu_load": "94%",
        "failover_target": "MEC-MUM-02",
    },
    {
        "node_id": "MEC-MUM-02",
        "region": "ap-south-2 (Mumbai)",
        "role": "AIOps Control Plane",
        "status": "HEALTHY",
        "active_alarms": [],
        "cpu_load": "42%",
        "failover_target": "None",
    },
]

# ---------------------------------------------------------------------------
# Database Schema & Telemetry Models (T-SAC Feature)
# ---------------------------------------------------------------------------
class TurnTelemetry(BaseModel):
    """
    Database schema / model for recording turn-by-turn conversation telemetry,
    including network health, bandwidth throttling, and latency stats.
    """
    turn_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    timestamp: float = Field(default_factory=time.time)
    user_query: str
    agent_response: str
    duration_ms: int = 0
    network_throttle_engaged: bool = False
    rtt_at_throttle_ms: Optional[int] = None
    codec_sample_rate: int = 16000


# In-memory database table storing turn telemetry
turn_telemetry_db: List[TurnTelemetry] = []


def log_turn_telemetry(
    session: "SessionState",
    user_query: str,
    agent_response: str,
    start_time: float,
) -> TurnTelemetry:
    """Store turn telemetry into database and log structured stats."""
    duration_ms = int((time.time() - start_time) * 1000)
    record = TurnTelemetry(
        session_id=session.session_id,
        user_query=user_query,
        agent_response=agent_response,
        duration_ms=duration_ms,
        network_throttle_engaged=session.network_throttle_engaged,
        rtt_at_throttle_ms=session.rtt_at_throttle_ms,
        codec_sample_rate=8000 if session.is_degraded else 16000,
    )
    turn_telemetry_db.append(record)
    logger.info(
        "Session %s — [DB TELEMETRY STORED] turn_id=%s, throttled=%s, rtt=%s ms, codec=%d Hz",
        session.session_id,
        record.turn_id,
        record.network_throttle_engaged,
        record.rtt_at_throttle_ms,
        record.codec_sample_rate,
    )
    return record


# ---------------------------------------------------------------------------
# FastAPI Application & Static Mounts
# ---------------------------------------------------------------------------
app = FastAPI(title="Aura AI Voice & Proxy Orchestrator with T-SAC", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DIR.mkdir(exist_ok=True)

app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")
app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")


@app.get("/health")
async def health_check():
    """Health-check endpoint reporting service status and T-SAC readiness."""
    return {
        "status": "ok",
        "service": "aura-voice-proxy-backend",
        "version": "0.4.0",
        "features": ["T-SAC", "telecom_edge_demo", "telemetry_polling", "semantic_truncation", "codec_swap_8khz"],
    }


@app.get("/demo")
async def serve_demo():
    """Serve the static CRM demo page showcasing the embeddable Web Component."""
    demo_file = PUBLIC_DIR / "demo.html"
    if demo_file.exists():
        return FileResponse(str(demo_file))
    return {"error": "demo.html not found in public directory"}


@app.get("/api/edge-nodes")
async def get_edge_nodes():
    """Return inventory of enterprise edge nodes."""
    return {
        "count": len(EDGE_NODE_INVENTORY),
        "nodes": EDGE_NODE_INVENTORY,
    }


@app.get("/api/telemetry")
async def get_telemetry_records():
    """Return all stored TurnTelemetry database records."""
    return {
        "count": len(turn_telemetry_db),
        "records": [r.dict() for r in turn_telemetry_db],
    }


# ---------------------------------------------------------------------------
# Audio Constants
# ---------------------------------------------------------------------------
AUDIO_HEADER_16K = b"AURA"    # Standard 16kHz audio header
AUDIO_HEADER_8K = b"A8KH"     # T-SAC Low-bandwidth 8kHz audio header

SAMPLE_RATE_16K = 16000       # 16 kHz
SAMPLE_RATE_8K = 8000         # 8 kHz
SAMPLE_WIDTH = 2              # 16-bit (2 bytes per sample)

# Simulated timing (seconds)
STT_SILENCE_TIMEOUT = 2.0     # Max seconds of audio before auto-transcribe
STT_INTERIM_INTERVAL = 0.3    # Interval between interim partials
STT_FINAL_DELAY = 0.1         # Short pause before final transcript pass
LLM_THINKING_DELAY = 0.3      # Simulated agent inference thinking delay
LLM_WORD_DELAY = 0.08         # Delay between streamed tokens

# TTS audio chunk sizing
TTS_FRAME_DURATION = 0.1      # 100ms per audio frame
TTS_FRAMES_PER_WORD = 2       # 2 frames (200ms audio) per word

MOCK_INTERIM_PARTIALS = [
    "Aura,",
    "Aura, what are the",
    "Aura, what are the steps to reroute",
    "Aura, what are the steps to reroute traffic from a failing edge server?",
]

# ---------------------------------------------------------------------------
# Route Response Scripts & Keyword-Based Mock LLM Router
# ---------------------------------------------------------------------------
ROUTE_HARDWARE_PROVISIONING = (
    "Scanning configuration templates for the Koramangala subnet. "
    "I found template v4. Applying zero-touch provisioning now. "
    "The router will reboot and join the mesh in approximately 45 seconds."
)

ROUTE_SLA_VALIDATION = (
    "Yes. The node was offline for 14 minutes, which exceeds the 99.99% uptime guarantee for this month. "
    "I have drafted a penalty claim for $12,500. Would you like me to submit it to billing?"
)

ROUTE_TSAC_REROUTE = (
    "To reroute traffic from a failing MEC node, we must first isolate the affected subnet. "
    "Step one: Verify the BGP routing tables. "
    "Step two: Initiate a DNS failover to the secondary region. "
    "Step three: Drain active connections. "
    "Step four: Rebalance traffic across edge clusters. "
    "Step five: Run health check diagnostics on backup gateways."
)


def route_llm_response(text: str) -> str:
    """
    Keyword-Based Mock LLM Router:
    - Route 1 (Hardware Provisioning): If input contains 'configure' or 'router'
    - Route 2 (SLA Validation): If input contains 'sla' or 'breach'
    - Route 3 (T-SAC Pitch - Default/Reroute): If input contains 'reroute' or 'failing' (or default fallback)
    """
    lower = text.lower()
    if "configure" in lower or "router" in lower:
        return ROUTE_HARDWARE_PROVISIONING
    elif "sla" in lower or "breach" in lower:
        return ROUTE_SLA_VALIDATION
    elif "reroute" in lower or "failing" in lower:
        return ROUTE_TSAC_REROUTE
    return ROUTE_TSAC_REROUTE


# ---------------------------------------------------------------------------
# Terminal Telemetry Logging (Stage Console Display)
# ---------------------------------------------------------------------------
def print_tsac_degrade_telemetry() -> None:
    """
    Instantly print color-coded sequence to server console when network_degrade is triggered:
    [WARN] WebSocket RTT: 850ms | Jitter: 150ms | Bandwidth: 256 kbps
    [ERROR] WebSocket RTT: 1420ms | Packet Loss: 18% | Bandwidth: 64 kbps
    [CRITICAL] SYSTEM_OVERRIDE: T-SAC Engaged.
    [CRITICAL] ACTION: Truncating Semantic Pipeline.
    [CRITICAL] ACTION: Fallback to 8kHz PCM Audio Stream.
    """
    print("\n\033[93m[WARN] WebSocket RTT: 850ms | Jitter: 150ms | Bandwidth: 256 kbps\033[0m", flush=True)
    print("\033[91m[ERROR] WebSocket RTT: 1420ms | Packet Loss: 18% | Bandwidth: 64 kbps\033[0m", flush=True)
    print("\033[91m\033[1m[CRITICAL] SYSTEM_OVERRIDE: T-SAC Engaged.\033[0m", flush=True)
    print("\033[91m\033[1m[CRITICAL] ACTION: Truncating Semantic Pipeline.\033[0m", flush=True)
    print("\033[93m\033[1m[CRITICAL] ACTION: Fallback to 8kHz PCM Audio Stream.\033[0m\n", flush=True)


async def live_telemetry_monitor(session: "SessionState") -> None:
    """
    Asynchronous background task that prints mock healthy network telemetry to the server console.
    """
    try:
        while True:
            await asyncio.sleep(3.0)
            if not session.is_degraded:
                print("\033[36m[INFO] WebSocket RTT: 42ms | Jitter: 2ms | Bandwidth: 45 Mbps\033[0m", flush=True)
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# Audio Tone Generator (Audible PCM for testing)
# ---------------------------------------------------------------------------
def generate_tone_pcm(
    frequency: float = 440.0,
    duration_s: float = 0.1,
    amplitude: float = 0.25,
    sample_rate: int = SAMPLE_RATE_16K,
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

        # T-SAC State & Telemetry flags
        self.is_degraded: bool = False
        self.degraded_logged: bool = False
        self.network_throttle_engaged: bool = False
        self.rtt_at_throttle_ms: Optional[int] = None
        self.last_user_query: str = ""

        # Audio buffer
        self.audio_buffer = bytearray()
        self.audio_start_time: Optional[float] = None
        self.audio_chunk_count: int = 0

        # Background tasks
        self.pipeline_task: Optional[asyncio.Task] = None
        self.interim_task: Optional[asyncio.Task] = None
        self.telemetry_task: Optional[asyncio.Task] = None


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
# Mock STT Service
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

    if session.interim_task and not session.interim_task.done():
        session.interim_task.cancel()
        try:
            await session.interim_task
        except asyncio.CancelledError:
            pass
        session.interim_task = None

    await asyncio.sleep(STT_FINAL_DELAY)

    user_text = "Aura, what are the steps to reroute traffic from a failing edge server?"
    session.last_user_query = user_text

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
# ---------------------------------------------------------------------------
# Third-Party Proxy Webhook Dispatcher / Keyword LLM Router
# ---------------------------------------------------------------------------
async def forward_to_agent(text: str, session_id: str, voice_id: Optional[str] = None) -> str:
    """
    Simulate forwarding the transcribed text to third-party agent webhook / LLM router.
    Routes queries based on enterprise telecom keywords.
    """
    logger.info(
        "Session %s — [PROXY FORWARD] Dispatching to external agent webhook: '%s' (voice_id=%s)",
        session_id, text, voice_id,
    )

    await asyncio.sleep(0.25)
    return route_llm_response(text)


# ---------------------------------------------------------------------------
# Mock LLM & TTS Streaming Pipeline (with T-SAC Semantic Truncation & Codec Swap)
# ---------------------------------------------------------------------------
async def mock_streaming_tts_pipeline(
    ws: WebSocket, session: SessionState, response_text: str
) -> None:
    """
    Stream response tokens and concurrent TTS PCM audio frames.
    For the telecom stage demo, pauses 0.8s between sentences to create realistic presentation pacing.
    If session.is_degraded is True, instantly breaks and swaps to 8kHz low-latency stream.
    """
    turn_start_time = time.time()
    await send_state(ws, session, "STREAMING_LLM_TTS")

    logger.info("Session %s — Agent thinking (%.0fms)…", session.session_id, LLM_THINKING_DELAY * 1000)
    await asyncio.sleep(LLM_THINKING_DELAY)

    # ── Single Start Beep (Signal agent start) ───────────────────────────
    start_beep = AUDIO_HEADER_16K + generate_tone_pcm(
        frequency=587.33,
        duration_s=0.08,
        amplitude=0.2,
        sample_rate=SAMPLE_RATE_16K,
    )
    try:
        await ws.send_bytes(start_beep)
    except Exception:
        return

    words = response_text.split()
    total_words = len(words)
    final_spoken_words = []

    for idx, word in enumerate(words):
        # ── T-SAC Semantic Truncation Check (Mid-generation Interception) ───
        if session.is_degraded:
            if not session.degraded_logged:
                print_tsac_degrade_telemetry()
                session.degraded_logged = True
            logger.warning("Session %s — [CRITICAL] T-SAC Engaged. TTS Codec Swapped to 8kHz.", session.session_id)

            # Send 8kHz low-fidelity audio burst first
            tone_pcm_8k = generate_tone_pcm(
                frequency=320.0,
                duration_s=0.15,
                amplitude=0.2,
                sample_rate=SAMPLE_RATE_8K,
            )
            frame_data_8k = AUDIO_HEADER_8K + tone_pcm_8k
            try:
                await ws.send_bytes(frame_data_8k)
            except Exception:
                pass

            truncation_text = "\n\n[Bandwidth critical. Switching to low-latency stream. Reroute command executed.]"
            final_spoken_words.append(truncation_text)

            # Instantly break the loop and emit the fallback script
            await send_json(ws, {
                "type": "transcript_stream",
                "payload": {
                    "speaker": "agent",
                    "text": truncation_text,
                    "is_final": True,
                    "is_truncated": True,
                },
            })
            break

        final_spoken_words.append(word)
        is_final = idx == total_words - 1

        # Send standard word transcript
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

        if not is_final:
            # If word ends a sentence, pause 0.8s to give presenter time to speak to judges
            if word.endswith(".") or word.endswith("...") or word.endswith("?"):
                await asyncio.sleep(0.8)
            else:
                await asyncio.sleep(LLM_WORD_DELAY)

    # ── Single Finish Beep (Signal agent completion) ─────────────────────
    finish_sample_rate = SAMPLE_RATE_8K if session.is_degraded else SAMPLE_RATE_16K
    finish_header = AUDIO_HEADER_8K if session.is_degraded else AUDIO_HEADER_16K
    finish_beep = finish_header + generate_tone_pcm(
        frequency=440.0,
        duration_s=0.08,
        amplitude=0.2,
        sample_rate=finish_sample_rate,
    )
    try:
        await ws.send_bytes(finish_beep)
    except Exception:
        pass

    complete_agent_text = " ".join(final_spoken_words)
    logger.info("Session %s — Agent response complete.", session.session_id)

    # Record turn telemetry in database
    log_turn_telemetry(
        session=session,
        user_query=session.last_user_query,
        agent_response=complete_agent_text,
        start_time=turn_start_time,
    )

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
# Pipeline Runners
# ---------------------------------------------------------------------------
async def run_proxy_pipeline(ws: WebSocket, session: SessionState, custom_text: Optional[str] = None) -> None:
    """Execute proxy pipeline: STT -> forward_to_agent() -> TTS."""
    if custom_text:
        user_text = custom_text
        session.last_user_query = custom_text
    else:
        user_text = await mock_stt(ws, session)

    agent_response = await forward_to_agent(user_text, session.session_id, session.voice_id)
    session.pipeline_task = asyncio.create_task(
        mock_streaming_tts_pipeline(ws, session, agent_response)
    )


async def run_default_pipeline(ws: WebSocket, session: SessionState) -> None:
    """Execute default mock pipeline with keyword routing."""
    user_text = await mock_stt(ws, session)
    response_text = route_llm_response(user_text)
    session.pipeline_task = asyncio.create_task(
        mock_streaming_tts_pipeline(ws, session, response_text)
    )


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
    Supports live terminal telemetry monitor, T-SAC ping/pong, mock_user_speech, and network_degrade.
    """
    await ws.accept()
    session = SessionState(session_id, voice_id=voice_id)
    silence_timer_task: Optional[asyncio.Task] = None
    session.telemetry_task = asyncio.create_task(live_telemetry_monitor(session))

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

            # JSON control signal
            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    logger.warning("Session %s — Invalid JSON.", session_id)
                    continue

                msg_type = data.get("type", "")

                # ── T-SAC Telemetry Ping/Pong ────────────────────────────
                if msg_type == "ping":
                    ts = data.get("timestamp", time.time() * 1000)
                    await send_json(ws, {"type": "pong", "timestamp": ts})

                # ── T-SAC Network Degradation Control Signal ──────────────
                elif msg_type == "network_degrade":
                    rtt = data.get("payload", {}).get("rtt", 1250)
                    session.is_degraded = True
                    session.network_throttle_engaged = True
                    session.rtt_at_throttle_ms = int(rtt)
                    if not session.degraded_logged:
                        print_tsac_degrade_telemetry()
                        session.degraded_logged = True
                    logger.warning(
                        "Session %s — [T-SAC] network_degrade received! RTT: %d ms. Setting is_degraded=True.",
                        session_id, session.rtt_at_throttle_ms,
                    )
                    await send_json(ws, {
                        "type": "network_status",
                        "is_degraded": True,
                        "rtt": session.rtt_at_throttle_ms,
                        "message": "⚠️ Low Bandwidth: Audio optimized.",
                    })

                # ── Hackathon Stage Demo Mock Speech Trigger ─────────────
                elif msg_type == "mock_user_speech":
                    text = data.get("text", "Aura, what are the steps to reroute traffic from a failing edge server?")
                    session.last_user_query = text
                    logger.info("Session %s — [STAGE DEMO TRIGGER] User query: '%s'", session_id, text)
                    await send_json(ws, {
                        "type": "transcript_stream",
                        "payload": {
                            "speaker": "user",
                            "text": text,
                            "is_final": True,
                        },
                    })
                    # Dispatch directly to pipeline with zero delay
                    await run_proxy_pipeline(ws, session, custom_text=text)

                elif msg_type == "session_init":
                    if "voice_id" in data:
                        session.voice_id = data["voice_id"]
                    # Clean reset state on session_init
                    session.is_degraded = False
                    session.degraded_logged = False
                    session.network_throttle_engaged = False
                    session.rtt_at_throttle_ms = None
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
        for task in [silence_timer_task, session.pipeline_task, session.interim_task, session.telemetry_task]:
            if task and not task.done():
                task.cancel()
        logger.info("Session %s — [PROXY] Session closed.", session_id)


# ---------------------------------------------------------------------------
# Route 2: Direct Voice Agent WebSocket (/ws/voice/{session_id})
# ---------------------------------------------------------------------------
@app.websocket("/ws/voice/{session_id}")
async def voice_websocket(ws: WebSocket, session_id: str):
    """Direct Voice Agent WebSocket handler."""
    await ws.accept()
    session = SessionState(session_id)
    silence_timer_task: Optional[asyncio.Task] = None
    session.telemetry_task = asyncio.create_task(live_telemetry_monitor(session))

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

                if msg_type == "ping":
                    ts = data.get("timestamp", time.time() * 1000)
                    await send_json(ws, {"type": "pong", "timestamp": ts})

                elif msg_type == "network_degrade":
                    rtt = data.get("payload", {}).get("rtt", 1250)
                    session.is_degraded = True
                    session.network_throttle_engaged = True
                    session.rtt_at_throttle_ms = int(rtt)
                    if not session.degraded_logged:
                        print_tsac_degrade_telemetry()
                        session.degraded_logged = True
                    logger.warning("Session %s — [T-SAC] network_degrade engaged! RTT: %d ms", session_id, session.rtt_at_throttle_ms)
                    await send_json(ws, {
                        "type": "network_status",
                        "is_degraded": True,
                        "rtt": session.rtt_at_throttle_ms,
                        "message": "⚠️ Low Bandwidth: Audio optimized.",
                    })

                elif msg_type == "mock_user_speech":
                    text = data.get("text", "Aura, what are the steps to reroute traffic from a failing edge server?")
                    session.last_user_query = text
                    await send_json(ws, {
                        "type": "transcript_stream",
                        "payload": {
                            "speaker": "user",
                            "text": text,
                            "is_final": True,
                        },
                    })
                    agent_response = await forward_to_agent(text, session.session_id, session.voice_id)
                    session.pipeline_task = asyncio.create_task(
                        mock_streaming_tts_pipeline(ws, session, agent_response)
                    )

                elif msg_type == "session_init":
                    session.is_degraded = False
                    session.degraded_logged = False
                    session.network_throttle_engaged = False
                    session.rtt_at_throttle_ms = None
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
        for task in [silence_timer_task, session.pipeline_task, session.interim_task, session.telemetry_task]:
            if task and not task.done():
                task.cancel()
        logger.info("Session %s — Session closed.", session_id)
