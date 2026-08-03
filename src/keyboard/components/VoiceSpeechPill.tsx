import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {keyboardTypefaceStyle} from '../theme';
import {VoiceConnectingDots} from './VoiceConnectingDots';
import {VoiceEqualizerIcon} from './VoiceEqualizerIcon';

type VoiceSpeechPillProps = {
  visible: boolean;
  connecting: boolean;
  listening: boolean;
  speaking: boolean;
  processing: boolean;
  transcript: string;
};

const SPRING_OPEN = {
  damping: 16,
  stiffness: 260,
  mass: 0.72,
};

const SPRING_CLOSE = {
  damping: 20,
  stiffness: 320,
  mass: 0.65,
};

export function VoiceSpeechPill({
  visible,
  connecting,
  listening,
  speaking,
  processing,
  transcript,
}: VoiceSpeechPillProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createVoiceSpeechPillStyles);
  const [mounted, setMounted] = useState(visible);
  const openProgress = useSharedValue(visible ? 1 : 0);
  const contentProgress = useSharedValue(visible ? 1 : 0);
  const glowPulse = useSharedValue(0);
  const textBump = useSharedValue(1);
  const previousTranscriptRef = useRef(transcript);

  const hasTranscript = transcript.trim().length > 0;
  const statusLabel = processing
    ? 'Polishing…'
    : connecting
      ? 'Connecting…'
      : hasTranscript
        ? null
        : 'Speak now…';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      openProgress.value = withSpring(1, SPRING_OPEN);
      contentProgress.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1, {duration: 900, easing: Easing.inOut(Easing.ease)}),
          withTiming(0.35, {duration: 900, easing: Easing.inOut(Easing.ease)}),
        ),
        -1,
        false,
      );
      return;
    }

    contentProgress.value = withTiming(0, {duration: 120});
    openProgress.value = withSpring(0, SPRING_CLOSE);
    glowPulse.value = withTiming(0, {duration: 160});
    const timer = setTimeout(() => {
      setMounted(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [visible, contentProgress, glowPulse, openProgress]);

  useEffect(() => {
    if (transcript === previousTranscriptRef.current) {
      return;
    }
    previousTranscriptRef.current = transcript;
    if (!transcript.trim()) {
      return;
    }
    textBump.value = 0.97;
    textBump.value = withSpring(1, {damping: 14, stiffness: 420, mass: 0.55});
  }, [textBump, transcript]);

  const shellStyle = useAnimatedStyle(() => {
    const progress = openProgress.value;
    const scaleX = interpolate(progress, [0, 1], [0.08, 1], Extrapolation.CLAMP);
    const scaleY = interpolate(
      progress,
      [0, 0.55, 1],
      [0.55, 1.05, 1],
      Extrapolation.CLAMP,
    );

    return {
      opacity: interpolate(progress, [0, 0.12, 1], [0, 1, 1], Extrapolation.CLAMP),
      transform: [
        {translateX: interpolate(progress, [0, 1], [28, 0], Extrapolation.CLAMP)},
        {scaleX},
        {scaleY},
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowPulse.value,
      [0, 1],
      [0.18, 0.42],
      Extrapolation.CLAMP,
    ),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [
      {
        translateY: interpolate(
          contentProgress.value,
          [0, 1],
          [6, 0],
          Extrapolation.CLAMP,
        ),
      },
      {scale: textBump.value},
    ],
  }));

  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.shell, shellStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, glowStyle, {backgroundColor: theme.essentialsAccent}]}
        />
        <Animated.View style={[styles.inner, contentStyle]}>
          {processing || connecting ? (
            <VoiceConnectingDots size={18} color={theme.label} />
          ) : listening ? (
            <VoiceEqualizerIcon
              active={speaking}
              size={18}
              color={theme.label}
            />
          ) : null}
          {hasTranscript ? (
            <Text style={styles.transcript} numberOfLines={1} ellipsizeMode="head">
              {transcript.trim()}
            </Text>
          ) : statusLabel ? (
            <Text style={styles.status} numberOfLines={1}>
              {statusLabel}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function createVoiceSpeechPillStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    slot: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      paddingHorizontal: 4,
      alignItems: 'flex-end',
    },
    shell: {
      width: '100%',
      minHeight: 36,
      borderRadius: 999,
      backgroundColor: theme.letterKey,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    glow: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: 999,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      minHeight: 36,
    },
    transcript: {
      flex: 1,
      minWidth: 0,
      color: theme.label,
      fontSize: 15,
      ...keyboardTypefaceStyle(theme, '500'),
    },
    status: {
      flex: 1,
      minWidth: 0,
      color: theme.spaceLabel,
      fontSize: 14,
      ...keyboardTypefaceStyle(theme, '500'),
    },
  });
}
