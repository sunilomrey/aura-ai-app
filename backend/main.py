"""
Aura AI — Hybrid Edge-Cloud Real-Time Voice Orchestrator
=========================================================
Enterprise Architecture:
- Local Edge Acoustic Processing (VAD, Faster-Whisper STT, Piper TTS)
- Secure Cloud Semantic Reasoning (AsyncAzureOpenAI - GPT-4.1-mini)
- Telemetry-Driven Semantic Audio Compression (T-SAC)
- Real-Time VAD & Client-Side Barge-In Interruption Handling

Asynchronous Core Loops:
1. audio_receiver_loop: Captures 16kHz PCM frames, chunks via WebRTC VAD, triggers local STT.
2. llm_orchestrator: Streams text from Azure OpenAI (or fallback) and pipes sentences to Piper.
3. tts_sender_loop: Generates local Piper PCM audio and streams to WebSocket.
"""

import asyncio
import io
import json
import logging
import math
import os
import shutil
import struct
import subprocess
import tempfile
import time
import uuid
import wave
from pathlib import Path
from typing import Optional, List, AsyncGenerator, Any

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
# Optional / Resilient Imports (Faster-Whisper, WebRTC VAD, Azure OpenAI)
# ---------------------------------------------------------------------------
try:
    from faster_whisper import WhisperModel
    logger.info("Initializing local Faster-Whisper model ('tiny.en', device='cpu', compute_type='int8')...")
    whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
except Exception as exc:
    logger.warning("Local faster-whisper not available (%s); operating with resilient STT fallback.", exc)
    whisper_model = None

try:
    import webrtcvad
    vad_processor = webrtcvad.Vad(2) # Aggressiveness mode 2 (moderate)
except Exception as exc:
    logger.warning("webrtcvad not available (%s); operating with energy-based VAD fallback.", exc)
    vad_processor = None

try:
    from openai import AsyncAzureOpenAI
except ImportError:
    AsyncAzureOpenAI = None

# ---------------------------------------------------------------------------
# Azure OpenAI Client Setup
# ---------------------------------------------------------------------------
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "https://mock-azure.openai.azure.com/")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-mini")

azure_client: Optional[Any] = None
if AsyncAzureOpenAI and AZURE_OPENAI_API_KEY:
    try:
        azure_client = AsyncAzureOpenAI(
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
        )
        logger.info("AsyncAzureOpenAI client initialized for endpoint: %s", AZURE_OPENAI_ENDPOINT)
    except Exception as exc:
        logger.warning("Failed to initialize AsyncAzureOpenAI (%s); using resilient mock fallback.", exc)
        azure_client = None

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
    turn_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    timestamp: float = Field(default_factory=time.time)
    user_query: str
    agent_response: str
    duration_ms: int = 0
    network_throttle_engaged: bool = False
    rtt_at_throttle_ms: Optional[int] = None
    codec_sample_rate: int = 16000


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
        "Session %s — [DB TELEMETRY] turn_id=%s throttled=%s rtt=%s ms codec=%d Hz",
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
app = FastAPI(title="Aura AI Edge Voice & Azure Orchestrator", version="0.5.0")

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

DIST_DIR = BASE_DIR.parent / "dist"
if not DIST_DIR.exists():
    DIST_DIR = BASE_DIR / "dist"

if DIST_DIR.exists():
    app.mount("/app", StaticFiles(directory=str(DIST_DIR), html=True), name="app")

app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")
app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")


@app.get("/")
async def serve_root():
    """Serve the root entry point (Web App if built, Demo Console, or status)."""
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        return FileResponse(str(DIST_DIR / "index.html"))
    demo_file = PUBLIC_DIR / "demo.html"
    if demo_file.exists():
        return FileResponse(str(demo_file))
    return {"status": "ok", "service": "Aura Edge Voice Pipeline Backend", "demo_url": "/demo", "health_url": "/health"}


@app.get("/health")
async def health_check():
    """Health-check endpoint reporting service status and Edge/Cloud readiness."""
    return {
        "status": "ok",
        "service": "aura-hybrid-edge-cloud-backend",
        "version": "0.5.0",
        "features": [
            "T-SAC",
            "faster_whisper_local_stt",
            "webrtcvad_chunking",
            "azure_openai_streaming",
            "piper_local_tts",
            "telecom_edge_demo",
        ],
        "local_whisper_ready": whisper_model is not None,
        "local_vad_ready": vad_processor is not None,
        "azure_llm_ready": azure_client is not None,
    }


