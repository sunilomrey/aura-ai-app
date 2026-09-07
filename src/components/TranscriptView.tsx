import React, { useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Animated, Platform } from 'react-native';
import { COLORS, ROUNDED, SPACING, TYPOGRAPHY } from '../theme';
import { Message } from '../types';

interface TranscriptViewProps {
  messages: Message[];
  state: string;
}

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isWeb = Platform.OS === 'web';
    const animateDot = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: -6,
            duration: 300,
            useNativeDriver: !isWeb,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            useNativeDriver: !isWeb,
          }),
          Animated.delay(400),
        ])
      );
    };

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 150);
    const a3 = animateDot(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
};

export const TranscriptView: React.FC<TranscriptViewProps> = ({ messages, state }) => {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  return (
    <View style={styles.container}>
      <View style={styles.topGradient} pointerEvents="none" />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, index) => {
          const isAura = msg.sender === 'AURA';
          const isLastMessage = index === messages.length - 1;

          return (
            <View
              key={index}
              style={[
                styles.messageRow,
                isAura ? styles.messageRowLeft : styles.messageRowRight,
                state === 'USER_SPEAKING' && !isLastMessage && styles.fadeOut,
              ]}
            >
              <Text
                style={[
                  styles.senderLabel,
                  isAura ? styles.senderLabelLeft : styles.senderLabelRight,
                ]}
              >
                {isAura ? 'Aura' : 'You'}
              </Text>

              <View
                style={[
                  styles.bubble,
                  isAura ? styles.bubbleAura : styles.bubbleUser,
                  isLastMessage && isAura && state === 'AGENT_RESPONDING' && styles.bubbleResponding,
                ]}
              >
                {msg.isTyping ? (
                  <View style={styles.typingRow}>
                    <Text style={styles.bubbleText}>{msg.text}</Text>
                    <TypingIndicator />
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.bubbleText,
                      isLastMessage && isAura && state === 'AGENT_RESPONDING' && styles.respondingText,
                    ]}
                  >
                    {msg.text}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 180,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingVertical: SPACING.unit * 2,
    gap: SPACING.unit * 3,
  },
  messageRow: {
    width: '100%',
    marginVertical: SPACING.unit * 1.5,
  },
  messageRowLeft: {
    alignItems: 'flex-start',
  },
  messageRowRight: {
    alignItems: 'flex-end',
  },
  fadeOut: {
    opacity: 0.35,
  },
  senderLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.unit,
    paddingHorizontal: SPACING.unit * 2,
  },
  senderLabelLeft: {
    color: COLORS.primary,
  },
  senderLabelRight: {
    color: COLORS.onSurfaceVariant,
  },
  bubble: {
    maxWidth: '85%',
    paddingVertical: SPACING.unit * 3.5,
    paddingHorizontal: SPACING.unit * 4.5,
    borderRadius: ROUNDED.xl,
    borderWidth: 1,
  },
  bubbleAura: {
    backgroundColor: COLORS.glassBackground,
    borderColor: 'rgba(142, 213, 255, 0.15)',
    borderTopLeftRadius: ROUNDED.sm,
  },
  bubbleUser: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderTopRightRadius: ROUNDED.sm,
  },
  bubbleResponding: {
    borderColor: 'rgba(142, 213, 255, 0.4)',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  bubbleText: {
    color: COLORS.onSurface,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  respondingText: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.unit * 2,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    gap: 4,
    paddingLeft: 4,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.secondary,
  },
});
