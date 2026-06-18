import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import BackKeyIcon from '../../../assets/back-key.svg';
import BackspaceIcon from '../../../assets/keyboard_backspace.svg';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyDefinition} from '../layouts/qwerty';
import type {KeyboardTheme} from '../theme';
import type {KeyGesturesConfig} from './Key';

const BACKSPACE_HOLD_DELAY_MS = 280;
const BACKSPACE_SENTENCE_ESCALATE_MS = 700;
const BACKSPACE_INITIAL_INTERVAL_MS = 75;
const BACKSPACE_SWIPE_ACTIVATE_PX = 6;
const BACKSPACE_WORD_SWIPE_PX = 14;
const KEY_PRESS_RETENTION = {top: 18, left: 10, bottom: 18, right: 10};

function dp(value: number): number {
  return value * PixelRatio.get();
}

type BackspaceKeyProps = {
  keyDef: KeyDefinition;
  onPress: (keyDef: KeyDefinition) => void;
  keyGestures?: Pick<
    KeyGesturesConfig,
    | 'backspaceWordSwipe'
    | 'backspaceSentenceHold'
    | 'onDeleteWord'
    | 'onDeleteSentence'
    | 'onBackspaceRelease'
  >;
  keyHeight?: number;
  style?: StyleProp<ViewStyle>;
};

