import React, { useState } from 'react';
import { StyleSheet, Text, View, StatusBar, SafeAreaView, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { WifiOff, Settings, RefreshCw, AudioLines } from 'lucide-react-native';
import { AuraOrb } from './src/components/AuraOrb';
import { TranscriptView } from './src/components/TranscriptView';
import { ControlDock } from './src/components/ControlDock';
import { COLORS, ROUNDED, SPACING } from './src/theme';
import { AppState, Persona } from './src/types';
import { useVoiceSession } from './src/hooks/useVoiceSession';

const QUICK_OPERATIONS = [
  { label: '👋 Greeting', query: 'Hi, how are you doing today?' },
  { label: '🔴 Nodes Down?', query: 'Is there any nodes down?' },
  { label: '📊 Avg CPU', query: 'What is average CPU consumption?' },
  { label: '🚨 >80% Spikes', query: 'Is there any node CPU more than 80%?' },
  { label: '🛡️ SLA Claim', query: 'Did we breach the SLA during the edge node downtime?' },
  { label: '⚡ Reroute', query: 'Reroute traffic from the failing edge server.' },
];

export default function App() {
  const [activePersona, setActivePersona] = useState<Persona>({
    id: '1',
    name: 'Classic Aura',
    icon: 'sparkles',
  });

  const {
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
    sendTextQuery,
  } = useVoiceSession();

  const handleStateChange = (newState: AppState) => {
    if (newState === 'CONNECTING' || newState === 'IDLE' || newState === 'USER_SPEAKING') {
      if (appState === 'DISCONNECTED' || appState === 'ERROR') {
        connect();
        return;
      }
    }
    if (newState === 'DISCONNECTED') {
      disconnect();
      return;
    }
    if (newState === 'USER_SPEAKING' && appState === 'AGENT_RESPONDING') {
      // Barge-in interruption
      bargeIn();
      return;
    }
    setAppState(newState);
  };

  const handlePersonaChange = (persona: Persona) => {
    setActivePersona(persona);
    // Simulate brief persona loading sequence
    setAppState('CONNECTING');
    setTimeout(() => {
      setAppState('IDLE');
    }, 800);
  };

  // Find latest user query and latest agent response for the focus card view
  const lastUserMessage = [...messages].reverse().find((m) => m.sender === 'USER')?.text || interimText || "What's the weather like for a walk?";
  const lastAgentMessage = [...messages].reverse().find((m) => m.sender === 'AURA')?.text || "Analyzing voice stream...";

  // Status Indicator details
  const renderStatus = () => {
    switch (appState) {
      case 'DISCONNECTED':
        return (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.outline }]} />
            <Text style={[styles.statusText, { color: COLORS.onSurfaceVariant }]}>Disconnected</Text>
          </View>
        );
      case 'CONNECTING':
        return (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.primary }]} />
            <Text style={[styles.statusText, { color: COLORS.primary }]}>Connecting...</Text>
          </View>
        );
      case 'IDLE':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeActive]}>
            <View style={[styles.statusDot, styles.statusDotPulse, { backgroundColor: COLORS.secondary }]} />
            <Text style={[styles.statusText, { color: COLORS.secondary }]}>Connected</Text>
          </View>
        );
      case 'USER_SPEAKING':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeSpeaking]}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.error }]} />
            <Text style={[styles.statusText, { color: COLORS.error }]}>Streaming Mic</Text>
          </View>
        );
      case 'AGENT_RESPONDING':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeActive]}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.primary }]} />
            <Text style={[styles.statusText, { color: COLORS.primary }]}>AI Responding...</Text>
          </View>
        );
      case 'ERROR':
        return (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.error }]} />
            <Text style={[styles.statusText, { color: COLORS.error }]}>Error</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Ambient glowing shapes */}
      <View style={styles.ambientBlurLeft} />
      <View style={styles.ambientBlurRight} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header bar */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <AudioLines size={24} color={COLORS.primary} style={styles.brandIcon} />
            <Text style={styles.brandTitle}>AURA AI</Text>
          </View>
          <View style={styles.headerActions}>
            {renderStatus()}
            <TouchableOpacity style={styles.settingsBtn}>
              <Settings size={20} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Core Canvas (Main Area) */}
        <View style={styles.mainCanvas}>
          {appState === 'AGENT_RESPONDING' ? (
            // AGENT_RESPONDING focus layout: Show previous query + main highlighted answer card
            <View style={styles.respondingFocus}>
              <View style={styles.queryBubble}>
                <Text style={styles.queryUserLabel}>YOU</Text>
                <Text style={styles.queryText}>{lastUserMessage}</Text>
              </View>

              <View style={styles.responseCard}>
                <View style={styles.cardHeader}>
                  <AudioLines size={16} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>AURA AI (STREAMING)</Text>
                </View>
                <Text style={styles.responseHeadline}>{lastAgentMessage}</Text>
                <TouchableOpacity
                  style={styles.bargeInBtn}
                  activeOpacity={0.7}
                  onPress={bargeIn}
                >
                  <Text style={styles.bargeInText}>TAP TO INTERRUPT (BARGE-IN)</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Standard Orb Visualizer layout
            <View style={styles.centerVisualizer}>
              <AuraOrb state={appState} />

              <View style={styles.statusLabelContainer}>
                {appState === 'DISCONNECTED' && (
                  <>
                    <Text style={styles.mainPrompt}>Initialize Sequence</Text>
                    <Text style={styles.subPrompt}>
                      Backend server is live on port 8000. Connect to Aura AI to stream full-duplex audio.
                    </Text>
                  </>
                )}
                {appState === 'CONNECTING' && (
                  <>
                    <Text style={styles.mainPrompt}>Establishing Link</Text>
                    <Text style={styles.subPrompt}>Opening WebSocket link to ws://localhost:8000/ws/voice/...</Text>
                  </>
                )}
                {appState === 'IDLE' && (
                  <>
                    <Text style={styles.mainPrompt}>Aura AI is listening...</Text>
                    <Text style={styles.subPrompt}>Speak into your microphone or wait for voice triggers</Text>
                  </>
                )}
                {appState === 'USER_SPEAKING' && (
                  <>
                    <Text style={styles.mainPrompt}>Streaming Mic to Backend</Text>
                    <Text style={styles.subPrompt}>
                      {interimText ? `"${interimText}"` : 'Transcribing real-time interim speech...'}
                    </Text>
                  </>
                )}
                {appState === 'ERROR' && (
                  <>
                    <Text style={[styles.mainPrompt, { color: COLORS.error }]}>Connection Lost</Text>
                    <Text style={styles.subPrompt}>Ensure FastAPI backend is running on http://localhost:8000</Text>
                  </>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Lower Transcript Pane */}
        {appState !== 'DISCONNECTED' && appState !== 'CONNECTING' && appState !== 'ERROR' && (
          <View style={styles.transcriptPane}>
            <TranscriptView messages={messages} state={appState} />
          </View>
        )}

        {/* One-Tap Quick Operations Chips */}
        <View style={styles.chipsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_OPERATIONS.map((chip, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.chipBtn}
                onPress={() => sendTextQuery(chip.query)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Floating Controls Dock at bottom */}
        <View style={styles.bottomDockContainer}>
          <ControlDock
            state={appState}
            onStateChange={handleStateChange}
            isMuted={isMuted}
            onMuteToggle={toggleMute}
            activePersona={activePersona}
            onPersonaChange={handlePersonaChange}
          />
        </View>
      </SafeAreaView>

      {/* Connection Lost Error Modal Overlay */}
      <Modal
        visible={appState === 'ERROR'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAppState('DISCONNECTED')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconContainer, styles.shadowRedGlow]}>
              <WifiOff size={32} color={COLORS.error} />
            </View>
            <Text style={styles.modalTitle}>Connection Error</Text>
            <Text style={styles.modalDescription}>
              Could not reach WebSocket at ws://localhost:8000/ws/voice. Please check that the Python server is running and try again.
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, styles.shadowRedGlow]}
              onPress={connect}
            >
              <RefreshCw size={16} color={COLORS.onError} style={styles.btnIconSpacing} />
              <Text style={styles.retryBtnText}>RETRY WEBSOCKET</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setAppState('DISCONNECTED')}
            >
              <Text style={styles.cancelModalBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  ambientBlurLeft: {
    position: 'absolute',
    top: '25%',
    left: '-10%',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(142, 213, 255, 0.04)',
    transform: [{ scale: 1.2 }],
  },
  ambientBlurRight: {
    position: 'absolute',
    bottom: '25%',
    right: '-10%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(93, 230, 255, 0.03)',
    transform: [{ scale: 1.2 }],
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.gutter,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    marginRight: SPACING.unit * 2,
  },
  brandTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.unit * 3,
  },
  settingsBtn: {
    padding: SPACING.unit * 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: ROUNDED.full,
    paddingVertical: SPACING.unit * 1.5,
    paddingHorizontal: SPACING.unit * 3.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  statusBadgeActive: {
    borderColor: 'rgba(93, 230, 255, 0.15)',
  },
  statusBadgeSpeaking: {
    borderColor: 'rgba(255, 180, 171, 0.15)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: SPACING.unit * 2,
  },
  statusDotPulse: {
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  mainCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.gutter,
  },
  centerVisualizer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  statusLabelContainer: {
    alignItems: 'center',
    marginTop: SPACING.gutter,
    paddingHorizontal: SPACING.gutter,
  },
  mainPrompt: {
    color: COLORS.onSurface,
    fontSize: 20,
    fontWeight: '300',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subPrompt: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.unit * 2,
    maxWidth: 280,
    lineHeight: 18,
  },
  respondingFocus: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: SPACING.gutter,
  },
  queryBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: ROUNDED.xl,
    borderTopRightRadius: ROUNDED.sm,
    padding: SPACING.unit * 4,
    width: '90%',
  },
  queryUserLabel: {
    color: COLORS.onSurfaceVariant,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.unit,
  },
  queryText: {
    color: COLORS.onSurface,
    fontSize: 15,
  },
  responseCard: {
    backgroundColor: COLORS.glassBackground,
    borderColor: 'rgba(142, 213, 255, 0.25)',
    borderWidth: 1.5,
    borderRadius: ROUNDED.xl,
    borderTopLeftRadius: ROUNDED.sm,
    padding: SPACING.unit * 6,
    width: '100%',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.unit * 2,
    marginBottom: SPACING.unit * 3,
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  responseHeadline: {
    color: COLORS.onSurface,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '400',
  },
  bargeInBtn: {
    marginTop: SPACING.unit * 4,
    paddingVertical: SPACING.unit * 2,
    paddingHorizontal: SPACING.unit * 3,
    backgroundColor: 'rgba(255, 180, 171, 0.12)',
    borderColor: 'rgba(255, 180, 171, 0.3)',
    borderWidth: 1,
    borderRadius: ROUNDED.default,
    alignItems: 'center',
  },
  bargeInText: {
    color: COLORS.error,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  transcriptPane: {
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.unit * 2,
  },
  bottomDockContainer: {
    paddingBottom: SPACING.gutter,
    paddingTop: SPACING.unit * 2,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 19, 38, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.gutter,
  },
  modalCard: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: 'rgba(255, 180, 171, 0.2)',
    borderWidth: 1.5,
    borderRadius: ROUNDED.xl,
    padding: SPACING.gutter * 1.5,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 12,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 180, 171, 0.15)',
    borderColor: 'rgba(255, 180, 171, 0.4)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.gutter,
  },
  shadowRedGlow: {
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  modalTitle: {
    color: COLORS.onSurface,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.unit * 2,
    textAlign: 'center',
  },
  modalDescription: {
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.gutter * 1.5,
    paddingHorizontal: SPACING.unit * 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error,
    borderRadius: ROUNDED.full,
    paddingVertical: SPACING.unit * 4,
    paddingHorizontal: SPACING.unit * 8,
    width: '100%',
    borderColor: 'rgba(255, 180, 171, 0.5)',
    borderWidth: 1,
  },
  btnIconSpacing: {
    marginRight: SPACING.unit * 2,
  },
  retryBtnText: {
    color: COLORS.onError,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cancelModalBtn: {
    marginTop: SPACING.unit * 4,
    paddingVertical: SPACING.unit * 2,
  },
  cancelModalBtnText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
  },
  chipsContainer: {
    paddingVertical: SPACING.unit * 2,
    paddingHorizontal: SPACING.gutter,
  },
  chipsScroll: {
    gap: SPACING.unit * 2,
    alignItems: 'center',
  },
  chipBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: ROUNDED.full,
    paddingVertical: SPACING.unit * 2,
    paddingHorizontal: SPACING.unit * 3.5,
  },
  chipText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
});