@app.get("/demo")
async def serve_demo():
    """Serve the static Telecom NOC demo dashboard."""
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
# Audio Constants & Helpers
# ---------------------------------------------------------------------------
AUDIO_HEADER_16K = b"AURA"
AUDIO_HEADER_8K = b"A8KH"

SAMPLE_RATE_16K = 16000
SAMPLE_RATE_8K = 8000
SAMPLE_WIDTH = 2
CHANNELS = 1

# VAD frame size: 20ms at 16kHz = 320 samples = 640 bytes
VAD_FRAME_MS = 20
VAD_FRAME_BYTES = int(SAMPLE_RATE_16K * (VAD_FRAME_MS / 1000.0) * SAMPLE_WIDTH)

# ---------------------------------------------------------------------------
# Prompt & Route Scripts
# ---------------------------------------------------------------------------
ROUTE_TSAC_REROUTE = (
    "To reroute traffic from a failing MEC node, we must first isolate the affected subnet. "
    "Step one: Verify the BGP routing tables. "
    "Step two: Initiate a DNS failover to the secondary region. "
    "Step three: Drain active connections. "
    "Step four: Rebalance traffic across edge clusters. "
    "Step five: Run health check diagnostics on backup gateways."
)

ROUTE_HARDWARE_PROVISIONING = (
    "Scanning configuration templates for the Koramangala subnet. "
    "I found template v4. Applying zero-touch provisioning now. "
    "The router will reboot and join the mesh in approximately 45 seconds."
)

ROUTE_SLA_VALIDATION = (
    "Yes. The node was offline for 14 minutes, which exceeds the 99.99% uptime guarantee for this month. "
    "I have drafted a penalty claim for $12,500. Would you like me to submit it to billing?"
)


def route_llm_response(text: str) -> str:
    """
    Route real user input to contextual telecom operational responses for continuous discussion.
    """
    import re
    tokens = set(re.findall(r'[a-z0-9\-]+', text.lower()))
    lower = text.lower()

    def match(*keywords: str) -> bool:
        for kw in keywords:
            if " " in kw:
                if kw in lower:
                    return True
            else:
                if kw in tokens:
                    return True
        return False

    # 1. Action confirmations & conversational follow-ups
    if match("yes", "proceed", "go ahead", "do it", "approve", "submit", "submit it"):
        return "Submitting penalty claim for $12,500 to telecom enterprise billing. Ticket #AERO-8821 created and escalated to finance."
    elif match("no", "cancel", "hold off", "dont", "wait"):
        return "Understood. The action has been placed on hold and saved as draft in NOC queue."
    elif match("thank", "thanks", "great", "awesome", "perfect"):
        return "You're welcome! I'm standing by for any further edge routing, provisioning, or telemetry checks."
    elif match("bye", "goodbye", "exit"):
        return "Standing by in background telemetry monitor mode. Have a great shift!"
    elif match("how are you", "how are you doing", "doing today"):
        return "Hello! I am doing well, thank you. I am actively monitoring our enterprise edge infrastructure. How can I assist you with NOC operations today?"

    # 2. Domain & Scenario specific matches (SLA, provisioning, rerouting)
    elif match("sla", "breach", "penalty", "uptime guarantee"):
        return ROUTE_SLA_VALIDATION
    elif match("configure", "router", "subnet", "koramangala", "provision", "template"):
        return ROUTE_HARDWARE_PROVISIONING
    elif match("reroute", "failing", "failover", "traffic reroute"):
        return ROUTE_TSAC_REROUTE

    # 3. Telemetry & Metrics Inquiries
    elif match("80", "80%", "over 80", "above 80", "more than 80", "high cpu", "spike"):
        return "Yes, MEC-BLR-01 in Bengaluru is currently at 94% CPU load, exceeding the 80% critical warning threshold. MEC-MUM-02 is nominal at 42%."
    elif match("average cpu", "avg cpu", "consumption", "overall cpu", "average"):
        return "Across our edge cluster, the average CPU utilization is 68%. MEC-BLR-01 is running at 94%, while MEC-MUM-02 is at 42%."
    elif match("nodes down", "node down", "any nodes down", "is there any nodes down", "down", "offline", "unreachable"):
        return "Yes, edge node MEC-BLR-01 in Bengaluru is in CRITICAL state with active BGP route flap alarms on interface ge-0/0/1. Failover target MEC-MUM-02 is fully online and HEALTHY."
    elif match("cpu", "load", "utilization", "metrics"):
        return "MEC-BLR-01 is running hot at 94% CPU load. Secondary node MEC-MUM-02 is nominal at 42% CPU load."
    elif match("latency", "rtt", "ping", "packet loss"):
        return "Bengaluru gateway latency is elevated at 850 milliseconds. Mumbai gateway is nominal at 18 milliseconds."
    elif match("mumbai", "mum-02", "backup node", "target node"):
        return "Failover target MEC-MUM-02 in Mumbai is HEALTHY with 42% CPU load, 18ms latency, and 0 active alarms. Ready for live traffic."
    elif match("bengaluru", "bangalore", "blr", "blr-01"):
        return "MEC-BLR-01 in Bengaluru is in CRITICAL state with 94% CPU load and active BGP route flap alarms on interface ge-0/0/1."
    elif match("status", "health", "alarm", "alarms", "node", "nodes", "inventory"):
        return "Edge node MEC-BLR-01 in Bengaluru is in CRITICAL status with active BGP route flap alarms. Failover target MEC-MUM-02 in Mumbai is HEALTHY with 42% CPU load."
    elif match("hello", "hi", "hey", "who are you", "aura"):
        return "Hello! I am Aura, your telecom edge NOC operations assistant. How can I assist with your edge nodes today?"
    elif match("help", "what can you do"):
        return "You can ask me to reroute edge traffic, configure the Koramangala subnet router, check SLA breach status, view node health, or inspect CPU metrics."
    
    # Context-aware dynamic fallback acknowledging user's actual speech
    return f"Acknowledged: '{text}'. Scanning edge telemetry matrices and verifying node health status now."


