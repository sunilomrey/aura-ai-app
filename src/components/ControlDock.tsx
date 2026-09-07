import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Mic, MicOff, Power, BrainCircuit, Keyboard, Settings, RefreshCw, Layers } from 'lucide-react-native';
import { COLORS, ROUNDED, SPACING } from '../theme';
import { AppState, Persona } from '../types';

interface ControlDockProps {
  state: AppState;
  onStateChange: (newState: AppState) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  activePersona: Persona;
  onPersonaChange: (persona: Persona) => void;
}

const MOCK_PERSONAS: Persona[] = [
  { id: '1', name: 'Classic Aura', icon: 'sparkles' },
  { id: '2', name: 'Strategic Advisor', icon: 'trending-up' },
  { id: '3', name: 'Tech Support', icon: 'wrench' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  state,
  onStateChange,
  isMuted,
  onMuteToggle,
  activePersona,
  onPersonaChange,
}) => {
  const [personaModalVisible, setPersonaModalVisible] = useState(false);
  const [devPanelVisible, setDevPanelVisible] = useState(false);

  const handleDisconnect = () => {
    onStateChange('DISCONNECTED');
  };

  const handleConnect = () => {
    onStateChange('CONNECTING');
    // Transition to IDLE automatically after a connecting delay
    setTimeout(() => {
      onStateChange('IDLE');
    }, 1500);
  };

  // Render buttons depending on current AppState
  if (state === 'DISCONNECTED') {
    return (
      <View style={styles.dockWrapper}>
        <TouchableOpacity
          style={[styles.primaryConnectBtn, styles.shadowGlow]}
          activeOpacity={0.8}
          onPress={handleConnect}
        >
          <Power size={22} color={COLORS.onSurface} style={styles.btnIcon} />
          <Text style={styles.primaryConnectText}>CONNECT AURA AI</Text>
        </TouchableOpacity>

        {/* Small Dev Controls Button */}
        <TouchableOpacity
          style={styles.devFloatBtn}
          onPress={() => setDevPanelVisible(!devPanelVisible)}
        >
          <Layers size={14} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>

        {renderDevPanel()}
      </View>
    );
  }

  return (
    <View style={styles.dockWrapper}>
      {/* Dev Mode Panel Toggle */}
      <TouchableOpacity
        style={styles.devFloatBtn}
        onPress={() => setDevPanelVisible(!devPanelVisible)}
      >
        <Layers size={14} color={COLORS.onSurfaceVariant} />
      </TouchableOpacity>

      {renderDevPanel()}

      {/* Main Control Floating Bar */}
      <View style={[styles.controlsDock, styles.shadowGlow]}>
        {state === 'USER_SPEAKING' ? (
          // USER_SPEAKING dock: Keyboard, Large MicOff, Settings
          <>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Keyboard size={22} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.micBtn, styles.micBtnActive, styles.shadowRedGlow]}
              activeOpacity={0.7}
              onPress={onMuteToggle}
            >
              <MicOff size={24} color={COLORS.onError} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Settings size={22} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>
          </>
        ) : (
          // Standard Active Dock (IDLE, AGENT_RESPONDING, CONNECTING)
          <>
            {/* Persona Selector */}
            <TouchableOpacity
              style={styles.personaBtn}
              activeOpacity={0.7}
              onPress={() => setPersonaModalVisible(true)}
            >
              <BrainCircuit size={18} color={COLORS.onSurfaceVariant} />
              <Text style={styles.personaText} numberOfLines={1}>
                {activePersona.name}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Mute toggle button */}
            <TouchableOpacity
              style={[styles.actionBtn, isMuted && styles.actionBtnActive]}
              activeOpacity={0.7}
              onPress={onMuteToggle}
            >
              {isMuted ? (
                <MicOff size={22} color={COLORS.error} />
              ) : (
                <Mic size={22} color={COLORS.onSurface} />
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Disconnect power button */}
            <TouchableOpacity
              style={[styles.disconnectBtn, styles.shadowRedGlow]}
              activeOpacity={0.7}
              onPress={handleDisconnect}
            >
              <Power size={18} color={COLORS.onError} />
              <Text style={styles.disconnectText}>End</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Persona Selection Modal */}
      <Modal
        visible={personaModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPersonaModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPersonaModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select AI Persona</Text>
            <FlatList
              data={MOCK_PERSONAS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.personaOption,
                    activePersona.id === item.id && styles.personaOptionActive,
                  ]}
                  onPress={() => {
                    onPersonaChange(item);
                    setPersonaModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.personaOptionText,
                      activePersona.id === item.id && styles.personaOptionTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  // Helper render for collapsible dev panel
  function renderDevPanel() {
    if (!devPanelVisible) return null;

    const states: AppState[] = [
      'DISCONNECTED',
      'CONNECTING',
      'IDLE',
      'USER_SPEAKING',
      'AGENT_RESPONDING',
      'ERROR',
    ];

    return (
      <View style={styles.devPanel}>
        <Text style={styles.devTitle}>DEV STATE CONTROLLER</Text>
        <View style={styles.devGrid}>
          {states.map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.devBtn, state === st && styles.devBtnActive]}
              onPress={() => onStateChange(st)}
            >
              <Text style={[styles.devBtnText, state === st && styles.devBtnTextActive]}>
                {st.replace('_', '\n')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  dockWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  primaryConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: 'rgba(142, 213, 255, 0.2)',
    borderWidth: 1.5,
    borderRadius: ROUNDED.full,
    paddingVertical: SPACING.unit * 4,
    paddingHorizontal: SPACING.unit * 8,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  btnIcon: {
    marginRight: SPACING.unit * 3,
  },
  primaryConnectText: {
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  controlsDock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: ROUNDED.full,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    paddingVertical: SPACING.unit * 2,
    paddingHorizontal: SPACING.unit * 4,
    minWidth: 280,
    justifyContent: 'space-between',
  },
  personaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.unit * 3,
    paddingVertical: SPACING.unit * 2,
    flex: 1.2,
  },
  personaText: {
    color: COLORS.onSurface,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: SPACING.unit * 1.5,
    maxWidth: 90,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorContainer,
    borderRadius: ROUNDED.full,
    paddingHorizontal: SPACING.unit * 4,
    paddingVertical: SPACING.unit * 2,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    borderWidth: 1,
  },
  disconnectText: {
    color: COLORS.onSurface,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: SPACING.unit * 1.5,
  },
  micBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerHighest,
  },
  micBtnActive: {
    backgroundColor: COLORS.errorContainer,
    borderColor: COLORS.error,
    borderWidth: 1,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  shadowGlow: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  shadowRedGlow: {
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  devFloatBtn: {
    position: 'absolute',
    right: 20,
    bottom: -15,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  devPanel: {
    position: 'absolute',
    bottom: 75,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    borderRadius: ROUNDED.lg,
    padding: SPACING.unit * 3,
    width: '90%',
    zIndex: 90,
  },
  devTitle: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.unit * 2,
    letterSpacing: 1.5,
  },
  devGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  devBtn: {
    width: '30%',
    backgroundColor: COLORS.surfaceContainer,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: ROUNDED.default,
    paddingVertical: SPACING.unit * 1.5,
    marginBottom: SPACING.unit * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  devBtnText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  devBtnTextActive: {
    color: COLORS.onPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: ROUNDED.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: SPACING.unit * 6,
    width: '80%',
    maxHeight: '50%',
  },
  modalTitle: {
    color: COLORS.onSurface,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: SPACING.unit * 4,
    textAlign: 'center',
  },
  personaOption: {
    paddingVertical: SPACING.unit * 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  personaOptionActive: {
    borderBottomColor: COLORS.primary,
  },
  personaOptionText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
  },
  personaOptionTextActive: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
});
