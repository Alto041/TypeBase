import React, {useEffect, useRef} from 'react';
import {Animated, PixelRatio, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {
  swipeTrailHeadRef,
  swipeTrailPointsRef,
  swipeTrailRevisionRef,
} from './gestureState';
import {rebuildSmoothPath} from './swipeTrailPath';
import type {Point} from './types';

type SwipeTrailProps = {
  width: number;
  height: number;
  fading: boolean;
  onFadeComplete: () => void;
};

const FADE_OUT_MS = 120;
const STROKE_DP = 4;
/** Cap path complexity — more points = frame drops on Android SVG. */
const MAX_RENDER_POINTS = 48;

function dp(value: number): number {
  return value * PixelRatio.get();
}

function decimatePoints(points: Point[], maxPoints: number): Point[] {
  const n = points.length;
  if (n <= maxPoints) {
    return points;
  }
  const out: Point[] = new Array(maxPoints);
  const last = maxPoints - 1;
  for (let i = 0; i < last; i++) {
    out[i] = points[Math.round((i * (n - 1)) / last)];
  }
  out[last] = points[n - 1];
  return out;
}

function buildTrailPath(): string {
  const trail = swipeTrailPointsRef.current;
  if (trail.length < 2) {
    return '';
  }

  const head = swipeTrailHeadRef.current;
  const renderPoints: Point[] = [];
  for (let i = 0; i < trail.length; i++) {
    renderPoints.push(trail[i]);
  }
  if (head) {
    const last = trail[trail.length - 1];
    const dx = head.x - last.x;
    const dy = head.y - last.y;
    if (dx * dx + dy * dy >= 1) {
      renderPoints.push({x: head.x, y: head.y});
    }
  }

  return rebuildSmoothPath(decimatePoints(renderPoints, MAX_RENDER_POINTS));
}

/**
 * Swipe doodle trail — updates Path via setNativeProps (no React re-render loop).
 */
export function SwipeTrail({
  width,
  height,
  fading,
  onFadeComplete,
}: SwipeTrailProps) {
  const theme = useKeyboardTheme();
  const fadeOpacity = useRef(new Animated.Value(1)).current;
  const pathRef = useRef<Path>(null);
  const lastPathRef = useRef('');
  const lastRevisionRef = useRef(-1);
  const lastHeadRef = useRef<{x: number; y: number} | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadePathRef = useRef('');

  const paintPath = (d: string) => {
    if (d === lastPathRef.current) {
      return;
    }
    lastPathRef.current = d;
    pathRef.current?.setNativeProps({d});
  };

  useEffect(() => {
    if (fading) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      fadePathRef.current =
        lastPathRef.current || rebuildSmoothPath(swipeTrailPointsRef.current);
      paintPath(fadePathRef.current);

      const animation = Animated.timing(fadeOpacity, {
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

    fadeOpacity.setValue(1);
    fadePathRef.current = '';
  }, [fading, onFadeComplete, fadeOpacity]);

  useEffect(() => {
    if (fading) {
      return;
    }

    const loop = () => {
      const revision = swipeTrailRevisionRef.current;
      const head = swipeTrailHeadRef.current;
      const prevHead = lastHeadRef.current;

      const revisionChanged = revision !== lastRevisionRef.current;
      const headMoved =
        !!head &&
        (!prevHead ||
          (head.x - prevHead.x) * (head.x - prevHead.x) +
            (head.y - prevHead.y) * (head.y - prevHead.y) >=
            2.25);

      if (revisionChanged || headMoved) {
        lastRevisionRef.current = revision;
        if (head) {
          lastHeadRef.current = {x: head.x, y: head.y};
        }
        paintPath(buildTrailPath());
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    // Seed immediately so the first segment appears without waiting a frame.
    lastRevisionRef.current = swipeTrailRevisionRef.current;
    paintPath(buildTrailPath());
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fading]);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.overlay, {width, height, opacity: fadeOpacity}]}
      pointerEvents="none">
      <Svg width={width} height={height}>
        <Path
          ref={pathRef}
          d={lastPathRef.current || 'M 0 0'}
          stroke={theme.swipeTrail}
          strokeWidth={dp(STROKE_DP)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={1}
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