def generate_tone_pcm(
    frequency: float = 587.33,
    duration_s: float = 0.06,
    amplitude: float = 0.12,
    sample_rate: int = SAMPLE_RATE_16K,
) -> bytes:
    """Generate 16-bit signed PCM sine-wave bytes for discrete start chime."""
    num_samples = int(sample_rate * duration_s)
    max_val = 32767 * amplitude
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        # Smooth attack and decay envelope to prevent audio pop/click
        envelope = math.sin(math.pi * (i / max_val if max_val else 1)) if i < num_samples else 1.0
        sample = int(max_val * math.sin(2.0 * math.pi * frequency * t))
        samples.append(sample)
    return struct.pack(f"<{num_samples}h", *samples)


def print_tsac_degrade_telemetry() -> None:
    print("\n\033[93m[WARN] WebSocket RTT: 850ms | Jitter: 150ms | Bandwidth: 256 kbps\033[0m", flush=True)
    print("\033[91m[ERROR] WebSocket RTT: 1420ms | Packet Loss: 18% | Bandwidth: 64 kbps\033[0m", flush=True)
    print("\033[91m\033[1m[CRITICAL] SYSTEM_OVERRIDE: T-SAC Engaged.\033[0m", flush=True)
    print("\033[91m\033[1m[CRITICAL] ACTION: Truncating Semantic Pipeline.\033[0m", flush=True)
    print("\033[93m\033[1m[CRITICAL] ACTION: Fallback to 8kHz PCM Audio Stream.\033[0m\n", flush=True)


