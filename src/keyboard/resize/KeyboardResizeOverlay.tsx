import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Animated,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';

const HANDLE_HEIGHT = 28;
const MIN_OFFSET = -140;
const MAX_OFFSET = 220;
const MIN_KEYBOARD_HEIGHT = 245;
const MAX_KEYBOARD_HEIGHT = 510;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dp(value: number): number {
  return value * PixelRatio.get();
}

type KeyboardResizeOverlayProps = {
  baseHeight: number;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  onDone: (finalOffset: number) => void;
  onCancel?: () => void;
};

export function KeyboardResizeOverlay({
  baseHeight,
  currentOffset,
  onOffsetChange,
  onDone,
  onCancel,
}: KeyboardResizeOverlayProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createResizeStyles);

  const offsetRef = useRef(currentOffset);
  const baseOffsetRef = useRef(currentOffset);
  const draggingRef = useRef(false);
  const [displayHeight, setDisplayHeight] = useState(() =>
    clamp(
      Math.round(baseHeight + currentOffset),
      MIN_KEYBOARD_HEIGHT,
      MAX_KEYBOARD_HEIGHT,
    ),
  );
  const labelRafRef = useRef<number | null>(null);
  const pendingDisplayHeightRef = useRef(displayHeight);

  // Drive the handle position directly with an Animated.Value for buttery smooth drag (no re-render per frame).
  const animatedHandleTranslateY = useRef(new Animated.Value(0)).current;

  const scheduleDisplayHeight = useCallback((height: number) => {
    pendingDisplayHeightRef.current = height;
    if (labelRafRef.current !== null) {
      return;
    }
    labelRafRef.current = requestAnimationFrame(() => {
      labelRafRef.current = null;
      const next = pendingDisplayHeightRef.current;
      setDisplayHeight(current => (current === next ? current : next));
    });
  }, []);

  // Initialize the animated top from the persisted/current offset when the overlay mounts or offset changes from outside.
  React.useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    offsetRef.current = currentOffset;
    baseOffsetRef.current = currentOffset;
    const nextHeight = clamp(
      Math.round(baseHeight + currentOffset),
      MIN_KEYBOARD_HEIGHT,
      MAX_KEYBOARD_HEIGHT,
    );
    pendingDisplayHeightRef.current = nextHeight;
    setDisplayHeight(nextHeight);
    animatedHandleTranslateY.setValue(0);
  }, [baseHeight, currentOffset, animatedHandleTranslateY]);

  React.useEffect(() => {
    return () => {
      if (labelRafRef.current !== null) {
        cancelAnimationFrame(labelRafRef.current);
        labelRafRef.current = null;
      }
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dy) >= dp(3),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          draggingRef.current = true;
          baseOffsetRef.current = offsetRef.current;
          animatedHandleTranslateY.setValue(0);
        },
        onPanResponderMove: (_evt, gesture) => {
          // Drag direction: moving finger up (dy negative) should increase height (taller keyboard, top edge rises).
          // So: nextOffset = base - dy
          const next = clamp(
            Math.round(baseOffsetRef.current - gesture.dy),
            MIN_OFFSET,
            MAX_OFFSET,
          );

          // Move the handle exactly with the finger for this gesture.
          animatedHandleTranslateY.setValue(
            Math.max(-140, Math.min(220, gesture.dy)),
          );

          offsetRef.current = next;
          scheduleDisplayHeight(
            clamp(
              Math.round(baseHeight + next),
              MIN_KEYBOARD_HEIGHT,
              MAX_KEYBOARD_HEIGHT,
            ),
          );

          // Keep the hot path tiny. Do NOT resize the native IME or rerender keys
          // while the finger is moving; both cause visible stutter on keyboard windows.
          // The exact size/content is committed on release.
        },
        onPanResponderRelease: () => {
          draggingRef.current = false;
          const h = clamp(
            Math.round(baseHeight + offsetRef.current),
            MIN_KEYBOARD_HEIGHT,
            MAX_KEYBOARD_HEIGHT,
          );
          keyboardBridge.setKeyboardHeight(h);
          setDisplayHeight(h);
          onOffsetChange(offsetRef.current);
          animatedHandleTranslateY.setValue(0);
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          const h = clamp(
            Math.round(baseHeight + offsetRef.current),
            MIN_KEYBOARD_HEIGHT,
            MAX_KEYBOARD_HEIGHT,
          );
          keyboardBridge.setKeyboardHeight(h);
          setDisplayHeight(h);
          onOffsetChange(offsetRef.current);
          animatedHandleTranslateY.setValue(0);
        },
      }),
    [animatedHandleTranslateY, baseHeight, onOffsetChange],
  );

  const handleDone = useCallback(() => {
    triggerKeyHaptic();
    onDone(offsetRef.current);
  }, [onDone]);

  const handleReset = useCallback(() => {
    triggerKeyHaptic();
    const reset = 0;
    offsetRef.current = reset;
    baseOffsetRef.current = reset;
    animatedHandleTranslateY.setValue(0);
    // Apply immediately
    const h = clamp(
      Math.round(baseHeight + reset),
      MIN_KEYBOARD_HEIGHT,
      MAX_KEYBOARD_HEIGHT,
    );
    keyboardBridge.setKeyboardHeight(h);
    setDisplayHeight(h);
    onOffsetChange(reset);
  }, [animatedHandleTranslateY, baseHeight, onOffsetChange]);

  const handleCancel = useCallback(() => {
    triggerKeyHaptic();
    if (onCancel) {
      onCancel();
    } else {
      onDone(currentOffset); // no change
    }
  }, [onCancel, onDone, currentOffset]);

  const barColor = theme.scheme === 'light' ? '#111111' : theme.label;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Dim the keyboard preview so it is clear this is a special mode.
          This view captures touches in the non-handle areas to prevent stray key presses. */}
      <View style={styles.dim} pointerEvents="auto" />

      {/* Top instruction */}
      <View style={styles.instructionWrap} pointerEvents="none">
        <Text style={[styles.instruction, {color: theme.label}]}>
          Drag the bar to resize keyboard
        </Text>
      </View>

      {/* The draggable top-edge handle. Transform is cheaper than changing top every move. */}
      <Animated.View
        style={[
          styles.handleContainer,
          {
            top: 8,
            transform: [{translateY: animatedHandleTranslateY}],
            zIndex: 10,
          },
        ]}
        {...panResponder.panHandlers}>
        <View style={[styles.handleBar, {backgroundColor: barColor}]}>
          <View style={styles.grip}>
            <View style={[styles.gripDot, {backgroundColor: theme.container}]} />
            <View style={[styles.gripDot, {backgroundColor: theme.container}]} />
            <View style={[styles.gripDot, {backgroundColor: theme.container}]} />
          </View>
        </View>
        <Text style={[styles.heightLabel, {color: theme.spaceLabel}]}>
          {displayHeight} dp
        </Text>
      </Animated.View>

      {/* Bottom controls */}
      <View style={[styles.controls, {zIndex: 10}]} pointerEvents="box-none">
        <Pressable
          onPress={handleReset}
          style={({pressed}) => [
            styles.controlBtn,
            styles.resetBtn,
            pressed && styles.controlBtnPressed,
          ]}>
          <Text style={[styles.controlText, {color: theme.label}]}>Reset</Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          style={({pressed}) => [
            styles.controlBtn,
            styles.doneBtn,
            {backgroundColor: theme.enter},
            pressed && {backgroundColor: theme.enterPressed},
          ]}>
          <Text style={[styles.controlText, {color: theme.iconOnEnter}]}>Done</Text>
        </Pressable>

        {onCancel ? (
          <Pressable
            onPress={handleCancel}
            style={({pressed}) => [
              styles.controlBtn,
              styles.cancelBtn,
              pressed && styles.controlBtnPressed,
            ]}>
            <Text style={[styles.controlText, {color: theme.label}]}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createResizeStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 100,
    },
    dim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.container,
      opacity: 0.55,
    },
    instructionWrap: {
      position: 'absolute',
      top: 52,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    instruction: {
      fontSize: 12,
      fontFamily: theme.fontFamily,
      letterSpacing: -0.2,
      opacity: 0.9,
    },
    handleContainer: {
      position: 'absolute',
      left: 16,
      right: 16,
      alignItems: 'center',
      // The handle itself is the touch target
    },
    handleBar: {
      width: '100%',
      height: HANDLE_HEIGHT,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      // subtle border to stand out
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    grip: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    gripDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      opacity: 0.85,
    },
    heightLabel: {
      position: 'absolute',
      right: 14,
      top: 6,
      fontSize: 11,
      fontFamily: theme.fontFamily,
    },
    controls: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 12,
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
    },
    controlBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      minWidth: 78,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.pluginCard,
    },
    controlBtnPressed: {
      opacity: 0.7,
    },
    resetBtn: {},
    doneBtn: {},
    cancelBtn: {},
    controlText: {
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      letterSpacing: -0.3,
    },
  });
}
