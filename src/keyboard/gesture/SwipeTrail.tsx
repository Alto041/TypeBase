import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PixelRatio, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {
  gestureSwipeActiveRef,
  swipeTrailHeadRef,
  swipeTrailPointsRef,
  swipeTrailRevisionRef,
} from './gestureState';
import {buildSmoothSwipeTrailPath} from './swipeTrailPath';
import type {TrailPoint} from './types';

type SwipeTrailProps = {
  width: number;
  height: number;
  fading: boolean;
  onFadeComplete: () => void;
};

const FADE_OUT_MS = 180;
const HEAD_DP = 3.6;
const TAIL_DP = 0.4;

function dp(value: number): number {
  return value * PixelRatio.get();
}

function trailPointsForRender(
  fading: boolean,
  fadeSnapshot: TrailPoint[],
): TrailPoint[] {
  const base =
    fading && fadeSnapshot.length >= 2
      ? fadeSnapshot
      : [...swipeTrailPointsRef.current];

  if (!gestureSwipeActiveRef.current || fading) {
    return base;
  }

  const head = swipeTrailHeadRef.current;
  if (!head || base.length === 0) {
    return base;
  }

  const last = base[base.length - 1];
  const dx = head.x - last.x;
  const dy = head.y - last.y;
  if (dx * dx + dy * dy < 0.25) {
    return base;
  }

  return [...base, {x: head.x, y: head.y, timestampMs: Date.now()}];
}

export function SwipeTrail({
  width,
  height,
  fading,
  onFadeComplete,
}: SwipeTrailProps) {
  const theme = useKeyboardTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const fadeSnapshotRef = useRef<TrailPoint[]>([]);
  const [renderRevision, setRenderRevision] = React.useState(0);
  const lastPolledRevisionRef = useRef(-1);
  const lastHeadRef = useRef<{x: number; y: number} | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (fading) {
      fadeSnapshotRef.current = [...swipeTrailPointsRef.current];
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
    fadeSnapshotRef.current = [];
  }, [fading, onFadeComplete, opacity]);

  // Repaint when trail geometry changes — not on every vsync if nothing moved.
  useEffect(() => {
    if (fading) {
      return;
    }

    const loop = () => {
      let needsPaint = false;
      const revision = swipeTrailRevisionRef.current;
      if (revision !== lastPolledRevisionRef.current) {
        lastPolledRevisionRef.current = revision;
        needsPaint = true;
      }

      if (gestureSwipeActiveRef.current) {
        const head = swipeTrailHeadRef.current;
        if (head) {
          const prev = lastHeadRef.current;
          if (!prev || head.x !== prev.x || head.y !== prev.y) {
            lastHeadRef.current = {x: head.x, y: head.y};
            needsPaint = true;
          }
        }
      } else {
        lastHeadRef.current = null;
      }

      if (needsPaint) {
        setRenderRevision(current => current + 1);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fading]);

  const points = useMemo(
    () => trailPointsForRender(fading, fadeSnapshotRef.current),
    [fading, renderRevision],
  );

  const corePath = useMemo(() => {
    if (points.length < 2) {
      return '';
    }
    return buildSmoothSwipeTrailPath(points, dp(TAIL_DP), dp(HEAD_DP));
  }, [points]);

  if (!corePath || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.overlay, {width, height, opacity}]}
      pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={corePath} fill={theme.swipeTrail} />
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