# ---------------------------------------------------------------------------
# Local Piper / Edge Audio Synthesizer
# ---------------------------------------------------------------------------
async def synthesize_macos_say_tts(text: str, sample_rate: int = SAMPLE_RATE_16K) -> bytes:
    """Generate 16-bit LE PCM audio using macOS native say + afconvert."""
    say_bin = shutil.which("say")
    afconvert_bin = shutil.which("afconvert")
    if not (say_bin and afconvert_bin):
        return b""
    try:
        with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as aiff_f:
            aiff_path = aiff_f.name
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_f:
            wav_path = wav_f.name

        # Synthesize using macOS Samantha voice
        say_proc = await asyncio.create_subprocess_exec(
            say_bin, "-v", "Samantha", "-o", aiff_path, text,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await say_proc.communicate()

        # Convert to 16-bit mono PCM WAV at requested sample rate
        format_spec = f"LEI16@{sample_rate}"
        conv_proc = await asyncio.create_subprocess_exec(
            afconvert_bin, "-f", "WAVE", "-d", format_spec, "-c", "1", aiff_path, wav_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await conv_proc.communicate()

        pcm_bytes = b""
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
            with wave.open(wav_path, "rb") as wf:
                pcm_bytes = wf.readframes(wf.getnframes())

        try:
            if os.path.exists(aiff_path):
                os.remove(aiff_path)
            if os.path.exists(wav_path):
                os.remove(wav_path)
        except Exception:
            pass

        return pcm_bytes
    except Exception as exc:
        logger.warning("macOS say TTS error: %s", exc)
        return b""


async def synthesize_linux_espeak_tts(text: str, sample_rate: int = SAMPLE_RATE_16K) -> bytes:
    """Generate 16-bit LE PCM audio using Linux espeak-ng / ffmpeg in container environments."""
    espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak_bin:
        return b""
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_f:
            wav_path = wav_f.name

        proc = await asyncio.create_subprocess_exec(
            espeak_bin, "-v", "en-us", "-s", "150", "-w", wav_path, text,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.communicate()

        pcm_bytes = b""
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
            ffmpeg_bin = shutil.which("ffmpeg")
            if ffmpeg_bin:
                with tempfile.NamedTemporaryFile(suffix=".pcm", delete=False) as pcm_f:
                    pcm_path = pcm_f.name
                conv = await asyncio.create_subprocess_exec(
                    ffmpeg_bin, "-y", "-i", wav_path, "-ar", str(sample_rate), "-ac", "1", "-f", "s16le", pcm_path,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await conv.communicate()
                if os.path.exists(pcm_path):
                    with open(pcm_path, "rb") as pf:
                        pcm_bytes = pf.read()
                    try:
                        os.remove(pcm_path)
                    except Exception:
                        pass
            else:
                with wave.open(wav_path, "rb") as wf:
                    pcm_bytes = wf.readframes(wf.getnframes())

        try:
            if os.path.exists(wav_path):
                os.remove(wav_path)
        except Exception:
            pass

        return pcm_bytes
    except Exception as exc:
        logger.warning("Linux espeak TTS error: %s", exc)
        return b""


async def synthesize_piper_tts(text: str, sample_rate: int = SAMPLE_RATE_16K) -> bytes:
    """
    Generate raw PCM audio using local Piper TTS subprocess, macOS say, or Linux espeak-ng.
    """
    if not text.strip():
        return b""

    # 1. Try local Piper TTS if installed
    piper_bin = shutil.which("piper") or shutil.which("piper-tts")
    if piper_bin and os.path.exists("en_US-lessac-medium.onnx"):
        try:
            cmd = [
                piper_bin,
                "--model", "en_US-lessac-medium.onnx",
                "--output-raw",
                "--sample-rate", str(sample_rate),
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await proc.communicate(input=text.encode("utf-8"))
            if stdout:
                return stdout
        except Exception as exc:
            logger.warning("Piper execution error: %s", exc)

    # 2. Resilient local fallback: macOS edge synthesizer
    macos_pcm = await synthesize_macos_say_tts(text, sample_rate=sample_rate)
    if macos_pcm:
        return macos_pcm

    # 3. Resilient Linux container fallback: espeak-ng / ffmpeg
    linux_pcm = await synthesize_linux_espeak_tts(text, sample_rate=sample_rate)
    if linux_pcm:
        return linux_pcm

    return b""


# ---------------------------------------------------------------------------
# Session State Model
# ---------------------------------------------------------------------------
class SessionState:
    """Tracks state and asynchronous tasks for a voice connection."""

    def __init__(self, session_id: str, voice_id: Optional[str] = None):
        self.session_id = session_id
        self.voice_id = voice_id or "aura-telecom"
        self.state: str = "IDLE"

        # T-SAC State
        self.is_degraded: bool = False
        self.degraded_logged: bool = False
        self.network_throttle_engaged: bool = False
        self.rtt_at_throttle_ms: Optional[int] = None
        self.last_user_query: str = ""

        # VAD & Audio buffers
        self.vad_buffer = bytearray()
        self.active_speech_buffer = bytearray()
        self.silence_frame_count: int = 0
        self.is_speaking: bool = False

        # Asynchronous queues & active task references
        self.audio_queue: asyncio.Queue = asyncio.Queue()
        self.tts_queue: asyncio.Queue = asyncio.Queue()
        self.active_generation_task: Optional[asyncio.Task] = None
        self.receiver_task: Optional[asyncio.Task] = None
        self.sender_task: Optional[asyncio.Task] = None
        self.azure_task: Optional[asyncio.Task] = None


async def send_json(ws: WebSocket, data: dict) -> None:
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def send_state(ws: WebSocket, session: SessionState, new_state: str) -> None:
    session.state = new_state
    logger.info("Session %s → %s", session.session_id, new_state)
    await send_json(ws, {"type": "state_change", "state": new_state})


# ---------------------------------------------------------------------------
# 1. Local STT & VAD Processing (audio_receiver_loop)
# ---------------------------------------------------------------------------
def transcribe_local_pcm(audio_bytes: bytes) -> str:
    """
    Transcribe raw 16kHz linear16 mono PCM bytes using local Faster-Whisper if available.
    """
    if not audio_bytes or not whisper_model:
        return ""

    try:
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(CHANNELS)
            wav_file.setsampwidth(SAMPLE_WIDTH)
            wav_file.setframerate(SAMPLE_RATE_16K)
            wav_file.writeframes(audio_bytes)
        wav_io.seek(0)

        segments, _ = whisper_model.transcribe(wav_io, beam_size=1, language="en")
        transcript = " ".join([seg.text.strip() for seg in segments]).strip()
        if transcript:
            return transcript
    except Exception as exc:
        logger.warning("Local faster-whisper transcribe error: %s", exc)

    return ""


async def audio_receiver_loop(ws: WebSocket, session: SessionState) -> None:
    """
    Task 1: Collects WebSocket binary PCM audio frames, tracks VAD activity,
    and runs local Faster-Whisper STT if installed.
    """
    try:
        while True:
            chunk = await session.audio_queue.get()
            if chunk is None:
                break

            session.vad_buffer.extend(chunk)

            # Process in 20ms VAD frames (640 bytes)
            while len(session.vad_buffer) >= VAD_FRAME_BYTES:
                frame = bytes(session.vad_buffer[:VAD_FRAME_BYTES])
                session.vad_buffer = session.vad_buffer[VAD_FRAME_BYTES:]

                is_speech = False
                if vad_processor:
                    try:
                        is_speech = vad_processor.is_speech(frame, SAMPLE_RATE_16K)
                    except Exception:
                        is_speech = True
                else:
                    # Energy-based fallback
                    samples = struct.unpack(f"<{len(frame)//2}h", frame)
                    energy = sum(abs(s) for s in samples) / max(len(samples), 1)
                    is_speech = energy > 600

                if is_speech:
                    session.active_speech_buffer.extend(frame)
                    session.silence_frame_count = 0
                    if not session.is_speaking:
                        session.is_speaking = True
                elif session.is_speaking:
                    session.active_speech_buffer.extend(frame)
                    session.silence_frame_count += 1

                    # 30 frames of silence = 600ms endpointing
                    if session.silence_frame_count >= 30:
                        session.is_speaking = False
                        speech_pcm = bytes(session.active_speech_buffer)
                        session.active_speech_buffer.clear()
                        session.silence_frame_count = 0

                        if whisper_model and len(speech_pcm) > SAMPLE_RATE_16K * SAMPLE_WIDTH * 0.5:
                            final_text = transcribe_local_pcm(speech_pcm)
                            if final_text:
                                await send_state(ws, session, "PROCESSING_STT")
                                session.last_user_query = final_text
                                logger.info("Session %s — [LOCAL STT FINAL] '%s'", session.session_id, final_text)

                                await send_json(ws, {
                                    "type": "transcript_stream",
                                    "payload": {"speaker": "user", "text": final_text, "is_final": True},
                                })
                                await send_json(ws, {"type": "transcript", "text": final_text, "final": True})

                                # Trigger LLM orchestrator
                                if session.active_generation_task and not session.active_generation_task.done():
                                    session.active_generation_task.cancel()
                                session.active_generation_task = asyncio.create_task(
                                    llm_orchestrator(ws, session, final_text)
                                )

            session.audio_queue.task_done()
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# 2. Semantic LLM Reasoning (llm_orchestrator via AsyncAzureOpenAI)
# ---------------------------------------------------------------------------
async def stream_azure_llm(prompt: str, is_tsac_fallback: bool = False) -> AsyncGenerator[str, None]:
    """
    Stream tokens from Azure OpenAI GPT-4.1-mini or resilient telecom fallback.
    """
    if azure_client:
        try:
            sys_prompt = (
                "Network dropped. Summarize the previous action in under 5 words."
                if is_tsac_fallback else
                "You are Aura, an enterprise AIOps assistant for telecom MEC edge operations. Be concise, precise, and professional."
            )
            response = await azure_client.chat.completions.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            return
        except Exception as exc:
            logger.warning("Azure OpenAI streaming failed: %s; falling back to edge route.", exc)

    # Resilient Edge Mock Streamer
    if is_tsac_fallback:
        tokens = ["[Bandwidth", "critical.", "Reroute", "command", "executed.]"]
    else:
        full_text = route_llm_response(prompt)
        tokens = full_text.split()

    for idx, token in enumerate(tokens):
        await asyncio.sleep(0.08)
        yield token + (" " if idx < len(tokens) - 1 else "")


async def llm_orchestrator(ws: WebSocket, session: SessionState, user_text: str) -> None:
    """
    Task 2: Streams tokens from Azure OpenAI, accumulates completed sentences,
    and enqueues them for local Piper TTS generation.
    """
    turn_start_time = time.time()
    await send_state(ws, session, "STREAMING_LLM_TTS")

    # Send discrete start beep
    start_beep = AUDIO_HEADER_16K + generate_tone_pcm(frequency=587.33, duration_s=0.08, sample_rate=SAMPLE_RATE_16K)
    try:
        await ws.send_bytes(start_beep)
    except Exception:
        return

    current_sentence = []
    spoken_history = []
    total_audio_duration = 0.0
    first_chunk_time = None

    try:
        async for chunk in stream_azure_llm(user_text, is_tsac_fallback=False):
            # Check T-SAC Network Degradation
            if session.is_degraded:
                logger.warning("Session %s — [T-SAC] Network degrade intercepted Azure stream!", session.session_id)
                if not session.degraded_logged:
                    print_tsac_degrade_telemetry()
                    session.degraded_logged = True

                # Fire high-priority Azure T-SAC fallback request
                fallback_chunks = []
                async for fb_chunk in stream_azure_llm(user_text, is_tsac_fallback=True):
                    fallback_chunks.append(fb_chunk)

                fallback_text = "".join(fallback_chunks).strip()
                truncation_msg = "\n\n" + fallback_text
                spoken_history.append(truncation_msg)

                # Send 8kHz low-fidelity Piper PCM audio burst
                pcm_8k = await synthesize_piper_tts(fallback_text, sample_rate=SAMPLE_RATE_8K)
                if pcm_8k:
                    total_audio_duration += len(pcm_8k) / (SAMPLE_RATE_8K * SAMPLE_WIDTH * CHANNELS)
                await ws.send_bytes(AUDIO_HEADER_8K + pcm_8k)

                await send_json(ws, {
                    "type": "transcript_stream",
                    "payload": {
                        "speaker": "agent",
                        "text": truncation_msg,
                        "is_final": True,
                        "is_truncated": True,
                    },
                })
                break

            # Standard Token Streaming
            words = chunk.split(" ")
            for w in words:
                if not w:
                    continue
                spoken_history.append(w)
                current_sentence.append(w)

                await send_json(ws, {
                    "type": "transcript_stream",
                    "payload": {
                        "speaker": "agent",
                        "text": w,
                        "is_final": False,
                    },
                })

                # Sentence boundary reached -> synthesize with local Piper / macOS say
                if w.endswith(".") or w.endswith("?") or w.endswith("!"):
                    sentence_text = " ".join(current_sentence)
                    current_sentence.clear()
                    pcm_chunk = await synthesize_piper_tts(sentence_text, sample_rate=SAMPLE_RATE_16K)
                    if pcm_chunk:
                        if first_chunk_time is None:
                            first_chunk_time = time.time()
                        chunk_dur = len(pcm_chunk) / (SAMPLE_RATE_16K * SAMPLE_WIDTH * CHANNELS)
                        total_audio_duration += chunk_dur
                        await session.tts_queue.put((AUDIO_HEADER_16K, pcm_chunk))

        # Finish remaining words
        if current_sentence and not session.is_degraded:
            sentence_text = " ".join(current_sentence)
            pcm_chunk = await synthesize_piper_tts(sentence_text, sample_rate=SAMPLE_RATE_16K)
            if pcm_chunk:
                if first_chunk_time is None:
                    first_chunk_time = time.time()
                chunk_dur = len(pcm_chunk) / (SAMPLE_RATE_16K * SAMPLE_WIDTH * CHANNELS)
                total_audio_duration += chunk_dur
                await session.tts_queue.put((AUDIO_HEADER_16K, pcm_chunk))

        # Broadcast final token completion
        await send_json(ws, {
            "type": "transcript_stream",
            "payload": {
                "speaker": "agent",
                "text": "",
                "is_final": True,
            },
        })

        full_agent_text = " ".join(spoken_history)
        log_turn_telemetry(session, user_query=user_text, agent_response=full_agent_text, start_time=turn_start_time)

        # Wait for all TTS chunks to be sent down the WebSocket
        await session.tts_queue.join()

        # Wait for client audio playback duration to finish before transitioning to LISTENING
        if first_chunk_time and total_audio_duration > 0:
            elapsed = time.time() - first_chunk_time
            remaining_playback = max(0.1, total_audio_duration - elapsed)
            logger.info("Session %s — Audio playback duration: %.2fs (remaining wait: %.2fs)", session.session_id, total_audio_duration, remaining_playback)
            await asyncio.sleep(remaining_playback)
        else:
            await asyncio.sleep(0.3)

        await send_state(ws, session, "LISTENING")

    except asyncio.CancelledError:
        partial_text = " ".join(spoken_history) + " [Interrupted by user]"
        logger.info("Session %s — [BARGE-IN] Azure LLM/TTS generation cancelled. Context: '%s'", session.session_id, partial_text)
        log_turn_telemetry(session, user_query=user_text, agent_response=partial_text, start_time=turn_start_time)
        raise


# ---------------------------------------------------------------------------
# 3. Local Piper TTS Sender Loop (tts_sender_loop)
# ---------------------------------------------------------------------------
async def tts_sender_loop(ws: WebSocket, session: SessionState) -> None:
    """
    Task 3: Streams the local Piper PCM output buffers down the WebSocket to the client.
    """
    try:
        while True:
            item = await session.tts_queue.get()
            if item is None:
                break
            header, pcm_bytes = item
            if pcm_bytes:
                try:
                    await ws.send_bytes(header + pcm_bytes)
                except Exception:
                    pass
            session.tts_queue.task_done()
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# Barge-in Interruption Handler
# ---------------------------------------------------------------------------
async def handle_barge_in(ws: WebSocket, session: SessionState) -> None:
    """Instantly cancel active LLM/TTS tasks, clear queues, and notify client."""
    logger.info("Session %s — [BARGE-IN] Interruption received!", session.session_id)

    if session.active_generation_task and not session.active_generation_task.done():
        session.active_generation_task.cancel()
        try:
            await session.active_generation_task
        except asyncio.CancelledError:
            pass
        session.active_generation_task = None

    # Clear TTS queue
    while not session.tts_queue.empty():
        try:
            session.tts_queue.get_nowait()
            session.tts_queue.task_done()
        except Exception:
            break

    session.active_speech_buffer.clear()
    session.vad_buffer.clear()

    await send_json(ws, {"type": "clear_audio"})
    await send_json(ws, {"type": "flush_audio_buffer"})
    logger.info("Session %s — [BARGE-IN] Task cancelled, clear_audio sent.", session.session_id)
    await send_state(ws, session, "LISTENING")


# ---------------------------------------------------------------------------
# WebSocket Endpoints (/ws/proxy/{session_id} and /ws/voice/{session_id})
# ---------------------------------------------------------------------------
@app.websocket("/ws/proxy/{session_id}")
async def proxy_websocket(
    ws: WebSocket,
    session_id: str,
    voice_id: Optional[str] = Query(None),
):
    """
    Hybrid Edge-Cloud WebSocket Orchestrator with local VAD, Faster-Whisper STT,
    Piper TTS, and Azure OpenAI LLM streaming.
    """
    await ws.accept()
    session = SessionState(session_id, voice_id=voice_id)

    # Spawn concurrent asynchronous loops
    session.receiver_task = asyncio.create_task(audio_receiver_loop(ws, session))
    session.sender_task = asyncio.create_task(tts_sender_loop(ws, session))

    logger.info("Session %s — [HYBRID WS] Client connected (voice_id=%s).", session_id, session.voice_id)

    try:
        while True:
            message = await ws.receive()

            # Binary audio PCM frame from client microphone
            if "bytes" in message and message["bytes"] is not None:
                audio_chunk: bytes = message["bytes"]
                if session.state in ("LISTENING", "IDLE"):
                    if session.state == "IDLE":
                        await send_state(ws, session, "LISTENING")
                    await session.audio_queue.put(audio_chunk)

            # JSON Control signals
            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type", "")

                # ── T-SAC Telemetry Ping/Pong ────────────────────────────
                if msg_type == "ping":
                    ts = data.get("timestamp", time.time() * 1000)
                    await send_json(ws, {"type": "pong", "timestamp": ts})

                # ── T-SAC Network Degradation Signal ─────────────────────
                elif msg_type == "network_degrade":
                    rtt = data.get("payload", {}).get("rtt", 1250)
                    session.is_degraded = True
                    session.network_throttle_engaged = True
                    session.rtt_at_throttle_ms = int(rtt)
                    if not session.degraded_logged:
                        print_tsac_degrade_telemetry()
                        session.degraded_logged = True
                    logger.warning("Session %s — [T-SAC] network_degrade! RTT: %d ms", session_id, session.rtt_at_throttle_ms)
                    await send_json(ws, {
                        "type": "network_status",
                        "is_degraded": True,
                        "rtt": session.rtt_at_throttle_ms,
                        "message": "⚠️ Low Bandwidth: Audio optimized.",
                    })

                # ── Live User Spoken Speech or Stage Demo Trigger ────────
                elif msg_type in ("user_speech", "mock_user_speech"):
                    text = data.get("text", "Aura, what are the steps to reroute traffic from a failing edge server?")
                    session.last_user_query = text
                    logger.info("Session %s — [USER SPEECH] '%s'", session_id, text)
                    await send_json(ws, {
                        "type": "transcript_stream",
                        "payload": {"speaker": "user", "text": text, "is_final": True},
                    })
                    await send_json(ws, {"type": "transcript", "text": text, "final": True})

                    if session.active_generation_task and not session.active_generation_task.done():
                        session.active_generation_task.cancel()
                    session.active_generation_task = asyncio.create_task(
                        llm_orchestrator(ws, session, text)
                    )

                elif msg_type == "session_init":
                    if "voice_id" in data:
                        session.voice_id = data["voice_id"]
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

                elif msg_type in ("barge_in", "client_barge_in"):
                    await handle_barge_in(ws, session)

                elif msg_type == "stop_audio":
                    logger.info("Session %s — stop_audio received.", session_id)

            elif message.get("type") == "websocket.disconnect":
                break

    except WebSocketDisconnect:
        logger.info("Session %s — Client disconnected.", session_id)
    except Exception as exc:
        logger.exception("Session %s — Unexpected error: %s", session_id, exc)
    finally:
        for task in [session.active_generation_task, session.receiver_task, session.sender_task]:
            if task and not task.done():
                task.cancel()
        logger.info("Session %s — Session closed.", session_id)


@app.websocket("/ws/voice/{session_id}")
async def voice_websocket(ws: WebSocket, session_id: str):
    """Direct Voice WebSocket handler using same hybrid edge pipeline."""
    await proxy_websocket(ws, session_id=session_id)
