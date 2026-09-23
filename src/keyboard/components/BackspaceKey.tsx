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
import {useKeyLayoutContext} from '../gesture/KeyLayoutContext';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyDefinition} from '../layouts/qwerty';
import type {KeyboardTheme} from '../theme';
import {keyboardKeyChromeStyle, keyboardKeyPressMotionStyle} from '../theme';
import {MacintoshKeyBevels} from './MacintoshKeyBevels';
import type {KeyGesturesConfig} from './Key';

const BACKSPACE_HOLD_DELAY_MS = 220;
const BACKSPACE_SENTENCE_ESCALATE_MS = 700;
const BACKSPACE_INITIAL_INTERVAL_MS = 48;
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
  compactTypingNativeActive?: boolean;
};

function BackspaceKeyComponent({
  keyDef,
  onPress,
  keyGestures,
  keyHeight: keyHeightProp,
  style,
  compactTypingNativeActive = false,
}: BackspaceKeyProps) {
  const layoutContext = useKeyLayoutContext();
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createBackspaceKeyStyles);
  const keyHeight = keyHeightProp ?? theme.keyHeight;
  const measureInNativeFastPath = theme.isLandscape;
  const keyOuterRef = useRef<View>(null);
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
        keyGesturesRef.current?.onBackspaceRelease?.();
      } else if (didSentenceRef.current || holdActivatedRef.current) {
        clearRepeat();
        keyGesturesRef.current?.onBackspaceRelease?.();
      } else {
        clearRepeat();
      }

      didSwipeRef.current = false;
      didSentenceRef.current = false;
    },
    [clearRepeat, keyDef, onPress, wordSwipeEnabled, wordSwipePx],
  );

  const handlePressIn = useCallback(() => {
    if (touchActiveRef.current) {
      // Fast re-tap before pressOut arrives — still delete and restart hold tracking.
      onPress(keyDef);
      triggerKeyHaptic();
      clearRepeat();
      beginHold();
      return;
    }
    touchActiveRef.current = true;
    didSwipeRef.current = false;
    didSentenceRef.current = false;
    setPressed(true);
    triggerKeyHaptic();
    onPress(keyDef);
    beginHold();
  }, [beginHold, clearRepeat, keyDef, onPress]);

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

  const measureKey = useCallback(() => {
    if (!layoutContext || !measureInNativeFastPath) {
      return;
    }
    const keyView = keyOuterRef.current;
    const keysArea = layoutContext.keysAreaRef.current;
    if (!keyView) {
      return;
    }

    const registerFromRect = (x: number, y: number, width: number, height: number) => {
      layoutContext.registerKey({
        id: keyDef.id,
        keyDef,
        x,
        y,
        width,
        height,
        centerX: x + width / 2,
        centerY: y + height / 2,
      });
    };

    if (keysArea) {
      keyView.measureLayout(
        keysArea,
        (x, y, width, height) => registerFromRect(x, y, width, height),
        () => {
          keysArea.measure(
            (_ax, _ay, _aw, _ah, areaPageX, areaPageY) => {
              keyView.measure(
                (_kx, _ky, width, height, keyPageX, keyPageY) => {
                  registerFromRect(
                    keyPageX - areaPageX,
                    keyPageY - areaPageY,
                    width,
                    height,
                  );
                },
              );
            },
          );
        },
      );
    }
  }, [keyDef, layoutContext, measureInNativeFastPath]);

  useEffect(() => {
    if (!measureInNativeFastPath) {
      layoutContext?.unregisterKey(keyDef.id);
      return;
    }
    measureKey();
    return () => {
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [keyDef.id, layoutContext, measureInNativeFastPath, measureKey]);

  useEffect(() => {
    if (!layoutContext || !measureInNativeFastPath) {
      return;
    }
    const timer = setTimeout(measureKey, 0);
    return () => clearTimeout(timer);
  }, [
    measureKey,
    layoutContext,
    layoutContext?.layoutEpoch,
  ]);

  const iconColor = isEnterBackspace ? theme.iconOnEnter : theme.icon;
  const icon = isEnterBackspace ? (
    <BackspaceIcon width={24} height={16} color={iconColor} />
  ) : isNumpadBack ? (
    <BackKeyIcon width={22} height={22} color={iconColor} />
  ) : (
    <BackspaceIcon width={24} height={16} color={iconColor} />
  );

  const borderRadius = isEnterBackspace ? keyHeight / 2 : theme.keyRadius;
  const isQuivox = theme.design === 'quivox';

  return (
    <View
      ref={keyOuterRef}
      style={style}
      collapsable={false}
      onLayout={measureKey}
      pointerEvents={compactTypingNativeActive ? 'none' : 'auto'}
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
            borderRadius,
            minHeight: keyHeight,
          },
          keyboardKeyChromeStyle(theme, pressed),
          keyboardKeyPressMotionStyle(theme, isQuivox && pressed),
          pressed && styles.modifierKeyPressed,
          pressed &&
            theme.design !== 'macintosh' &&
            theme.design !== 'quivox' &&
            styles.symbolKeyPressedFade,
        ]}>
        {theme.design === 'macintosh' ? (
          <MacintoshKeyBevels
            pressed={pressed}
            shape={isEnterBackspace ? 'pill' : 'rect'}
          />
        ) : null}
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
    symbolKeyPressedFade: {
      opacity: 0.82,
    },
    enterKey: {
      backgroundColor: theme.enter,
    },
  });
}
