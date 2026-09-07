import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { AppState } from '../types';
import { COLORS } from '../theme';

interface AuraOrbProps {
  state: AppState;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const AuraOrb: React.FC<AuraOrbProps> = ({ state }) => {
  // Shared values for animations
  const scale = useSharedValue(1.0);
  const rotation = useSharedValue(0);
  const glowScale = useSharedValue(1.1);
  const glowOpacity = useSharedValue(0.4);
  const redRingPulse = useSharedValue(1.0);

  useEffect(() => {
    // Stop any running animations to reset clean
    cancelAnimation(scale);
    cancelAnimation(rotation);
    cancelAnimation(glowScale);
    cancelAnimation(glowOpacity);
    cancelAnimation(redRingPulse);

    switch (state) {
      case 'DISCONNECTED':
        // Muted, static state
        scale.value = withTiming(0.9, { duration: 1000 });
        glowScale.value = withTiming(1.0, { duration: 1000 });
        glowOpacity.value = withTiming(0.15, { duration: 1000 });
        rotation.value = 0;
        break;

      case 'CONNECTING':
        // Fast pulsing up to prepare connection
        scale.value = withRepeat(
          withSequence(
            withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.95, { duration: 400, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.3, { duration: 400, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.1, { duration: 400, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.6, { duration: 400 }),
            withTiming(0.3, { duration: 400 })
          ),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 2000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'IDLE':
        // Steady, gentle breathing pulse
        scale.value = withRepeat(
          withSequence(
            withTiming(1.03, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.97, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.25, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.5, { duration: 1500 }),
            withTiming(0.25, { duration: 1500 })
          ),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 25000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'USER_SPEAKING':
        // Energetic pulse corresponding to sound input
        scale.value = withRepeat(
          withSequence(
            withTiming(1.08, { duration: 250, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.92, { duration: 250, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.35, { duration: 250, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.0, { duration: 250, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.7, { duration: 250 }),
            withTiming(0.3, { duration: 250 })
          ),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 4000, easing: Easing.linear }),
          -1,
          false
        );
        // Red outer ring pulses aggressively
        redRingPulse.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 400, easing: Easing.bezier(0.66, 0, 0, 1) }),
            withTiming(0.95, { duration: 400, easing: Easing.bezier(0.66, 0, 0, 1) })
          ),
          -1,
          true
        );
        break;

      case 'AGENT_RESPONDING':
        // Fluid, larger animated expansion
        scale.value = withRepeat(
          withSequence(
            withTiming(1.1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.9, { duration: 1200, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.65, { duration: 1200 }),
            withTiming(0.35, { duration: 1200 })
          ),
          -1,
          true
        );
        rotation.value = withRepeat(
          withTiming(360, { duration: 8000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'ERROR':
        // Slow distorted, blurred red pulse
        scale.value = withRepeat(
          withSequence(
            withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.98, { duration: 2000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.4, { duration: 2000 }),
            withTiming(0.15, { duration: 2000 })
          ),
          -1,
          true
        );
        rotation.value = 0;
        break;
    }
  }, [state]);

  // Animated styles
  const mainOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const rotatingDashedRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const recordingRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: redRingPulse.value }],
    opacity: state === 'USER_SPEAKING' ? 1.0 : 0.0,
  }));

  // Determine gradient colors based on state
  const getGradientColors = () => {
    if (state === 'DISCONNECTED') {
      return {
        c1: '#374151', // Gray 700
        c2: '#1f2937', // Gray 800
      };
    }
    if (state === 'ERROR') {
      return {
        c1: '#ef4444', // Red
        c2: '#7f1d1d', // Dark Red
      };
    }
    // Connected active states (Idle, Connecting, User Speaking, Agent Responding)
    return {
      c1: COLORS.primary, // Neon Blue
      c2: COLORS.secondary, // Cyan
    };
  };

  const { c1, c2 } = getGradientColors();

  return (
    <View style={styles.container}>
      {/* Glow Behind the Orb */}
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <Svg width="300" height="300" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="glowGrad" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={c1} stopOpacity={0.6} />
              <Stop offset="50%" stopColor={c2} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={COLORS.background} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="45" fill="url(#glowGrad)" />
        </Svg>
      </Animated.View>

      {/* Dashed outer rings wrapping the orb (Idle/Active states) */}
      {(state === 'IDLE' || state === 'CONNECTING' || state === 'USER_SPEAKING' || state === 'AGENT_RESPONDING') && (
        <Animated.View style={[styles.absolute, rotatingDashedRingStyle]}>
          <Svg width="220" height="220" viewBox="0 0 100 100">
            <Circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke={COLORS.primary}
              strokeWidth="0.8"
              strokeOpacity="0.25"
              strokeDasharray="4, 4"
            />
            <Circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={COLORS.secondary}
              strokeWidth="0.8"
              strokeOpacity="0.15"
              strokeDasharray="1, 8"
            />
          </Svg>
        </Animated.View>
      )}

      {/* Red Recording Outer Ring (Interruption / User Speaking State) */}
      <Animated.View style={[styles.absolute, recordingRingStyle]}>
        <Svg width="220" height="220" viewBox="0 0 100 100">
          <Circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={COLORS.error}
            strokeWidth="2"
            strokeOpacity="0.7"
          />
        </Svg>
      </Animated.View>

      {/* Core Orb */}
      <Animated.View style={[styles.orbWrapper, mainOrbStyle]}>
        <Svg width="180" height="180" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={c1} />
              <Stop offset="100%" stopColor={c2} />
            </LinearGradient>
            <RadialGradient id="innerShade" cx="40%" cy="40%" r="60%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
              <Stop offset="50%" stopColor="#ffffff" stopOpacity={0.0} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={0.6} />
            </RadialGradient>
          </Defs>
          {/* Main sphere */}
          <Circle cx="50" cy="50" r="35" fill="url(#orbGrad)" />
          {/* Depth shader layer */}
          <Circle cx="50" cy="50" r="35" fill="url(#innerShade)" />
        </Svg>
      </Animated.View>
    </View>
  );
};



const styles = StyleSheet.create({
  container: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  absolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },
  orbWrapper: {
    width: 180,
    height: 180,
    borderRadius: 90,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
