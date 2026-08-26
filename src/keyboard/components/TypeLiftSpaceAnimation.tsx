import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import {TYPELIFT_BRAND_NAME} from '../autocorrect/typeLiftBranding';
import {keyboardTypefaceStyle} from '../theme';
import type {KeyboardTheme} from '../theme';

type TypeLiftSpaceAnimationProps = {
  color: string;
  labelColor: string;
  theme: KeyboardTheme;
  height: number;
};

export function TypeLiftSpaceAnimation({
  color,
  labelColor,
  theme,
  height,
}: TypeLiftSpaceAnimationProps) {
  const sweep = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1_350,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0,
          duration: 420,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    sweepLoop.start();
    glowLoop.start();
    sparkleLoop.start();
    return () => {
      sweepLoop.stop();
      glowLoop.stop();
      sparkleLoop.stop();
    };
  }, [glow, sparkle, sweep]);

  const bandWidth = Math.max(28, height * 1.8);
  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth * 1.4, bandWidth * 3.2],
  });
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.34],
  });
  const sparkleScale = sparkle.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.7, 1.15, 0.7],
  });
  const sparkleOpacity = sparkle.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1, 0.35],
  });

  return (
    <View pointerEvents="none" style={styles.root}>
      <Animated.View
        style={[
          styles.glow,
          {
            height: height * 0.72,
            borderRadius: height * 0.36,
            backgroundColor: color,
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.sweepBand,
          {
            width: bandWidth,
            height: height * 0.55,
            backgroundColor: color,
            opacity: 0.42,
            transform: [
              {translateX: sweepTranslate},
              {rotate: '-18deg'},
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.sparkle,
          {
            width: height * 0.22,
            height: height * 0.22,
            borderRadius: height * 0.11,
            backgroundColor: color,
            opacity: sparkleOpacity,
            transform: [{scale: sparkleScale}],
            left: '18%',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.sparkle,
          {
            width: height * 0.16,
            height: height * 0.16,
            borderRadius: height * 0.08,
            backgroundColor: color,
            opacity: sparkleOpacity,
            transform: [{scale: sparkleScale}],
            right: '22%',
          },
        ]}
      />
      <Text
        style={[
          styles.label,
          {color: labelColor},
          keyboardTypefaceStyle(theme, '600'),
        ]}
        numberOfLines={1}>
        {TYPELIFT_BRAND_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: '72%',
  },
  sweepBand: {
    position: 'absolute',
    left: '8%',
  },
  sparkle: {
    position: 'absolute',
    top: '28%',
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.4,
    zIndex: 2,
  },
});