function BackspaceKeyComponent({
  keyDef,
  onPress,
  keyGestures,
  keyHeight: keyHeightProp,
  style,
}: BackspaceKeyProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createBackspaceKeyStyles);
  const keyHeight = keyHeightProp ?? theme.keyHeight;
  const keyGesturesRef = useRef(keyGestures);
  const [pressed, setPressed] = useState(false);
  const touchActiveRef = useRef(false);
  const holdActivatedRef = useRef(false);
  const holdMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSentenceRef = useRef(false);
  const didSwipeRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  keyGesturesRef.current = keyGestures;

  const isNumpadBack = keyDef.type === 'numpad-back';
  const isEnterBackspace = keyDef.type === 'enter-backspace';
  const wordSwipeEnabled = Boolean(keyGestures?.backspaceWordSwipe);
  const wordSwipePx = dp(BACKSPACE_WORD_SWIPE_PX);

  const clearRepeat = useCallback(() => {
    keyboardBridge.stopBackspaceRepeat();
    if (holdMarkTimerRef.current) {
      clearTimeout(holdMarkTimerRef.current);
      holdMarkTimerRef.current = null;
    }
    if (sentenceTimerRef.current) {
      clearTimeout(sentenceTimerRef.current);
      sentenceTimerRef.current = null;
    }
    holdActivatedRef.current = false;
  }, []);

  const beginHold = useCallback(() => {
    clearRepeat();
    holdActivatedRef.current = false;
    keyboardBridge.startBackspaceRepeat(
      BACKSPACE_HOLD_DELAY_MS,
      BACKSPACE_INITIAL_INTERVAL_MS,
    );
    holdMarkTimerRef.current = setTimeout(() => {
      holdMarkTimerRef.current = null;
      if (touchActiveRef.current) {
        holdActivatedRef.current = true;
      }
    }, BACKSPACE_HOLD_DELAY_MS);

    if (keyGesturesRef.current?.backspaceSentenceHold) {
      sentenceTimerRef.current = setTimeout(() => {
        sentenceTimerRef.current = null;
        if (!touchActiveRef.current) {
          return;
        }
        keyboardBridge.stopBackspaceRepeat();
        holdActivatedRef.current = true;
        didSentenceRef.current = true;
        keyGesturesRef.current?.onDeleteSentence();
      }, BACKSPACE_SENTENCE_ESCALATE_MS);
    }
  }, [clearRepeat]);

  const finishPress = useCallback(
    (gesture?: {dx: number}) => {
      if (!touchActiveRef.current) {
        return;
      }
      touchActiveRef.current = false;
      setPressed(false);

      const shouldDeleteWord =
        wordSwipeEnabled &&
        (didSwipeRef.current || (gesture != null && gesture.dx < -wordSwipePx));

      if (shouldDeleteWord) {
        clearRepeat();
        triggerKeyHaptic();
        keyGesturesRef.current?.onDeleteWord();
      } else if (!didSentenceRef.current && !holdActivatedRef.current) {
        clearRepeat();
        onPress(keyDef);
      } else {
        clearRepeat();
      }

      didSwipeRef.current = false;
      didSentenceRef.current = false;
      keyGesturesRef.current?.onBackspaceRelease?.();
    },
    [clearRepeat, keyDef, onPress, wordSwipeEnabled, wordSwipePx],
  );

  const handlePressIn = useCallback(() => {
    if (touchActiveRef.current) {
      return;
    }
    touchActiveRef.current = true;
    didSwipeRef.current = false;
    didSentenceRef.current = false;
    setPressed(true);
    triggerKeyHaptic();
    beginHold();
  }, [beginHold]);

  const handlePressOut = useCallback(() => {
    finishPress();
  }, [finishPress]);

  const swipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Boolean(
            wordSwipeEnabled &&
              Math.abs(gesture.dx) > dp(BACKSPACE_SWIPE_ACTIVATE_PX) &&
              Math.abs(gesture.dx) > Math.abs(gesture.dy),
          ),
        onPanResponderGrant: (event) => {
          const touch = event.nativeEvent;
          startXRef.current = touch.pageX ?? 0;
          startYRef.current = touch.pageY ?? 0;
        },
        onPanResponderMove: (_, gesture) => {
          if (!wordSwipeEnabled || !touchActiveRef.current) {
            return;
          }
          const swipeLeft =
            gesture.dx < -dp(BACKSPACE_SWIPE_ACTIVATE_PX) &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy);
          if (!swipeLeft) {
            return;
          }
          if (!didSwipeRef.current) {
            clearRepeat();
            triggerKeyHaptic();
          }
          didSwipeRef.current = true;
        },
        onPanResponderRelease: (_, gesture) => {
          finishPress(gesture);
        },
        onPanResponderTerminate: () => {
          didSwipeRef.current = false;
          finishPress();
        },
      }),
    [clearRepeat, finishPress, wordSwipeEnabled],
  );

  useEffect(() => () => clearRepeat(), [clearRepeat]);

  const iconColor = theme.icon;
  const icon = isEnterBackspace ? (
    <BackspaceIcon width={24} height={16} color={iconColor} />
  ) : isNumpadBack ? (
    <BackKeyIcon width={22} height={22} color={iconColor} />
  ) : (
    <BackspaceIcon width={24} height={16} color={iconColor} />
  );

  const borderRadius = isEnterBackspace ? keyHeight / 2 : theme.keyRadius;

  return (
    <View
      style={style}
      collapsable={false}
      {...(wordSwipeEnabled ? swipePanResponder.panHandlers : undefined)}>
      <Pressable
        unstable_pressDelay={0}
        pressRetentionOffset={KEY_PRESS_RETENTION}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.key,
          styles.modifierKey,
          isEnterBackspace && styles.enterKey,
          {
            borderRadius: pressed ? 0 : borderRadius,
            minHeight: keyHeight,
          },
          pressed && styles.modifierKeyPressed,
        ]}>
        {icon}
      </Pressable>
    </View>
  );
}

export const BackspaceKey = memo(BackspaceKeyComponent);

function createBackspaceKeyStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    key: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.letterKey,
      paddingHorizontal: 5,
      overflow: 'hidden',
    },
    modifierKey: {
      backgroundColor: theme.modifierKey,
    },
    modifierKeyPressed: {
      backgroundColor: theme.modifierKeyPressed,
    },
    enterKey: {
      backgroundColor: theme.enter,
    },
  });
}
