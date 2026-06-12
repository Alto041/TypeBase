import React, {useEffect, useRef, useState} from 'react';
import {Animated, PixelRatio, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {buildFadingTrailSegments} from './swipeTrailPath';
import type {TrailPoint} from './types';

type SwipeTrailProps = {
  points: TrailPoint[];
  width: number;
  height: number;
  fading: boolean;
  onFadeComplete: () => void;
};

const FADE_OUT_MS = 180;
const DRAW_FADE_MS = 420;
const HEAD_DP = 3;
const TAIL_DP = 0.4;

function dp(value: number): number {
  return value * PixelRatio.get();
}

export function SwipeTrail({
  points,
  width,
  height,
  fading,
  onFadeComplete,
}: SwipeTrailProps) {
  const theme = useKeyboardTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (fading) {
      const animation = Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      });
      animation.start(({finished}) => {
        if (finished) {
          onFadeComplete();
        }
      });
      return () => animation.stop();
    }
    opacity.setValue(1);
  }, [fading, onFadeComplete, opacity]);

  useEffect(() => {
    if (fading || points.length < 2) {
      return;
    }

    let frame = 0;
    const tick = () => {
      setNowMs(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fading, points]);

  if (points.length < 2 || width <= 0 || height <= 0) {
    return null;
  }

  const headWidth = dp(HEAD_DP);
  const tailWidth = dp(TAIL_DP);
  const segments = buildFadingTrailSegments(
    points,
    tailWidth,
    headWidth,
    nowMs,
    DRAW_FADE_MS,
  );

  if (segments.length === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.overlay, {width, height, opacity}]}
      pointerEvents="none">
      <Svg width={width} height={height}>
        {segments.map((segment, index) => (
          <Path
            key={index}
            d={segment.d}
            stroke={theme.swipeTrail}
            strokeWidth={segment.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={segment.opacity}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 10,
  },
});
