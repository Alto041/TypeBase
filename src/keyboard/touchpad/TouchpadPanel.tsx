import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  PixelRatio,
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

const TRACKPAD_STEP_PX = 12;
const TRACKPAD_ACTIVATION_SLOP_DP = 8;

type CursorDirection = 'left' | 'right' | 'up' | 'down';

function dp(value: number): number {
  return value * PixelRatio.get();
}

export function TouchpadPanel() {
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

  selectModeRef.current = selectMode;

  const moveDirection = useCallback((direction: CursorDirection) => {
    triggerKeyHaptic();
    void keyboardBridge.moveCursorDirection(direction, selectModeRef.current);
  }, []);

  const stepCursor = useCallback(() => {
    const accumX = accumXRef.current;
    const accumY = accumYRef.current;
    if (Math.abs(accumX) < TRACKPAD_STEP_PX && Math.abs(accumY) < TRACKPAD_STEP_PX) {
      return;
    }

    if (Math.abs(accumX) >= Math.abs(accumY)) {
      const step = accumX > 0 ? 1 : -1;
      accumXRef.current -= step * TRACKPAD_STEP_PX;
      moveDirection(step > 0 ? 'right' : 'left');
      return;
    }

    const step = accumY > 0 ? 1 : -1;
    accumYRef.current -= step * TRACKPAD_STEP_PX;
    moveDirection(step > 0 ? 'down' : 'up');
  }, [moveDirection]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          // Only claim pan gestures that start on the trackpad (left) side of the grid.
          // This keeps the responder target as the full-height grid container so long
          // swipes (even when the finger travels over buttons or up into the suggestion
          // bar) do not leak to the app below and accidentally hide the keyboard.
          const w = gridWidthRef.current;
          if (w <= 0) {
            return true;
          }
          const startX = (evt.nativeEvent as any).locationX ?? 0;
          return startX < w * 0.78;
        },
        onStartShouldSetPanResponderCapture: (evt) => {
          const w = gridWidthRef.current;
          if (w <= 0) {
            return true;
          }
          const startX = (evt.nativeEvent as any).locationX ?? 0;
          return startX < w * 0.78;
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
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

          while (
            Math.abs(accumXRef.current) >= TRACKPAD_STEP_PX ||
            Math.abs(accumYRef.current) >= TRACKPAD_STEP_PX
          ) {
            stepCursor();
          }
        },
        onPanResponderRelease: () => {
          accumXRef.current = 0;
          accumYRef.current = 0;
          lastDxRef.current = 0;
          lastDyRef.current = 0;
        },
        onPanResponderTerminate: () => {
          accumXRef.current = 0;
          accumYRef.current = 0;
          lastDxRef.current = 0;
          lastDyRef.current = 0;
        },
      }),
    [stepCursor],
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
        }}
        {...panResponder.panHandlers}>
        <View
          style={[
            styles.trackpad,
            selectMode && styles.trackpadSelecting,
          ]}
          pointerEvents="none"
        />

        <View style={styles.actionColumn}>
          <Pressable
            onPressIn={handleCopy}
            style={({pressed}) => [
              styles.actionKey,
              pressed && styles.actionKeyPressed,
            ]}>
            <CopyIcon width={22} height={22} color={actionIconColor} />
          </Pressable>

          <Pressable
            onPressIn={handleCut}
            style={({pressed}) => [
              styles.actionKey,
              pressed && styles.actionKeyPressed,
            ]}>
            <CutIcon width={22} height={22} color={actionIconColor} />
          </Pressable>

          <Pressable
            onPressIn={handleToggleSelect}
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
            onPressIn={handleBackspace}
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
