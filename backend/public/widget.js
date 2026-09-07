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
        <div class="orb-container" id="orbContainer">
          <div class="orb-glow-layer"></div>
          <div class="orb-core"></div>
        </div>
      </div>

      <div class="transcript-box" id="transcriptBox">
        <div class="msg-row">
          <span class="msg-speaker agent">AURA</span>
          <span class="msg-text">Ready for Edge Telecom Operations. Double-click launcher or press Ctrl+Shift+S.</span>
        </div>
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
      this.currentRtt = 0;
      this.currentState = 'DISCONNECTED';
      this.ws = null;
      this.mediaStream = null;
      this.audioContext = null;
      this.processor = null;
      this.playbackContext = null;
      this.nextPlaybackTime = 0;
      this.activeSources = [];
      this.agentWords = [];
      this.pingInterval = null;

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
    }

    connectedCallback() {
      console.log('[Aura Widget] <aura-voice-agent> connected to DOM (Hackathon Stage Ready).');

      // Click to toggle drawer
      this.launcherBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCard();
      });

      // Double-click launcher -> Trigger Baseline Demo Query
      this.launcherBtn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        console.log('[STAGE DEMO] Launcher double-clicked — firing baseline demo query!');
        this.triggerBaselineDemo();
      });

      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCard(false);
      });

      this.connectBtn.addEventListener('click', () => this.handleConnectToggle());
      this.bargeBtn.addEventListener('click', () => this.handleBargeIn());

      // ── Stage Demo Shortcuts: Ctrl+Shift+S (Baseline) & Ctrl+Shift+D (Crisis)
      this.handleKeydown = (e) => {
        const isModifier = e.ctrlKey || e.metaKey;
        if (isModifier && e.shiftKey) {
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
        case 'PROCESSING_STT':
          this.statusLabel.textContent = 'Processing...';
          this.statusPill.classList.add('active');
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
      if (isInterim) {
        let interimElem = this.transcriptBox.querySelector('.msg-interim');
        if (!interimElem) {
          interimElem = document.createElement('div');
          interimElem.className = 'msg-row msg-interim';
          interimElem.innerHTML = `<span class="msg-speaker user">YOU</span><span class="msg-text interim"></span>`;
          this.transcriptBox.appendChild(interimElem);
        }
        interimElem.querySelector('.msg-text').innerHTML = `${text} <span class="typing-indicator"></span>`;
      } else {
        const interimElem = this.transcriptBox.querySelector('.msg-interim');
        if (interimElem && speaker === 'USER') {
          interimElem.remove();
        }

        const msgRow = document.createElement('div');
        msgRow.className = 'msg-row';
        const speakerClass = speaker.toLowerCase() === 'user' ? 'user' : 'agent';
        const textClass = isTruncated ? 'msg-text truncated' : 'msg-text';
        msgRow.innerHTML = `<span class="msg-speaker ${speakerClass}">${speaker}</span><span class="${textClass}">${text}</span>`;
        this.transcriptBox.appendChild(msgRow);
      }
      this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
    }

    updateAgentStream(text, isFinal, isTruncated = false) {
      let agentRow = this.transcriptBox.querySelector('.msg-agent-active');
      if (!agentRow) {
        agentRow = document.createElement('div');
        agentRow.className = 'msg-row msg-agent-active';
        agentRow.innerHTML = `<span class="msg-speaker agent">AURA</span><span class="msg-text"></span>`;
        this.transcriptBox.appendChild(agentRow);
      }
      const textElem = agentRow.querySelector('.msg-text');
      textElem.textContent = text;
      if (isTruncated) {
        textElem.className = 'msg-text truncated';
      }
      if (isFinal) {
        agentRow.classList.remove('msg-agent-active');
      }
      this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
    }

    // ── Audio In: Web Audio API Capture (16kHz PCM) ─────────────────────────

    async startMicrophone() {
      try {
        console.log('[Widget Mic] Requesting mic access...');
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: SAMPLE_RATE_16K,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx({ sampleRate: SAMPLE_RATE_16K });
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);

        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
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

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        console.log('[Widget Mic] PCM Audio streamer active.');
      } catch (err) {
        console.error('[Widget Mic] Error initializing microphone:', err);
      }
    }

    stopMicrophone() {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
      }
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

        const int16 = new Int16Array(pcmData);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!this.playbackContext || this.playbackContext.state === 'closed') {
          this.playbackContext = new AudioCtx();
          this.nextPlaybackTime = 0;
        }

        if (this.playbackContext.state === 'suspended') {
          this.playbackContext.resume();
        }

        const audioBuf = this.playbackContext.createBuffer(1, float32.length, chunkSampleRate);
        audioBuf.getChannelData(0).set(float32);

        const source = this.playbackContext.createBufferSource();
        source.buffer = audioBuf;
        source.connect(this.playbackContext.destination);

        const now = this.playbackContext.currentTime;
        const startTime = Math.max(now, this.nextPlaybackTime);
        source.start(startTime);
        this.nextPlaybackTime = startTime + audioBuf.duration;

        this.activeSources.push(source);
        source.onended = () => {
          this.activeSources = this.activeSources.filter((s) => s !== source);
        };
      } catch (err) {
        console.warn('[Widget Audio Playback] Error playing chunk:', err);
      }
    }

    flushAudioPlayback() {
      this.activeSources.forEach((src) => {
        try {
          src.stop();
          src.disconnect();
        } catch (e) {}
      });
      this.activeSources = [];
      if (this.playbackContext) {
        this.nextPlaybackTime = this.playbackContext.currentTime;
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
          this.playPcmChunk(event.data);
          return;
        }

        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
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

            case 'state_change':
              this.updateStateUI(msg.state);
              if (msg.state === 'LISTENING') {
                this.startMicrophone();
              } else if (msg.state === 'PROCESSING_STT') {
                this.stopMicrophone();
              } else if (msg.state === 'STREAMING_LLM_TTS') {
                this.agentWords = [];
              }
              break;

            case 'transcript_interim':
              if (msg.payload?.text) {
                this.appendTranscript('USER', msg.payload.text, true);
              }
              break;

            case 'transcript_stream': {
              const isTruncated = msg.payload?.is_truncated || false;
              if (msg.payload?.speaker === 'user') {
                this.appendTranscript('USER', msg.payload.text, false);
              } else if (msg.payload?.speaker === 'agent') {
                this.agentWords.push(msg.payload.text);
                this.updateAgentStream(this.agentWords.join(' '), msg.payload.is_final, isTruncated);
              }
              break;
            }

            case 'flush_audio_buffer':
              this.flushAudioPlayback();
              break;
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
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.isWsConnected = false;
      this.isDegraded = false;
      this.updateStateUI('DISCONNECTED');
    }

    handleBargeIn() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'client_barge_in' }));
      }
      this.flushAudioPlayback();
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
