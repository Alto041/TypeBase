import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BackspaceIcon from '../../../assets/plugins/backspace.svg';
import CopyIcon from '../../../assets/plugins/copy.svg';
import CutIcon from '../../../assets/plugins/cut.svg';
import {usePluginPanelStyles} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';

const TRACKPAD_STEP_PX_HORIZONTAL = 12;
/** Vertical moves one line per step — use a larger threshold so small drags don't jump many lines. */
const TRACKPAD_STEP_PX_VERTICAL = 40;
const MAX_VERTICAL_STEPS_PER_MOVE = 1;

type CursorDirection = 'left' | 'right' | 'up' | 'down';

type TouchpadPanelProps = {
  onGestureActiveChange?: (active: boolean) => void;
};

export function TouchpadPanel({onGestureActiveChange}: TouchpadPanelProps) {
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createTouchpadStyles);
  const [selectMode, setSelectMode] = useState(false);
  const selectModeRef = useRef(false);
  const accumXRef = useRef(0);
  const accumYRef = useRef(0);
  const lastDxRef = useRef(0);
  const lastDyRef = useRef(0);
  const gridRef = useRef<any>(null);
  const gridWidthRef = useRef(0);
  const draggingRef = useRef(false);

  selectModeRef.current = selectMode;

  const setGestureActive = useCallback(
    (active: boolean) => {
      draggingRef.current = active;
      keyboardBridge.setTouchpadGestureConsuming(active);
      onGestureActiveChange?.(active);
    },
    [onGestureActiveChange],
  );

  useEffect(() => {
    return () => {
      keyboardBridge.setTouchpadGestureConsuming(false);
    };
  }, []);

  const moveDirection = useCallback((direction: CursorDirection) => {
    triggerKeyHaptic();
    void keyboardBridge.moveCursorDirection(direction, selectModeRef.current);
  }, []);

  const stepCursor = useCallback(() => {
    const accumX = accumXRef.current;
    const accumY = accumYRef.current;
    const horizontalDominant = Math.abs(accumX) >= Math.abs(accumY);

    if (horizontalDominant) {
      if (Math.abs(accumX) < TRACKPAD_STEP_PX_HORIZONTAL) {
        return false;
      }
      const step = accumX > 0 ? 1 : -1;
      accumXRef.current -= step * TRACKPAD_STEP_PX_HORIZONTAL;
      moveDirection(step > 0 ? 'right' : 'left');
      return true;
    }

    if (Math.abs(accumY) < TRACKPAD_STEP_PX_VERTICAL) {
      return false;
    }
    const step = accumY > 0 ? 1 : -1;
    accumYRef.current -= step * TRACKPAD_STEP_PX_VERTICAL;
    moveDirection(step > 0 ? 'down' : 'up');
    return true;
  }, [moveDirection]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => draggingRef.current,
        onMoveShouldSetPanResponderCapture: () => draggingRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          setGestureActive(true);
          accumXRef.current = 0;
          accumYRef.current = 0;
          lastDxRef.current = 0;
          lastDyRef.current = 0;
        },
        onPanResponderMove: (_event, gesture) => {
          const deltaX = gesture.dx - lastDxRef.current;
          const deltaY = gesture.dy - lastDyRef.current;
          lastDxRef.current = gesture.dx;
          lastDyRef.current = gesture.dy;
          accumXRef.current += deltaX;
          accumYRef.current += deltaY;

          let verticalSteps = 0;
          while (
            Math.abs(accumXRef.current) >= TRACKPAD_STEP_PX_HORIZONTAL ||
            Math.abs(accumYRef.current) >= TRACKPAD_STEP_PX_VERTICAL
          ) {
            const movedVertically =
              Math.abs(accumYRef.current) >= Math.abs(accumXRef.current) &&
              Math.abs(accumYRef.current) >= TRACKPAD_STEP_PX_VERTICAL;
            if (movedVertically) {
              if (verticalSteps >= MAX_VERTICAL_STEPS_PER_MOVE) {
                break;
              }
              verticalSteps += 1;
            }
            if (!stepCursor()) {
              break;
            }
          }
        },
        onPanResponderRelease: () => {
          setGestureActive(false);
          accumXRef.current = 0;
          accumYRef.current = 0;
          lastDxRef.current = 0;
          lastDyRef.current = 0;
        },
        onPanResponderTerminate: () => {
          setGestureActive(false);
          accumXRef.current = 0;
          accumYRef.current = 0;
          lastDxRef.current = 0;
          lastDyRef.current = 0;
        },
      }),
    [setGestureActive, stepCursor],
  );

  const handleCopy = useCallback(() => {
    triggerKeyHaptic();
    void keyboardBridge.copySelection();
  }, []);

  const handleCut = useCallback(() => {
    triggerKeyHaptic();
    void keyboardBridge.cutSelection();
  }, []);

  const handleToggleSelect = useCallback(() => {
    triggerKeyHaptic();
    setSelectMode(current => !current);
  }, []);

  const handleBackspace = useCallback(() => {
    triggerKeyHaptic();
    keyboardBridge.deleteBackward();
  }, []);

  const actionIconColor = theme.scheme === 'light' ? '#000000' : theme.icon;

  return (
    <View style={panelStyles.container}>
      <View
        ref={gridRef}
        collapsable={false}
        style={styles.grid}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) {
            gridWidthRef.current = w;
          }
        }}>
        <View
          style={[
            styles.trackpad,
            selectMode && styles.trackpadSelecting,
          ]}
          collapsable={false}
          {...panResponder.panHandlers}
        />

        <View style={styles.actionColumn} pointerEvents="box-none">
          <Pressable
            onPress={handleCopy}
            style={({pressed}) => [
              styles.actionKey,
              pressed && styles.actionKeyPressed,
            ]}>
            <CopyIcon width={22} height={22} color={actionIconColor} />
          </Pressable>

          <Pressable
            onPress={handleCut}
            style={({pressed}) => [
              styles.actionKey,
              pressed && styles.actionKeyPressed,
            ]}>
            <CutIcon width={22} height={22} color={actionIconColor} />
          </Pressable>

          <Pressable
            onPress={handleToggleSelect}
            style={({pressed}) => [
              styles.actionKey,
              styles.selectKey,
              selectMode && styles.selectKeyActive,
              pressed &&
                (selectMode ? styles.selectKeyActivePressed : styles.actionKeyPressed),
            ]}>
            <Text
              style={[
                styles.selectLabel,
                selectMode && styles.selectLabelActive,
              ]}
              numberOfLines={1}>
              Select
            </Text>
          </Pressable>

          <Pressable
            onPress={handleBackspace}
            style={({pressed}) => [
              styles.actionKey,
              pressed && styles.actionKeyPressed,
            ]}>
            <BackspaceIcon width={22} height={22} color={actionIconColor} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createTouchpadStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    grid: {
      flex: 1,
      flexDirection: 'row',
      paddingHorizontal: theme.keyRowPaddingHorizontal,
      paddingTop: 4,
      paddingBottom: 4,
      gap: theme.keyGap,
    },
    trackpad: {
      flex: 3,
      borderRadius: theme.keyRadius + 4,
      backgroundColor: theme.letterKey,
    },
    trackpadSelecting: {
      backgroundColor: theme.letterKeyPressed,
    },
    actionColumn: {
      flex: 1,
      gap: theme.keyGap,
    },
    actionKey: {
      flex: 1,
      borderRadius: theme.keyRadius,
      backgroundColor: theme.numpadActionKey,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: theme.numpadKeyHeight,
    },
    selectKey: {
      borderRadius: theme.numpadKeyHeight / 1,
      backgroundColor: theme.spaceKey,
    },
    selectKeyActive: {
      backgroundColor: theme.enter,
    },
    selectKeyActivePressed: {
      backgroundColor: theme.enterPressed,
    },
    actionKeyPressed: {
      backgroundColor: theme.modifierKeyPressed,
    },
    selectLabel: {
      color: theme.scheme === 'light' ? '#000000' : theme.spaceLabel,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '400',
    },
    selectLabelActive: {
      color: theme.iconOnEnter,
      fontWeight: '600',
    },
  });
}
