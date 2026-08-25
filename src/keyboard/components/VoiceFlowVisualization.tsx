import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LayoutChangeEvent, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';
import StopIcon from '../../../assets/stop.svg';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {keyboardTypefaceStyle} from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type VoiceGradientStops = {
  bottom: string;
  lower: string;
  mid: string;
  upper: string;
  highlight: string;
};

type VoiceFillVariant = 'cycling' | 'appleRainbow';

type VoiceFlowVisualizationProps = {
  visible: boolean;
  connecting: boolean;
  listening: boolean;
  speaking: boolean;
  audioLevel: number;
  transcript: string;
  onStop: () => void;
  onExitComplete?: () => void;
};

const EASE_OUT_SMOOTH = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_SMOOTH = Easing.bezier(0.4, 0, 1, 1);
const EASE_IN_OUT_SMOOTH = Easing.bezier(0.45, 0.05, 0.55, 0.95);

const ENTER_SHELL_MS = 540;
const ENTER_CONTENT_DELAY_MS = 150;
const ENTER_CONTENT_MS = 400;
const ENTER_FILL_DELAY_MS = 130;
const ENTER_FILL_MS = 680;

const EXIT_CONTENT_MS = 240;
const EXIT_FILL_MS = 400;
const EXIT_SHELL_DELAY_MS = 180;
const EXIT_SHELL_MS = 460;

const FILL_LEVEL_SPRING = {damping: 32, stiffness: 38, mass: 1.15};

const MIN_LISTEN_LEVEL = 0.58;
const MIN_CONNECT_LEVEL = 0.46;
const SPEAK_BASE_LEVEL = 0.72;

const VOICE_CYCLE_GREEN = '#2CC642';
const VOICE_CYCLE_YELLOW = '#FFD54F';
const VOICE_CYCLE_BLUE = '#42A5F5';
const VOICE_CYCLE_RED = '#EF5350';
const VOICE_COLOR_CYCLE_MS = 24000;
const APPLE_RAINBOW_DRIFT_MS = 18000;

/** Classic Apple logo rainbow — all stripes visible together. */
const APPLE_RAINBOW_CYCLE = [
  '#6EBE44',
  '#F4D316',
  '#F59E31',
  '#E03A3E',
  '#B04AAD',
  '#3C8FD6',
] as const;

const VOICE_PALETTE_DEFAULT = [
  VOICE_CYCLE_GREEN,
  VOICE_CYCLE_YELLOW,
  VOICE_CYCLE_BLUE,
  VOICE_CYCLE_RED,
] as const;

function voicePaletteForTheme(theme: KeyboardTheme): readonly string[] {
  if (theme.design === 'apple') {
    return [theme.enterPressed, theme.enter, '#5AC8FA', '#90CAF9'];
  }
  return VOICE_PALETTE_DEFAULT;
}

const WAVE_VIEW_WIDTH = 1000;
const WAVE_VIEW_HEIGHT = 100;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (channel: number) => {
    const hex = clampByte(channel).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpHex(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    start.r + (end.r - start.r) * t,
    start.g + (end.g - start.g) * t,
    start.b + (end.b - start.b) * t,
  );
}

