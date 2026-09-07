/**
 * Aura Voice Agent — Embeddable Web Component (widget.js)
 * =========================================================
 * Specialized Stage Demo:
 * Showcasing Telemetry-Driven Semantic Audio Compression (T-SAC).
 *
 * Demo Shortcuts & Controls:
 * - Baseline Trigger: Double-click microphone launcher OR press Ctrl + Shift + S
 *   (Sends: "Aura, what are the steps to reroute traffic from a failing edge server?")
 * - Crisis Trigger: Press Ctrl + Shift + D (or Cmd + Shift + D)
 *   (Sends: network_degrade with RTT: 1250ms -> Truncates LLM & Swaps TTS Codec to 8kHz)
 * - Visual Proof: Injects amber banner "⚠️ Low Bandwidth: Audio optimized."
 */

(function () {
  'use strict';

  console.log('[Aura Widget] Loading Stage Demo widget.js bundle (T-SAC Ready)...');

  const SAMPLE_RATE_16K = 16000;
  const SAMPLE_RATE_8K = 8000;
  const AUDIO_HEADER_16K = 'AURA';
  const AUDIO_HEADER_8K = 'A8KH';
  const DEMO_QUERY_TEXT = "Aura, what are the steps to reroute traffic from a failing edge server?";

  // -------------------------------------------------------------------------
  // Component Template & Styles (100% Shadow DOM Encapsulated)
  // -------------------------------------------------------------------------
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        display: block !important;
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        box-sizing: border-box !important;
        --primary: #8ed5ff;
        --primary-glow: rgba(142, 213, 255, 0.45);
        --secondary: #5de6ff;
        --amber-warning: #fbbf24;
        --amber-bg: rgba(251, 191, 36, 0.16);
        --amber-border: rgba(251, 191, 36, 0.5);
        --error: #ffb4ab;
        --error-bg: rgba(255, 180, 171, 0.15);
        --bg-dark: #0b1326;
        --card-bg: rgba(15, 23, 42, 0.96);
        --glass-border: rgba(142, 213, 255, 0.3);
        --text-main: #f1f5f9;
        --text-muted: #94a3b8;
      }

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* ── Floating Launcher Trigger ────────────────────────── */
      .launcher-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .launcher-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0284c7, #2563eb, #7c3aed);
        border: 2px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 8px 30px rgba(14, 165, 233, 0.6), 0 2px 10px rgba(0, 0, 0, 0.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        position: relative;
        overflow: hidden;
      }

      .launcher-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 12px 36px rgba(14, 165, 233, 0.8);
      }

      .launcher-btn:active {
        transform: scale(0.95);
      }

      .launcher-icon {
        width: 30px;
        height: 30px;
        fill: none;
        stroke: #ffffff;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
      }

      .pulse-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2.5px solid var(--secondary);
        opacity: 0;
        animation: ring-pulse 2.2s infinite;
        pointer-events: none;
      }

      @keyframes ring-pulse {
        0% { transform: scale(0.85); opacity: 0.9; }
        100% { transform: scale(1.7); opacity: 0; }
      }

      .launcher-tooltip {
        position: absolute;
        right: 76px;
        background: rgba(15, 23, 42, 0.95);
        color: #f1f5f9;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        opacity: 0;
        transform: translateX(10px);
        transition: all 0.2s ease;
      }

      .launcher-container:hover .launcher-tooltip {
        opacity: 1;
        transform: translateX(0);
      }

      /* ── Expandable Voice Card Modal ─────────────────────── */
      .widget-card {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 410px;
        max-width: calc(100vw - 48px);
        background: var(--card-bg);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1.5px solid var(--glass-border);
        border-radius: 24px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px var(--primary-glow);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: bottom right;
      }

      .widget-card.hidden {
        opacity: 0 !important;
        transform: scale(0.85) translateY(20px) !important;
        pointer-events: none !important;
        visibility: hidden !important;
        display: none !important;
      }

      /* Card Header */
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .brand-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .brand-title {
        color: var(--primary);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 1.5px;
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text-muted);
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #64748b;
      }

      .status-pill.active .status-dot {
        background: var(--secondary);
        box-shadow: 0 0 8px var(--secondary);
      }

      .status-pill.speaking .status-dot {
        background: #f43f5e;
        box-shadow: 0 0 8px #f43f5e;
      }

      .close-btn {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: color 0.2s;
      }

      .close-btn:hover {
        color: var(--text-main);
      }

      /* ── T-SAC Low Bandwidth Amber Warning Banner ────────── */
      .bandwidth-banner {
        display: none;
        align-items: center;
        justify-content: space-between;
        background: var(--amber-bg);
        border: 1.5px solid var(--amber-border);
        color: var(--amber-warning);
        font-size: 11px;
        font-weight: 700;
        padding: 9px 16px;
        margin: 12px 20px 0;
        border-radius: 10px;
        letter-spacing: 0.3px;
        animation: amber-glow 1.8s infinite alternate;
      }

      .bandwidth-banner.visible {
        display: flex;
      }

      .bandwidth-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rtt-tag {
        font-size: 10px;
        background: rgba(0, 0, 0, 0.35);
        padding: 2px 7px;
        border-radius: 4px;
        font-family: monospace;
      }

      @keyframes amber-glow {
        0% { box-shadow: 0 0 6px rgba(251, 191, 36, 0.25); }
        100% { box-shadow: 0 0 18px rgba(251, 191, 36, 0.6); }
      }

      /* ── Visualizer & Orb Stage ─────────────────────────── */
      .orb-stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 18px 20px 12px;
        position: relative;
      }

      .orb-container {
        width: 90px;
        height: 90px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .orb-glow-layer {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(93, 230, 255, 0.5) 0%, rgba(14, 165, 233, 0.1) 60%, transparent 80%);
        filter: blur(12px);
        transition: all 0.5s ease;
      }

      .orb-core {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: linear-gradient(135deg, #38bdf8, #6366f1);
        box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.6), 0 0 30px var(--primary-glow);
        transition: all 0.4s ease;
        position: relative;
        z-index: 2;
      }

      .orb-container.state-listening .orb-core {
        transform: scale(1.18);
        background: linear-gradient(135deg, #f43f5e, #fb7185);
        box-shadow: 0 0 35px rgba(244, 63, 94, 0.6);
        animation: orb-breathe 1.5s ease-in-out infinite alternate;
      }

      .orb-container.state-thinking .orb-core {
        transform: scale(1.12);
        background: linear-gradient(135deg, #a855f7, #6366f1);
        box-shadow: 0 0 35px rgba(168, 85, 247, 0.6);
        animation: orb-rotate 1.2s linear infinite;
      }

      .orb-container.state-responding .orb-core {
        transform: scale(1.1);
        background: linear-gradient(135deg, #06b6d4, #3b82f6);
        animation: orb-rotate 3s linear infinite;
      }

      @keyframes orb-breathe {
        0% { transform: scale(1.05); }
        100% { transform: scale(1.22); }
      }

      @keyframes orb-rotate {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
      }

      /* ── One-Tap Quick Operations Chips ────────────────── */
      .quick-chips-row {
        display: flex;
        gap: 6px;
        padding: 8px 20px 4px 20px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .quick-chips-row::-webkit-scrollbar {
        display: none;
      }
      .chip-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 5px 11px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .chip-btn:hover {
        background: rgba(14, 165, 233, 0.2);
        border-color: rgba(14, 165, 233, 0.5);
        color: #38bdf8;
        transform: translateY(-1px);
        box-shadow: 0 2px 10px rgba(14, 165, 233, 0.3);
      }

      /* ── Dialogue / Transcript Pane ─────────────────────── */
      .transcript-box {
        margin: 0 20px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 14px;
        min-height: 100px;
        max-height: 160px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
        line-height: 1.5;
      }

      .msg-row {
        display: flex;
        flex-direction: column;
      }

      .msg-speaker {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1px;
        margin-bottom: 2px;
        text-transform: uppercase;
      }

      .msg-speaker.user { color: var(--secondary); }
      .msg-speaker.agent { color: var(--primary); }

      .msg-text {
        color: var(--text-main);
      }

      .msg-text.interim {
        color: var(--text-muted);
        font-style: italic;
      }

      .msg-text.truncated {
        color: var(--amber-warning);
        font-weight: 700;
        background: rgba(251, 191, 36, 0.1);
        padding: 4px 8px;
        border-radius: 6px;
        border-left: 3px solid var(--amber-warning);
        margin-top: 4px;
      }

      .typing-indicator {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--secondary);
        margin-left: 4px;
        animation: blink 0.8s infinite;
      }

      @keyframes blink {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 1; }
      }

      /* ── Controls & Actions ─────────────────────────────── */
      .action-row {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .btn-primary {
        flex: 1;
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
        border: none;
        border-radius: 12px;
        padding: 12px 16px;
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
      }

      .btn-primary:hover {
        opacity: 0.95;
        box-shadow: 0 4px 15px rgba(14, 165, 233, 0.4);
      }

      .btn-danger {
        background: var(--error-bg);
        border: 1px solid rgba(255, 180, 171, 0.3);
        color: var(--error);
      }

      .btn-danger:hover {
        background: rgba(255, 180, 171, 0.25);
      }

      .btn-barge {
        display: none;
        background: rgba(244, 63, 94, 0.2);
        border: 1px solid rgba(244, 63, 94, 0.5);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 700;
        padding: 9px 12px;
        border-radius: 10px;
        cursor: pointer;
        width: 100%;
        margin-top: 8px;
        text-align: center;
        transition: all 0.2s;
      }

      .btn-barge.visible {
        display: block;
      }

      .btn-barge:hover {
        background: rgba(244, 63, 94, 0.35);
      }

      /* Custom scrollbar */
      .transcript-box::-webkit-scrollbar { width: 4px; }
      .transcript-box::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
      }
    </style>

    <!-- Floating Trigger Launcher -->
    <div class="launcher-container">
      <div class="launcher-tooltip">Double-click or Ctrl+Shift+S: Edge Reroute Demo | Ctrl+Shift+D: Trigger T-SAC</div>
      <div class="launcher-btn" id="launcherBtn" title="Aura Voice Agent (Double-click for Edge Demo)">
        <div class="pulse-ring"></div>
        <svg class="launcher-icon" viewBox="0 0 24 24">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      </div>
    </div>

    <!-- Expandable Voice Agent Card -->
    <div class="widget-card hidden" id="widgetCard">
      <div class="card-header">
        <div class="brand-group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2">
            <path d="M2 10v3"></path><path d="M6 6v11"></path><path d="M10 3v18"></path><path d="M14 8v7"></path><path d="M18 5v13"></path><path d="M22 10v3"></path>
          </svg>
          <span class="brand-title">AURA EDGE OPERATIONS</span>
        </div>
        <div class="header-right">
          <div class="status-pill" id="statusPill">
            <span class="status-dot"></span>
            <span id="statusLabel">Offline</span>
          </div>
          <button class="close-btn" id="closeBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- T-SAC Low Bandwidth Amber Banner -->
      <div class="bandwidth-banner" id="bandwidthBanner">
        <div class="bandwidth-left">
          <span>⚠️</span>
          <span>Low Bandwidth: Audio optimized.</span>
        </div>
        <span class="rtt-tag" id="rttDisplay">RTT: 1250ms</span>
      </div>

      <div class="orb-stage">
        <div class="orb-container aura-orb-container" id="orbContainer">
          <div class="orb-glow-layer"></div>
          <div class="orb-core aura-orb"></div>
        </div>
      </div>

      <div class="transcript-box" id="transcriptBox">
        <div class="msg-row">
          <span class="msg-speaker agent">AURA</span>
          <span class="msg-text">Ready for Edge Telecom Operations. Double-click launcher or press Ctrl+Shift+S.</span>
        </div>
      </div>

      <!-- Quick Action Operations Chips -->
      <div class="quick-chips-row" id="quickChips">
        <button class="chip-btn" data-query="Hi, how are you doing today?">👋 Greeting</button>
        <button class="chip-btn" data-query="Is there any nodes down?">🔴 Nodes Down?</button>
        <button class="chip-btn" data-query="What is average CPU consumption?">📊 Avg CPU</button>
        <button class="chip-btn" data-query="Is there any node CPU more than 80%?">🚨 >80% Spikes</button>
        <button class="chip-btn" data-query="Did we breach the SLA during the edge node downtime?">🛡️ SLA Claim</button>
        <button class="chip-btn" data-query="Reroute traffic from the failing edge server.">⚡ Reroute</button>
      </div>

      <div style="padding: 0 20px;">
        <button class="btn-barge" id="bargeBtn">⚡ Tap to Interrupt (Barge-In)</button>
      </div>

      <div class="action-row">
        <button class="btn-primary" id="connectBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <span id="connectBtnText">CONNECT</span>
        </button>
      </div>
    </div>
  `;

  // -------------------------------------------------------------------------
  // Web Component Class Definition
  // -------------------------------------------------------------------------
  class AuraVoiceAgent extends HTMLElement {
    static get observedAttributes() {
      return ['agent-endpoint', 'theme', 'voice-id'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));

      // Internal State
      this.isOpen = false;
      this.isWsConnected = false;
      this.isDegraded = false;
      this.isAgentSpeaking = false;
      this.currentRtt = 0;
      this.currentState = 'DISCONNECTED';
      this.ws = null;
      this.mediaStream = null;
      this.audioContext = null;
      this.sourceNode = null;
      this.analyser = null;
      this.workletNode = null;
      this.processor = null;
      this.animationFrameId = null;
      this.playbackContext = null;
      this.nextPlaybackTime = 0;
      this.activeSources = [];
      this.agentWords = [];
      this.pingInterval = null;
      this.player = { interrupt: () => this.flushAudioPlayback() };
      this.recognition = null;
      this.isRecognitionActive = false;
      this.isRecording = false;
      this.accumulatedFinalText = '';
      this.lastCommittedUserText = '';
      this.speechDebounceTimer = null;
      this.SILENCE_DEBOUNCE_MS = 750; // Fast natural 750ms silence debounce
      this.isInterrupted = false;
      this.pendingListeningState = false;

      // Elements
      this.launcherBtn = this.shadowRoot.getElementById('launcherBtn');
      this.widgetCard = this.shadowRoot.getElementById('widgetCard');
      this.closeBtn = this.shadowRoot.getElementById('closeBtn');
      this.connectBtn = this.shadowRoot.getElementById('connectBtn');
      this.connectBtnText = this.shadowRoot.getElementById('connectBtnText');
      this.statusPill = this.shadowRoot.getElementById('statusPill');
      this.statusLabel = this.shadowRoot.getElementById('statusLabel');
      this.orbContainer = this.shadowRoot.getElementById('orbContainer');
      this.transcriptBox = this.shadowRoot.getElementById('transcriptBox');
      this.bargeBtn = this.shadowRoot.getElementById('bargeBtn');
      this.bandwidthBanner = this.shadowRoot.getElementById('bandwidthBanner');
      this.rttDisplay = this.shadowRoot.getElementById('rttDisplay');
      this.quickChips = this.shadowRoot.getElementById('quickChips');
    }

    connectedCallback() {
      console.log('[Aura Widget] <aura-voice-agent> connected to DOM (Hackathon Stage Ready).');

      // Global user gesture unlock for browser audio autoplay policies
      this.ensureAudioContextUnlocked();
      document.addEventListener('pointerdown', () => this.ensureAudioContextUnlocked(), { once: true });

      // Click to toggle drawer
      this.launcherBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ensureAudioContextUnlocked();
        this.toggleCard();
      });

      // Double-click launcher -> Trigger Baseline Demo Query
      this.launcherBtn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.ensureAudioContextUnlocked();
        console.log('[STAGE DEMO] Launcher double-clicked — firing baseline demo query!');
        this.triggerBaselineDemo();
      });

      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCard(false);
      });

      this.connectBtn.addEventListener('click', () => {
        this.ensureAudioContextUnlocked();
        this.handleConnectToggle();
      });
      this.bargeBtn.addEventListener('click', () => this.handleBargeIn());

      // Click on Orb to immediately commit user speech or finish listening
      this.orbContainer.addEventListener('click', () => {
        this.ensureAudioContextUnlocked();
        if (this.currentState === 'LISTENING') {
          console.log('[Widget Mic] Orb clicked — committing speech immediately.');
          if (this.accumulatedFinalText) {
            this.commitUserSpeech();
          } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop_audio' }));
          }
        }
      });

      // Click on Quick Action Suggestion Chips
      if (this.quickChips) {
        this.quickChips.addEventListener('click', (e) => {
          const chip = e.target.closest('.chip-btn');
          if (chip && chip.dataset.query) {
            e.stopPropagation();
            this.ensureAudioContextUnlocked();
            const queryText = chip.dataset.query;
            console.log('[Widget Chip] ⚡ Fired quick query:', queryText);
            this.sendTextQuery(queryText);
          }
        });
      }

      // ── Keyboard Shortcuts: Spacebar/Escape (Barge-in), Ctrl+Shift+S (Demo), Ctrl+Shift+D (Crisis)
      this.handleKeydown = (e) => {
        // Spacebar or Escape during speech -> instant interruption
        if ((e.code === 'Space' || e.key === 'Escape') && this.isAgentSpeaking) {
          e.preventDefault();
          console.log('[Widget Shortcut] Spacebar/Escape pressed — interrupting Aura!');
          this.handleBargeIn();
          return;
        }

        const isModifier = e.ctrlKey || e.metaKey;
        if (isModifier && e.shiftKey) {
          this.ensureAudioContextUnlocked();
          if (e.key === 'S' || e.key === 's') {
            e.preventDefault();
            console.warn('[STAGE DEMO] Ctrl+Shift+S pressed — firing baseline demo query!');
            this.triggerBaselineDemo();
          } else if (e.key === 'D' || e.key === 'd') {
            e.preventDefault();
            console.warn('[STAGE DEMO] Ctrl+Shift+D pressed — firing T-SAC Crisis (RTT: 1250ms)!');
            this.triggerNetworkDegrade(1250);
          }
        }
      };
      window.addEventListener('keydown', this.handleKeydown);

      // Register global reference for easy scripting
      window.__AuraVoiceAgentInstance = this;
    }

    getAudioContext() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        try {
          this.audioContext = new AudioCtx();
        } catch (e) {
          console.warn('[Widget Audio] Could not initialize AudioContext:', e);
        }
      }
      return this.audioContext;
    }

    async ensureAudioContextUnlocked() {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
          console.log('[Widget Audio] 🔊 AudioContext resumed (state: running)');
        } catch (err) {
          console.warn('[Widget Audio] Could not resume AudioContext:', err);
        }
      }
      if (ctx) {
        this.nextPlaybackTime = ctx.currentTime;
      }

      if (window.speechSynthesis && window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.resume();
        } catch (e) {}
      }
    }

    disconnectedCallback() {
      this.disconnect();
      if (this.handleKeydown) {
        window.removeEventListener('keydown', this.handleKeydown);
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      // Attributes handler
    }

    get endpoint() {
      const custom = this.getAttribute('agent-endpoint');
      if (custom) return custom;
      const host = window.location.host || 'localhost:8000';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const sessionId = 'session-' + Math.random().toString(36).substring(2, 9);
      return `${wsProtocol}//${host}/ws/proxy/${sessionId}`;
    }

    get voiceId() {
      return this.getAttribute('voice-id') || 'aura-telecom-edge';
    }

    // ── Public API & Stage Triggers ─────────────────────────────────────────

    open() {
      this.toggleCard(true);
    }

    close() {
      this.toggleCard(false);
    }

    toggle() {
      this.toggleCard();
    }

    toggleCard(forceOpen) {
      this.isOpen = forceOpen !== undefined ? forceOpen : !this.isOpen;
      if (this.isOpen) {
        this.widgetCard.classList.remove('hidden');
      } else {
        this.widgetCard.classList.add('hidden');
      }
    }

    sendTextQuery(queryText) {
      if (!queryText || !queryText.trim()) return;
      const clean = queryText.trim();
      this.ensureAudioContextUnlocked();
      this.open();

      const doSend = () => {
        this.isInterrupted = false;
        this.lastCommittedUserText = clean;
        this.appendTranscript('USER', clean, false);
        this.updateStateUI('THINKING');

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'user_speech',
              text: clean,
            })
          );
        }
      };

      if (!this.isWsConnected) {
        this.connect();
        const checkInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            setTimeout(doSend, 150);
          }
        }, 80);
      } else {
        doSend();
      }
    }

    triggerBaselineDemo() {
      this.open();
      // Ensure clean start
      this.bandwidthBanner.classList.remove('visible');
      this.isDegraded = false;

      const sendQuery = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'mock_user_speech',
              text: DEMO_QUERY_TEXT,
            })
          );
        }
      };

      if (!this.isWsConnected) {
        this.connect();
        const checkInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            setTimeout(sendQuery, 150);
          }
        }, 80);
      } else {
        sendQuery();
      }
    }

    triggerNetworkDegrade(rttValue = 1250) {
      this.isDegraded = true;
      this.currentRtt = rttValue;
      this.bandwidthBanner.classList.add('visible');
      this.rttDisplay.textContent = `RTT: ${rttValue}ms`;

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'network_degrade',
            payload: { rtt: rttValue },
          })
        );
        console.warn(`[T-SAC] Sent network_degrade message with RTT=${rttValue}ms`);
      }
    }

    updateStateUI(state) {
      this.currentState = state;
      this.statusPill.className = 'status-pill';
      this.orbContainer.className = 'orb-container';
      this.bargeBtn.classList.remove('visible');

      switch (state) {
        case 'DISCONNECTED':
          this.statusLabel.textContent = 'Offline';
          this.connectBtnText.textContent = 'CONNECT';
          this.connectBtn.className = 'btn-primary';
          this.bandwidthBanner.classList.remove('visible');
          this.isDegraded = false;
          break;
        case 'CONNECTING':
          this.statusLabel.textContent = 'Connecting...';
          this.statusPill.classList.add('active');
          this.connectBtnText.textContent = 'CONNECTING...';
          break;
        case 'LISTENING':
          this.statusLabel.textContent = 'Listening';
          this.statusPill.classList.add('speaking');
          this.orbContainer.classList.add('state-listening');
          this.connectBtnText.textContent = 'DISCONNECT';
          this.connectBtn.className = 'btn-primary btn-danger';
          break;
        case 'THINKING':
        case 'PROCESSING_STT':
          this.statusLabel.textContent = 'Aura is thinking...';
          this.statusPill.classList.add('active');
          this.orbContainer.classList.add('state-thinking');
          break;
        case 'STREAMING_LLM_TTS':
          this.statusLabel.textContent = 'AI Responding';
          this.statusPill.classList.add('active');
          this.orbContainer.classList.add('state-responding');
          this.bargeBtn.classList.add('visible');
          break;
        case 'IDLE':
          this.statusLabel.textContent = 'Ready';
          this.statusPill.classList.add('active');
          this.connectBtnText.textContent = 'DISCONNECT';
          this.connectBtn.className = 'btn-primary btn-danger';
          break;
      }
    }

    appendTranscript(speaker, text, isInterim = false, isTruncated = false) {
      if (!text || !text.trim()) return;
      const cleanText = text.trim();
      const speakerNormalized = speaker.toUpperCase();

      if (isInterim) {
        // If an agent bubble was active, finalize it first so interim user speech stays below it
        const activeAgent = this.transcriptBox.querySelector('.msg-agent-active');
        if (activeAgent) {
          activeAgent.classList.remove('msg-agent-active');
        }

        let interimElem = this.transcriptBox.querySelector('.msg-interim');
        if (!interimElem) {
          interimElem = document.createElement('div');
          interimElem.className = 'msg-row msg-interim';
          interimElem.innerHTML = `<span class="msg-speaker user">YOU</span><span class="msg-text interim"></span>`;
          this.transcriptBox.appendChild(interimElem);
        }
        const textElem = interimElem.querySelector('.msg-text');
        if (textElem) {
          textElem.innerHTML = `${cleanText} <span class="typing-indicator"></span>`;
        }
      } else {
        // Finalize any open active agent bubble before committing user message
        const activeAgent = this.transcriptBox.querySelector('.msg-agent-active');
        if (activeAgent && speakerNormalized === 'USER') {
          activeAgent.classList.remove('msg-agent-active');
        }

        // Deduplication: check the last non-interim row in the transcript
        const allRows = this.transcriptBox.querySelectorAll('.msg-row:not(.msg-interim)');
        const lastRow = allRows.length > 0 ? allRows[allRows.length - 1] : null;
        if (lastRow) {
          const lastSpeaker = lastRow.querySelector('.msg-speaker')?.textContent?.trim()?.toUpperCase();
          const lastText = lastRow.querySelector('.msg-text')?.textContent?.trim();
          const expectedSpeaker = speakerNormalized === 'USER' ? 'YOU' : 'AURA';
          if (lastSpeaker === expectedSpeaker && lastText === cleanText) {
            // Already rendered, remove any leftover interim and return
            const leftoverInterim = this.transcriptBox.querySelector('.msg-interim');
            if (leftoverInterim) leftoverInterim.remove();
            this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
            return;
          }
        }

        // If an interim element exists and we are finalizing USER speech, convert it in-place!
        const interimElem = this.transcriptBox.querySelector('.msg-interim');
        let msgRow;
        if (interimElem && speakerNormalized === 'USER') {
          msgRow = interimElem;
          msgRow.className = 'msg-row';
        } else {
          if (interimElem) interimElem.remove();
          msgRow = document.createElement('div');
          msgRow.className = 'msg-row';
          this.transcriptBox.appendChild(msgRow);
        }

        const speakerClass = speakerNormalized === 'USER' ? 'user' : 'agent';
        const speakerLabel = speakerNormalized === 'USER' ? 'YOU' : 'AURA';
        const textClass = isTruncated ? 'msg-text truncated' : 'msg-text';
        msgRow.innerHTML = `<span class="msg-speaker ${speakerClass}">${speakerLabel}</span><span class="${textClass}">${cleanText}</span>`;
      }
      this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
    }

    updateAgentStream(text, isFinal, isTruncated = false) {
      if (!text || !text.trim()) return;
      const cleanText = text.trim();

      // Remove any leftover interim user element before streaming agent words
      const interimElem = this.transcriptBox.querySelector('.msg-interim');
      if (interimElem) {
        interimElem.remove();
      }

      let agentRow = this.transcriptBox.querySelector('.msg-agent-active');
      if (!agentRow) {
        agentRow = document.createElement('div');
        agentRow.className = 'msg-row msg-agent-active';
        agentRow.innerHTML = `<span class="msg-speaker agent">AURA</span><span class="msg-text"></span>`;
        this.transcriptBox.appendChild(agentRow);
      }
      const textElem = agentRow.querySelector('.msg-text');
      if (textElem) {
        textElem.textContent = cleanText;
        if (isTruncated) {
          textElem.className = 'msg-text truncated';
        }
      }
      if (isFinal) {
        agentRow.classList.remove('msg-agent-active');
        this.agentWords = [];
      }
      this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
    }

    // ── Live Speech Recognition (Web Speech API) ───────────────────────────

    commitUserSpeech() {
      if (this.speechDebounceTimer) {
        clearTimeout(this.speechDebounceTimer);
        this.speechDebounceTimer = null;
      }

      const spokenText = (this.accumulatedFinalText || '').trim();
      this.accumulatedFinalText = '';

      if (!spokenText) return;

      this.isInterrupted = false; // Reset interrupted flag for the new question turn
      this.lastCommittedUserText = spokenText;

      console.log('[Widget STT] 🗣️ Committed full user speech:', spokenText);
      // Immediately display finalized bubble locally
      this.appendTranscript('USER', spokenText, false);
      this.updateStateUI('THINKING');

      // Transmit to backend orchestrator
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'user_speech',
            text: spokenText,
          })
        );
      }
    }

    startSpeechRecognition() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        console.warn('[Widget STT] Web Speech API SpeechRecognition is not supported in this browser.');
        return;
      }

      if (this.recognition) {
        try {
          this.recognition.abort();
        } catch (e) {}
        this.recognition = null;
      }

      this.accumulatedFinalText = '';
      if (this.speechDebounceTimer) {
        clearTimeout(this.speechDebounceTimer);
        this.speechDebounceTimer = null;
      }

      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          this.isRecognitionActive = true;
          console.log('[Widget STT] 🎙️ Web Speech API live speech recognition active.');
        };

        recognition.onresult = (event) => {
          // If user speaks while agent is actively outputting, trigger instant barge-in!
          if (this.currentState === 'STREAMING_LLM_TTS' && this.isAgentSpeaking) {
            console.log('[Widget STT] User speech detected during agent response — firing instant Barge-In!');
            this.handleBargeIn();
          }

          let interimTranscript = '';
          let newFinalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              newFinalTranscript += ' ' + transcript;
            } else {
              interimTranscript += ' ' + transcript;
            }
          }

          if (newFinalTranscript.trim()) {
            this.accumulatedFinalText = (this.accumulatedFinalText + ' ' + newFinalTranscript).trim();
          }

          const combinedInProgress = (this.accumulatedFinalText + ' ' + interimTranscript).trim();
          if (combinedInProgress) {
            this.appendTranscript('USER', combinedInProgress, true);
          }

          // Reset silence timer on incoming speech activity
          if (this.speechDebounceTimer) {
            clearTimeout(this.speechDebounceTimer);
            this.speechDebounceTimer = null;
          }

          // When user pauses for >1.6s after uttering words, commit and send
          if (this.accumulatedFinalText) {
            this.speechDebounceTimer = setTimeout(() => {
              this.commitUserSpeech();
            }, this.SILENCE_DEBOUNCE_MS);
          }
        };

        recognition.onerror = (event) => {
          console.warn('[Widget STT] Recognition notice/error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            this.isRecognitionActive = false;
          }
        };

        recognition.onend = () => {
          this.isRecognitionActive = false;
          // Commit any remaining speech if timer was pending
          if (this.accumulatedFinalText && !this.speechDebounceTimer) {
            this.commitUserSpeech();
          }
          // Auto-restart if we are still actively recording and listening
          if (this.isRecording && this.currentState === 'LISTENING') {
            try {
              recognition.start();
            } catch (e) {}
          }
        };

        this.recognition = recognition;
        recognition.start();
      } catch (err) {
        console.warn('[Widget STT] Failed to start SpeechRecognition:', err);
      }
    }

    stopSpeechRecognition() {
      if (this.speechDebounceTimer) {
        clearTimeout(this.speechDebounceTimer);
        this.speechDebounceTimer = null;
      }
      this.accumulatedFinalText = '';
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
        this.recognition = null;
      }
      this.isRecognitionActive = false;
    }

    // ── Audio In: Web Audio API & AudioWorklet Capture (16kHz PCM) ─────────

    async startRecording() {
      try {
        if (this.mediaStream && this.isRecording) {
          return;
        }
        this.isRecording = true;

        // 0. Start live Speech Recognition
        this.startSpeechRecognition();

        console.log('[Widget Mic] 🎙️ Requesting microphone access (voice optimized)...');
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const ctx = this.getAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }

        if (this.sourceNode) {
          try { this.sourceNode.disconnect(); } catch (e) {}
        }
        const sourceNode = ctx.createMediaStreamSource(this.mediaStream);
        this.sourceNode = sourceNode;

        // 1. Audio Graph Configuration: AnalyserNode
        if (!this.analyser) {
          this.analyser = ctx.createAnalyser();
          this.analyser.fftSize = 256; // 128 frequency bins (fast, responsive)
          this.analyser.smoothingTimeConstant = 0.8; // Smooth out jitter
        }
        try {
          sourceNode.connect(this.analyser);
        } catch (e) {}

        // Start Real-Time Volume Visualizer Loop
        this.updateVisualizer();

        // 2. AudioWorkletNode setup & connection
        let workletLoaded = false;
        if (ctx.audioWorklet) {
          try {
            await ctx.audioWorklet.addModule('/static/recorder-worklet.js');
            this.workletNode = new AudioWorkletNode(ctx, 'recorder-worklet');

            this.workletNode.port.onmessage = (event) => {
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Instantly stream 16-bit PCM buffer over active WebSocket
                const buffer = event.data instanceof ArrayBuffer ? event.data : event.data.buffer;
                this.ws.send(buffer);
              }
            };

            // Connect source to AudioWorkletNode
            sourceNode.connect(this.workletNode);
            workletLoaded = true;
            console.log('[Widget Mic] ✓ AudioWorklet active.');
          } catch (workletErr) {
            console.warn('[Widget Mic] AudioWorklet load fallback to ScriptProcessor:', workletErr);
          }
        }

        // ScriptProcessor fallback for environments without worklet support
        if (!workletLoaded) {
          this.processor = ctx.createScriptProcessor(4096, 1, 1);
          this.processor.onaudioprocess = (e) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const buffer = new ArrayBuffer(inputData.length * 2);
            const view = new DataView(buffer);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            }
            this.ws.send(buffer);
          };
          sourceNode.connect(this.processor);
          // Connect to zero-gain node to prevent microphone audio loopback into speakers
          const muteNode = ctx.createGain();
          muteNode.gain.value = 0;
          this.processor.connect(muteNode);
          muteNode.connect(ctx.destination);
          console.log('[Widget Mic] ✓ ScriptProcessor fallback active.');
        }
      } catch (err) {
        console.warn('[Widget Mic] Notice initializing microphone stream:', err);
      }
    }

    updateVisualizer() {
      if (!this.analyser) return;

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const orb = this.shadowRoot.querySelector('.aura-orb') || this.shadowRoot.querySelector('.orb-core');
      const orbGlow = this.shadowRoot.querySelector('.orb-glow-layer');

      const render = () => {
        if (!this.analyser || this.currentState !== 'LISTENING') return;

        try {
          this.analyser.getByteFrequencyData(dataArray);
        } catch (e) {
          return;
        }

        // Compute Root Mean Square (RMS) / average volume across bins
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const average = sum / dataArray.length; // Range: 0 to 255
        const normalizedVolume = Math.min(Math.max(average / 128, 0), 1); // Range: 0.0 to 1.0

        // ── Client-Side VAD: detect user interruption when agent is speaking ──
        if (normalizedVolume > 0.15 && this.isAgentSpeaking) {
          console.log(`[Widget VAD] 🗣️ User speech detected (volume: ${normalizedVolume.toFixed(2)}) — Triggering instant Barge-In!`);
          this.isAgentSpeaking = false; // Debounce
          this.player.interrupt(); // Immediately stop speakers without waiting for server round-trip
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'barge_in' }));
          }
        }

        if (orb) {
          orb.style.transform = `scale(${1 + normalizedVolume * 0.35})`;
          orb.style.boxShadow = `0 0 ${15 + normalizedVolume * 40}px rgba(56, 189, 248, ${0.4 + normalizedVolume * 0.6})`;
        }
        if (orbGlow) {
          orbGlow.style.opacity = `${0.3 + normalizedVolume * 0.7}`;
          orbGlow.style.transform = `scale(${1 + normalizedVolume * 0.4})`;
        }

        this.animationFrameId = window.requestAnimationFrame(render);
      };

      this.animationFrameId = window.requestAnimationFrame(render);
    }

    stopRecording() {
      this.isRecording = false;
      this.stopSpeechRecognition();

      if (this.animationFrameId) {
        window.cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      if (this.workletNode) {
        try {
          this.workletNode.port.onmessage = null;
          this.workletNode.disconnect();
        } catch (e) {}
        this.workletNode = null;
      }
      if (this.processor) {
        try { this.processor.disconnect(); } catch (e) {}
        this.processor = null;
      }
      if (this.analyser) {
        try { this.analyser.disconnect(); } catch (e) {}
        this.analyser = null;
      }
      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch (e) {}
        this.sourceNode = null;
      }
      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach((t) => t.stop());
        } catch (e) {}
        this.mediaStream = null;
      }

      // Reset orb styles to default idle scale and resting glow
      const orb = this.shadowRoot?.querySelector('.aura-orb') || this.shadowRoot?.querySelector('.orb-core');
      if (orb) {
        orb.style.transform = 'scale(1)';
        orb.style.boxShadow = '';
      }
      const orbGlow = this.shadowRoot?.querySelector('.orb-glow-layer');
      if (orbGlow) {
        orbGlow.style.opacity = '';
        orbGlow.style.transform = '';
      }

      console.log('[Widget Mic] 🛑 Microphone stream paused.');
    }

    // Method aliases for backward compatibility
    startMicrophone() {
      return this.startRecording();
    }

    stopMicrophone() {
      return this.stopRecording();
    }

    // ── Audio Out: Web Audio API Playback (16kHz & 8kHz) ────────────────────

    playPcmChunk(arrayBuffer) {
      try {
        let pcmData = arrayBuffer;
        let chunkSampleRate = SAMPLE_RATE_16K;

        if (arrayBuffer.byteLength >= 4) {
          const header = new Uint8Array(arrayBuffer, 0, 4);
          const headerStr = String.fromCharCode(...header);

          if (headerStr === AUDIO_HEADER_8K) {
            pcmData = arrayBuffer.slice(4);
            chunkSampleRate = SAMPLE_RATE_8K;
            console.log('[Widget Audio] 🔊 Playing 8kHz low-fidelity audio burst (T-SAC Codec Swapped)');
          } else if (headerStr === AUDIO_HEADER_16K) {
            pcmData = arrayBuffer.slice(4);
            chunkSampleRate = SAMPLE_RATE_16K;
          }
        }
        if (pcmData.byteLength === 0) return;

        this.isAgentSpeaking = true;

        const int16 = new Int16Array(pcmData);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        const ctx = this.getAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const audioBuf = ctx.createBuffer(1, float32.length, chunkSampleRate);
        audioBuf.getChannelData(0).set(float32);

        const source = ctx.createBufferSource();
        source.buffer = audioBuf;
        source.connect(ctx.destination);

        const now = ctx.currentTime;
        const startTime = Math.max(now, this.nextPlaybackTime);
        source.start(startTime);
        this.nextPlaybackTime = startTime + audioBuf.duration;

        this.activeSources.push(source);
        source.onended = () => {
          this.activeSources = this.activeSources.filter((s) => s !== source);
          if (this.activeSources.length === 0) {
            this.isAgentSpeaking = false;
            if (this.pendingListeningState || this.currentState === 'LISTENING') {
              this.pendingListeningState = false;
              this.updateStateUI('LISTENING');
              const activeAgent = this.transcriptBox?.querySelector('.msg-agent-active');
              if (activeAgent) {
                activeAgent.classList.remove('msg-agent-active');
              }
              this.startRecording();
            }
          }
        };
      } catch (err) {
        console.warn('[Widget Audio Playback] Notice playing chunk:', err);
      }
    }

    speakStreamWord(word, isFinal) {
      if (this.isInterrupted) return;
      if (!this.spokenBuffer) this.spokenBuffer = [];
      if (word && word.trim()) {
        this.spokenBuffer.push(word.trim());
      }

      // Speak when sentence/phrase boundary reached or stream is final
      const isBoundary = word && (
        word.endsWith('.') || word.endsWith('?') || word.endsWith('!') || 
        word.endsWith(';') || word.endsWith(':') || word.endsWith('\n')
      );

      if (isBoundary || isFinal) {
        const sentence = this.spokenBuffer.join(' ').trim();
        this.spokenBuffer = [];
        if (sentence && window.speechSynthesis && !this.isInterrupted) {
          try {
            // Unpause browser SpeechSynthesis if stuck in paused state
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }

            const utter = new SpeechSynthesisUtterance(sentence);
            utter.rate = 1.05;
            utter.pitch = 1.0;
            utter.lang = 'en-US';

            // Retain reference in window to prevent Chrome V8 garbage collection mid-speech
            if (!window._activeSpeechUtterances) window._activeSpeechUtterances = [];
            window._activeSpeechUtterances.push(utter);

            utter.onstart = () => {
              if (!this.isInterrupted) {
                this.isAgentSpeaking = true;
              }
            };
            utter.onend = () => {
              window._activeSpeechUtterances = (window._activeSpeechUtterances || []).filter((u) => u !== utter);
              if ((!window._activeSpeechUtterances || window._activeSpeechUtterances.length === 0) &&
                  this.activeSources.length === 0) {
                this.isAgentSpeaking = false;
                if (this.pendingListeningState || this.currentState === 'LISTENING') {
                  this.pendingListeningState = false;
                  this.updateStateUI('LISTENING');
                  this.startRecording();
                }
              }
            };
            utter.onerror = (e) => {
              window._activeSpeechUtterances = (window._activeSpeechUtterances || []).filter((u) => u !== utter);
              if ((!window._activeSpeechUtterances || window._activeSpeechUtterances.length === 0) &&
                  this.activeSources.length === 0) {
                this.isAgentSpeaking = false;
                if (this.pendingListeningState || this.currentState === 'LISTENING') {
                  this.pendingListeningState = false;
                  this.updateStateUI('LISTENING');
                  this.startRecording();
                }
              }
            };

            window.speechSynthesis.speak(utter);
          } catch (e) {
            console.warn('[Widget TTS] Speech error:', e);
          }
        }
      }
    }

    flushAudioPlayback() {
      this.pendingListeningState = false;
      this.spokenBuffer = [];
      if (window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch (e) {}
      }
      if (window._activeSpeechUtterances) {
        window._activeSpeechUtterances = [];
      }
      this.activeSources.forEach((src) => {
        try {
          src.stop();
          src.disconnect();
        } catch (e) {}
      });
      this.activeSources = [];
      this.isAgentSpeaking = false;
      const ctx = this.getAudioContext();
      if (ctx) {
        this.nextPlaybackTime = ctx.currentTime;
      }
    }

    // ── Telemetry Polling (RTT Ping/Pong) ───────────────────────────────────

    startTelemetryPolling() {
      this.stopTelemetryPolling();
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const pingPayload = {
            type: 'ping',
            timestamp: Date.now(),
          };
          this.ws.send(JSON.stringify(pingPayload));
        }
      }, 2000);
    }

    stopTelemetryPolling() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    }

    // ── WebSocket Connection & Pipeline ─────────────────────────────────────

    handleConnectToggle() {
      if (this.isWsConnected) {
        this.disconnect();
      } else {
        this.connect();
      }
    }

    connect() {
      const url = this.endpoint;
      console.log('[Widget WS] Connecting to:', url);
      this.updateStateUI('CONNECTING');

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.isWsConnected = true;
        console.log('[Widget WS] Connected successfully.');
        this.ws.send(
          JSON.stringify({
            type: 'session_init',
            voice_id: this.voiceId,
          })
        );
        this.startTelemetryPolling();
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (!this.isInterrupted) {
            this.isAgentSpeaking = true;
            this.playPcmChunk(event.data);
          }
          return;
        }

        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'clear_audio':
            case 'flush_audio_buffer':
              this.isInterrupted = true;
              this.isAgentSpeaking = false;
              this.flushAudioPlayback();
              break;

            case 'pong': {
              const rtt = Date.now() - (msg.timestamp || Date.now());
              this.currentRtt = rtt;
              if (rtt > 800 && !this.isDegraded) {
                console.warn(`[T-SAC] Measured RTT ${rtt}ms > 800ms! Triggering degradation.`);
                this.triggerNetworkDegrade(rtt);
              }
              break;
            }

            case 'network_status': {
              if (msg.is_degraded) {
                this.isDegraded = true;
                this.bandwidthBanner.classList.add('visible');
                this.rttDisplay.textContent = `RTT: ${msg.rtt || 1250}ms`;
              }
              break;
            }

            case 'state_change': {
              if (msg.state === 'LISTENING' || msg.state === 'IDLE') {
                if (this.activeSources.length > 0) {
                  // Audio chunks are still rendering out of speakers; defer recording to prevent mic feedback
                  this.pendingListeningState = true;
                } else {
                  this.pendingListeningState = false;
                  this.isAgentSpeaking = false;
                  this.updateStateUI(msg.state);
                  const activeAgent = this.transcriptBox?.querySelector('.msg-agent-active');
                  if (activeAgent) {
                    activeAgent.classList.remove('msg-agent-active');
                  }
                  this.startRecording();
                }
              } else if (msg.state === 'STREAMING_LLM_TTS') {
                this.pendingListeningState = false;
                this.isInterrupted = false;
                this.isAgentSpeaking = true;
                this.updateStateUI(msg.state);
                this.agentWords = [];
                this.spokenBuffer = [];
                const activeAgent = this.transcriptBox?.querySelector('.msg-agent-active');
                if (activeAgent) {
                  activeAgent.classList.remove('msg-agent-active');
                }
              } else {
                this.updateStateUI(msg.state);
              }
              break;
            }

            case 'transcript_interim':
              if (msg.payload?.text) {
                this.appendTranscript('USER', msg.payload.text, true);
              }
              break;

            case 'transcript_stream': {
              if (this.isInterrupted && msg.payload?.speaker === 'agent') {
                return; // Discard late streaming chunks from interrupted response
              }
              const isTruncated = msg.payload?.is_truncated || false;
              if (msg.payload?.speaker === 'user') {
                const userText = (msg.payload.text || '').trim();
                if (userText && userText !== this.lastCommittedUserText) {
                  this.lastCommittedUserText = userText;
                  this.appendTranscript('USER', userText, false);
                }
              } else if (msg.payload?.speaker === 'agent') {
                const word = msg.payload.text || '';
                this.agentWords.push(word);
                this.updateAgentStream(this.agentWords.join(' '), msg.payload.is_final, isTruncated);
              }
              break;
            }
          }
        } catch (err) {
          console.error('[Widget WS] Message parse error:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Widget WS] Error:', err);
        this.disconnect();
      };

      this.ws.onclose = () => {
        this.disconnect();
      };
    }

    disconnect() {
      this.stopTelemetryPolling();
      this.stopMicrophone();
      this.flushAudioPlayback();
      this.isAgentSpeaking = false;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.isWsConnected = false;
      this.isDegraded = false;
      this.updateStateUI('DISCONNECTED');
    }

    handleBargeIn() {
      console.log('[Widget] ⚡ Instant barge-in interruption triggered!');
      this.isInterrupted = true;
      this.isAgentSpeaking = false;
      this.flushAudioPlayback();
      
      const activeAgent = this.transcriptBox?.querySelector('.msg-agent-active');
      if (activeAgent) {
        activeAgent.classList.remove('msg-agent-active');
      }
      this.agentWords = [];

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'barge_in' }));
      }
      this.updateStateUI('LISTENING');
      this.startRecording();
    }
  }

  // Global helper namespace
  window.AuraVoice = {
    open: function () {
      const el = document.querySelector('aura-voice-agent');
      if (el && typeof el.open === 'function') el.open();
    },
    close: function () {
      const el = document.querySelector('aura-voice-agent');
      if (el && typeof el.close === 'function') el.close();
    },
    toggle: function () {
      const el = document.querySelector('aura-voice-agent');
      if (el && typeof el.toggle === 'function') el.toggle();
    },
    triggerBaselineDemo: function () {
      const el = document.querySelector('aura-voice-agent');
      if (el && typeof el.triggerBaselineDemo === 'function') {
        el.triggerBaselineDemo();
      }
    },
    triggerCrisisDemo: function () {
      const el = document.querySelector('aura-voice-agent');
      if (el && typeof el.triggerNetworkDegrade === 'function') {
        el.triggerNetworkDegrade(1250);
      }
    },
  };

  // Register Custom Element
  if (!customElements.get('aura-voice-agent')) {
    customElements.define('aura-voice-agent', AuraVoiceAgent);
    console.log('[Aura Widget] <aura-voice-agent> registered with Telecom Edge Demo flow.');
  }

  // Auto-bind any data-aura-open or data-aura-demo buttons on host page
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-aura-demo]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.AuraVoice.triggerBaselineDemo();
      });
    });
    document.querySelectorAll('[data-aura-open]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.AuraVoice.open();
      });
    });
  });
})();
