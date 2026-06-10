import React, {useMemo, useRef} from 'react';
import {PanResponder, PixelRatio, StyleSheet, View} from 'react-native';
import {gestureSwipeActiveRef} from './gestureState';
import {SwipeTypingProvider} from './SwipeTypingContext';

const CURSOR_STEP_PX = 12;

function dp(value: number): number {
  return value * PixelRatio.get();
}

type GestureTypingLayerProps = {
  enabled: boolean;
  alignTop?: boolean;
  isUppercase: boolean;
  onWordCommitted: (word: string) => void;
  trackpadEnabled?: boolean;
  onCursorStep?: (offset: number) => void;
  children: React.ReactNode;
};

export function GestureTypingLayer({
  enabled,
  alignTop = false,
  isUppercase,
  onWordCommitted,
  trackpadEnabled = false,
  onCursorStep,
  children,
}: GestureTypingLayerProps) {
  const cursorAccumRef = useRef(0);
  const trackpadDxRef = useRef(0);

  const trackpadPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          trackpadEnabled &&
          !enabled &&
          Math.hypot(gestureState.dx, gestureState.dy) >= dp(8),
        onPanResponderGrant: () => {
          cursorAccumRef.current = 0;
          trackpadDxRef.current = 0;
          gestureSwipeActiveRef.current = true;
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!trackpadEnabled || !onCursorStep) {
            return;
          }
          const delta = gestureState.dx - trackpadDxRef.current;
          trackpadDxRef.current = gestureState.dx;
          cursorAccumRef.current += delta;
          while (Math.abs(cursorAccumRef.current) >= CURSOR_STEP_PX) {
            const step = cursorAccumRef.current > 0 ? 1 : -1;
            cursorAccumRef.current -= step * CURSOR_STEP_PX;
            onCursorStep(step);
          }
        },
        onPanResponderRelease: () => {
          cursorAccumRef.current = 0;
          trackpadDxRef.current = 0;
          gestureSwipeActiveRef.current = false;
        },
        onPanResponderTerminate: () => {
          cursorAccumRef.current = 0;
          trackpadDxRef.current = 0;
          gestureSwipeActiveRef.current = false;
        },
      }),
    [enabled, onCursorStep, trackpadEnabled],
  );

  return (
    <SwipeTypingProvider
      enabled={enabled}
      isUppercase={isUppercase}
      onWordCommitted={onWordCommitted}>
      <View
        style={[styles.spacer, alignTop && styles.spacerTop]}
        {...(!enabled && trackpadEnabled
          ? trackpadPanResponder.panHandlers
          : undefined)}>
        {children}
      </View>
    </SwipeTypingProvider>
  );
}

const styles = StyleSheet.create({
  spacer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  spacerTop: {
    justifyContent: 'flex-start',
  },
});