function shadeHex(hex: string, factor: number): string {
  const {r, g, b} = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function cycleBaseColor(
  progress: number,
  palette: readonly string[],
): string {
  if (palette.length === 0) {
    return VOICE_CYCLE_GREEN;
  }
  if (palette.length === 1) {
    return palette[0];
  }

  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * palette.length;
  const segment = Math.floor(scaled) % palette.length;
  const local = scaled - Math.floor(scaled);
  const from = palette[segment];
  const to = palette[(segment + 1) % palette.length];
  return lerpHex(from, to, local);
}

function buildVoiceGradientStops(
  progress: number,
  palette: readonly string[] = VOICE_PALETTE_DEFAULT,
): VoiceGradientStops {
  const base = cycleBaseColor(progress, palette);
  return {
    bottom: shadeHex(base, 0.72),
    lower: shadeHex(base, 0.88),
    mid: base,
    upper: shadeHex(base, 1.14),
    highlight: shadeHex(base, 1.28),
  };
}

function buildWaveClipPath(
  phase: number,
  amplitude: number,
  waveCycles = 2.35,
): string {
  'worklet';
  const steps = 36;
  let path = '';

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = t * WAVE_VIEW_WIDTH;
    const y =
      amplitude * 0.55 +
      amplitude * Math.sin(t * Math.PI * 2 * waveCycles + phase);
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  path += ` L ${WAVE_VIEW_WIDTH} ${WAVE_VIEW_HEIGHT} L 0 ${WAVE_VIEW_HEIGHT} Z`;
  return path;
}

type VoiceFlowFillArtProps = {
  wavePhase: Animated.SharedValue<number>;
  waveEnergy: Animated.SharedValue<number>;
  variant: VoiceFillVariant;
  gradientStops: VoiceGradientStops;
  rainbowShift?: number;
};

function VoiceFlowFillArt({
  wavePhase,
  waveEnergy,
  variant,
  gradientStops,
  rainbowShift = 0,
}: VoiceFlowFillArtProps) {
  const animatedClipProps = useAnimatedProps(() => {
    const energy = waveEnergy.value;
    const amplitude = 5 + energy * 6;
    return {
      d: buildWaveClipPath(wavePhase.value, amplitude),
    };
  });

  const drift = ((rainbowShift % 1) + 1) % 1;
  const rainbowColors = useMemo(
    () => [...APPLE_RAINBOW_CYCLE, APPLE_RAINBOW_CYCLE[0]],
    [],
  );

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${WAVE_VIEW_WIDTH} ${WAVE_VIEW_HEIGHT}`}
      preserveAspectRatio="none">
      <Defs>
        {variant === 'appleRainbow' ? (
          <>
            <LinearGradient
              id="voiceFlowFill"
              x1={-0.15 + drift}
              y1="0"
              x2={0.85 + drift}
              y2="0">
              {rainbowColors.map((color, index) => (
                <Stop
                  key={`${color}-${index}`}
                  offset={index / (rainbowColors.length - 1)}
                  stopColor={color}
                  stopOpacity="0.98"
                />
              ))}
            </LinearGradient>
            <LinearGradient id="voiceFlowTopFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EEEAE0" stopOpacity="0.98" />
              <Stop offset="0.22" stopColor="#EEEAE0" stopOpacity="0.9" />
              <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.78" />
              <Stop offset="0.58" stopColor="#FFFFFF" stopOpacity="0.52" />
              <Stop offset="0.74" stopColor="#FFFFFF" stopOpacity="0.24" />
              <Stop offset="0.88" stopColor="#FFFFFF" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </>
        ) : (
          <LinearGradient id="voiceFlowFill" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={gradientStops.bottom} stopOpacity="1" />
            <Stop offset="0.14" stopColor={gradientStops.lower} stopOpacity="0.96" />
            <Stop offset="0.32" stopColor={gradientStops.mid} stopOpacity="0.72" />
            <Stop offset="0.52" stopColor={gradientStops.upper} stopOpacity="0.36" />
            <Stop offset="0.72" stopColor={gradientStops.highlight} stopOpacity="0.12" />
            <Stop offset="0.9" stopColor="#FFFDE7" stopOpacity="0.04" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        )}

        <Pattern
          id="voiceFlowGrain"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse">
          <Rect width="5" height="5" fill="transparent" />
          <Circle cx="1" cy="1.4" r="0.5" fill="#FFFFFF" opacity="0.2" />
          <Circle cx="3.8" cy="2.6" r="0.35" fill="#FFFFFF" opacity="0.14" />
          <Circle cx="2.2" cy="4.1" r="0.4" fill="#FFFFFF" opacity="0.16" />
        </Pattern>

        <ClipPath id="voiceFlowWaveClip">
          <AnimatedPath animatedProps={animatedClipProps} fill="#FFFFFF" />
        </ClipPath>
      </Defs>

      <G clipPath="url(#voiceFlowWaveClip)">
        <Rect
          x="0"
          y="0"
          width={WAVE_VIEW_WIDTH}
          height={WAVE_VIEW_HEIGHT}
          fill="url(#voiceFlowFill)"
        />
        {variant === 'appleRainbow' ? (
          <Rect
            x="0"
            y="0"
            width={WAVE_VIEW_WIDTH}
            height={WAVE_VIEW_HEIGHT}
            fill="url(#voiceFlowTopFade)"
          />
        ) : null}
        <Rect
          x="0"
          y="0"
          width={WAVE_VIEW_WIDTH}
          height={WAVE_VIEW_HEIGHT * (variant === 'appleRainbow' ? 0.28 : 0.42)}
          fill="url(#voiceFlowGrain)"
          opacity={variant === 'appleRainbow' ? '0.12' : '0.22'}
        />
      </G>
    </Svg>
  );
}

function resolveFillTarget(
  connecting: boolean,
  listening: boolean,
  speaking: boolean,
): number {
  if (connecting) {
    return MIN_CONNECT_LEVEL;
  }
  if (listening) {
    return speaking ? SPEAK_BASE_LEVEL : MIN_LISTEN_LEVEL;
  }
  return MIN_CONNECT_LEVEL;
}

export function VoiceFlowVisualization({
  visible,
  connecting,
  listening,
  speaking,
  audioLevel,
  transcript,
  onStop,
  onExitComplete,
}: VoiceFlowVisualizationProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createVoiceFlowStyles);
  const isAppleRainbow = theme.design === 'macintosh';
  const fillVariant: VoiceFillVariant = isAppleRainbow ? 'appleRainbow' : 'cycling';
  const voicePalette = useMemo(() => voicePaletteForTheme(theme), [
    theme.design,
    theme.enter,
    theme.enterPressed,
  ]);

  const pillHeightSv = useSharedValue(48);
  const sessionProgress = useSharedValue(0);
  const contentProgress = useSharedValue(0);
  const fillLevel = useSharedValue(0);
  const smoothedBoost = useSharedValue(0);
  const wavePhase = useSharedValue(0);
  const waveEnergy = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const colorCycle = useSharedValue(0);
  const rainbowShift = useSharedValue(0);
  const [gradientStops, setGradientStops] = useState(() =>
    buildVoiceGradientStops(0, voicePalette),
  );
  const [rainbowShiftJs, setRainbowShiftJs] = useState(0);

  const syncGradientStops = useCallback(
    (progress: number) => {
      setGradientStops(buildVoiceGradientStops(progress, voicePalette));
    },
    [voicePalette],
  );

  const syncRainbowShift = useCallback((shift: number) => {
    setRainbowShiftJs(shift);
  }, []);

  useAnimatedReaction(
    () => colorCycle.value,
    progress => {
      if (!isAppleRainbow) {
        runOnJS(syncGradientStops)(progress);
      }
    },
    [isAppleRainbow, syncGradientStops],
  );

  useAnimatedReaction(
    () => rainbowShift.value,
    shift => {
      if (isAppleRainbow) {
        runOnJS(syncRainbowShift)(shift);
      }
    },
    [isAppleRainbow, syncRainbowShift],
  );

  const notifyExitComplete = useCallback(() => {
    onExitComplete?.();
  }, [onExitComplete]);
  const wasVisibleRef = useRef(false);

  const statusLabel = useMemo(() => {
    if (connecting) {
      return 'Connecting…';
    }
    if (speaking) {
      return 'Speaking…';
    }
    return 'Listening…';
  }, [connecting, speaking]);

  useEffect(() => {
    if (!visible) {
      wavePhase.value = 0;
      waveEnergy.value = 0;
      colorCycle.value = 0;
      rainbowShift.value = 0;
      setRainbowShiftJs(0);
      setGradientStops(buildVoiceGradientStops(0, voicePalette));
      glowPulse.value = withTiming(0, {duration: 160});
      return;
    }

    if (isAppleRainbow) {
      rainbowShift.value = withRepeat(
        withTiming(1, {duration: APPLE_RAINBOW_DRIFT_MS, easing: Easing.linear}),
        -1,
        false,
      );
    } else {
      colorCycle.value = withRepeat(
        withTiming(1, {duration: VOICE_COLOR_CYCLE_MS, easing: Easing.linear}),
        -1,
        false,
      );
    }
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, {duration: 3400, easing: Easing.linear}),
      -1,
      false,
    );
    waveEnergy.value = withTiming(0.35, {duration: 220});
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, {duration: 1800, easing: Easing.inOut(Easing.sin)}),
        withTiming(0.45, {duration: 1800, easing: Easing.inOut(Easing.sin)}),
      ),
      -1,
      false,
    );
  }, [
    visible,
    colorCycle,
    glowPulse,
    isAppleRainbow,
    rainbowShift,
    voicePalette,
    waveEnergy,
    wavePhase,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const energy = speaking
      ? 0.55 + Math.min(0.45, Math.max(0, audioLevel) * 0.5)
      : listening
        ? 0.35
        : 0.25;

    waveEnergy.value = withTiming(energy, {
      duration: speaking ? 260 : 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [audioLevel, listening, speaking, visible, waveEnergy]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;

    if (visible && !wasVisible) {
      const target = resolveFillTarget(connecting, listening, speaking);
      sessionProgress.value = withTiming(1, {
        duration: ENTER_SHELL_MS,
        easing: EASE_OUT_SMOOTH,
      });
      contentProgress.value = withDelay(
        ENTER_CONTENT_DELAY_MS,
        withTiming(1, {duration: ENTER_CONTENT_MS, easing: EASE_OUT_SMOOTH}),
      );
      fillLevel.value = withDelay(
        ENTER_FILL_DELAY_MS,
        withTiming(target, {duration: ENTER_FILL_MS, easing: EASE_OUT_SMOOTH}),
      );
    } else if (!visible && wasVisible) {
      contentProgress.value = withTiming(0, {
        duration: EXIT_CONTENT_MS,
        easing: EASE_IN_SMOOTH,
      });
      smoothedBoost.value = withTiming(0, {duration: EXIT_CONTENT_MS});
      fillLevel.value = withTiming(0, {
        duration: EXIT_FILL_MS,
        easing: EASE_IN_OUT_SMOOTH,
      });
      sessionProgress.value = withDelay(
        EXIT_SHELL_DELAY_MS,
        withTiming(0, {duration: EXIT_SHELL_MS, easing: EASE_IN_OUT_SMOOTH}, finished => {
          if (finished) {
            runOnJS(notifyExitComplete)();
          }
        }),
      );
    }

    wasVisibleRef.current = visible;
  }, [
    visible,
    connecting,
    listening,
    speaking,
    contentProgress,
    fillLevel,
    notifyExitComplete,
    sessionProgress,
    smoothedBoost,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const target = resolveFillTarget(connecting, listening, speaking);
    fillLevel.value = withSpring(target, FILL_LEVEL_SPRING);
  }, [connecting, fillLevel, listening, speaking, visible]);

  useEffect(() => {
    if (!visible || !speaking) {
      smoothedBoost.value = withTiming(0, {duration: 300, easing: Easing.out(Easing.cubic)});
      return;
    }

    const boost = Math.min(0.22, Math.max(0, audioLevel) * 0.28);
    smoothedBoost.value = withTiming(boost, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [audioLevel, speaking, smoothedBoost, visible]);

  const shellStyle = useAnimatedStyle(() => {
    const progress = sessionProgress.value;
    return {
      opacity: interpolate(
        progress,
        [0, 0.28, 1],
        [0, 1, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(progress, [0, 1], [26, 0], Extrapolation.CLAMP),
        },
        {
          scaleX: interpolate(progress, [0, 1], [0.16, 1], Extrapolation.CLAMP),
        },
        {
          scaleY: interpolate(progress, [0, 1], [0.78, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sessionProgress.value,
      [0, 0.35, 1],
      [0, 0.28, 0.18],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(glowPulse.value, [0.45, 1], [0.99, 1.012], Extrapolation.CLAMP),
      },
    ],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sessionProgress.value, [0, 0.2, 1], [0, 1, 1], Extrapolation.CLAMP),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [
      {
        translateY: interpolate(
          contentProgress.value,
          [0, 1],
          [5, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const stopButtonStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [
      {
        scale: interpolate(
          contentProgress.value,
          [0, 1],
          [0.94, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const fillClipStyle = useAnimatedStyle(() => {
    const level = Math.min(1, fillLevel.value + smoothedBoost.value);
    return {
      height: level * pillHeightSv.value,
    };
  });

  const onPillLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0) {
      pillHeightSv.value = nextHeight;
    }
  };

  return (
    <Animated.View style={[styles.shell, shellStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.enterGlow,
          glowStyle,
          isAppleRainbow
            ? {backgroundColor: '#F59E31'}
            : {backgroundColor: gradientStops.mid},
        ]}
      />
      <Animated.View style={[styles.pill, pillStyle]} onLayout={onPillLayout}>
        <Animated.View style={[styles.fillClip, fillClipStyle]} pointerEvents="none">
          <View style={styles.fillArtHost}>
            <VoiceFlowFillArt
              wavePhase={wavePhase}
              waveEnergy={waveEnergy}
              variant={fillVariant}
              gradientStops={gradientStops}
              rainbowShift={rainbowShiftJs}
            />
          </View>
        </Animated.View>

        <Animated.View style={[styles.textContainer, contentStyle]}>
          {transcript.trim().length > 0 ? (
            <Text style={styles.transcript} numberOfLines={1} ellipsizeMode="head">
              {transcript.trim()}
            </Text>
          ) : (
            <Text style={styles.status} numberOfLines={1}>
              {statusLabel}
            </Text>
          )}
        </Animated.View>

        <Animated.View style={stopButtonStyle}>
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              onStop();
            }}
            style={({pressed}) => [
              styles.stopButton,
              pressed && styles.stopButtonPressed,
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Stop voice input">
            <StopIcon width={16} height={16} color={theme.label} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function createVoiceFlowStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    enterGlow: {
      position: 'absolute',
      left: 10,
      right: 10,
      top: 4,
      bottom: 4,
      borderRadius: 999,
    },
    pill: {
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.letterKey,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 8,
      gap: 10,
      position: 'relative',
    },
    fillClip: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    fillArtHost: {
      ...StyleSheet.absoluteFillObject,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      zIndex: 2,
    },
    transcript: {
      color: theme.label,
      fontSize: 15,
      ...keyboardTypefaceStyle(theme, '500'),
    },
    status: {
      color: theme.spaceLabel,
      fontSize: 14,
      ...keyboardTypefaceStyle(theme, '500'),
    },
    stopButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.modifierKey,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    stopButtonPressed: {
      opacity: 0.75,
      backgroundColor: theme.modifierKeyPressed,
    },
  });
}
