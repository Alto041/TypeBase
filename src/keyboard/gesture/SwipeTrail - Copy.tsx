import React, {useEffect, useRef, useState} from 'react';
import {Animated, PixelRatio, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {rebuildSmoothPath} from './swipeTrailPath';
import type {TrailPoint} from './types';

type SwipeTrailProps = {
  points: TrailPoint[];
  width: number;
  height: number;
  fading: boolean;
  onFadeComplete: () => void;
};

const TRAIL_WINDOW_MS = 280;
const FADE_OUT_MS = 170;
const TRAIL_CORE_DP = 5;
const TRAIL_GLOW_DP = 9;
function dp(value: number): number {
  return value * PixelRatio.get();
}

function trimExpiredPoints(points: TrailPoint[], nowMs: number): TrailPoint[] {
  if (points.length <= 2) {
    return points;
  }

  let startIndex = 0;
  while (startIndex + 2 < points.length) {
    const second = points[startIndex + 1];
    if (nowMs - second.timestampMs <= TRAIL_WINDOW_MS) {
      break;
    }
    startIndex += 1;
  }

  return points.slice(startIndex);
}

export function SwipeTrail({
  points,
  width,
  height,
  fading,
  onFadeComplete,
}: SwipeTrailProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [activePoints, setActivePoints] = useState<TrailPoint[]>(points);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setActivePoints(points);
  }, [points]);

  useEffect(() => {
    if (fading) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

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
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const trimmed = trimExpiredPoints(points, Date.now());
      setActivePoints(trimmed);
      if (trimmed.length >= 2 && !fading) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fading, points]);

  if (points.length < 2 || width <= 0 || height <= 0) {
    return null;
  }

  const renderPoints = fading ? points : activePoints;
  if (renderPoints.length < 2) {
    return null;
  }

  const now = Date.now();
  const newestAge = Math.max(0, now - renderPoints[renderPoints.length - 1].timestampMs);
  const life = Math.min(1, Math.max(0, 1 - newestAge / TRAIL_WINDOW_MS));
  const path = rebuildSmoothPath(renderPoints);

  if (!path) {
    return null;
  }

  const coreAlpha = Math.round(Math.min(205, Math.max(28, life * 205)));
  const glowAlpha = Math.round(Math.min(90, Math.max(18, life * 90)));

  return (
    <Animated.View
      style={[styles.overlay, {width, height, opacity}]}
      pointerEvents="none">
      <Svg width={width} height={height}>
        <Path
          d={path}
          stroke={`rgba(247, 190, 0, ${glowAlpha / 255})`}
          strokeWidth={dp(TRAIL_GLOW_DP)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={path}
          stroke={`rgba(247, 190, 0, ${coreAlpha / 255})`}
          strokeWidth={dp(TRAIL_CORE_DP)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
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
