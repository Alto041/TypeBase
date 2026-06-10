import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ShiftArrowIcon from '../../../assets/arrow_forward_ios.svg';
import BackspaceIcon from '../../../assets/keyboard_backspace.svg';
import EnterIcon from '../../../assets/enter.svg';
import NumbersIcon from '../../../assets/123.svg';
import SymbolsIcon from '../../../assets/symbols.svg';
import RocketLaunchIcon from '../../../assets/rocket_launch.svg';
import {useKeyLayoutContext} from '../gesture/KeyLayoutContext';
import {
  gestureSwipeActiveRef,
  shouldBlockSwipeTypingKeyInput,
} from '../gesture/gestureState';
import {triggerKeyHaptic} from '../haptics';
import type {KeyDefinition} from '../layouts/qwerty';
import {keyboardTheme} from '../theme';

const KEY_BORDER_RADIUS = 6;
const ENTER_BORDER_RADIUS = keyboardTheme.keyHeight / 2;
const KEY_PRESS_SCALE = 0.96;
const BACKSPACE_HOLD_DELAY_MS = 400;
const COMMA_HOLD_DELAY_MS = 400;
const BACKSPACE_INITIAL_INTERVAL_MS = 75;
const BACKSPACE_MIN_INTERVAL_MS = 25;
const BACKSPACE_ACCEL_STEP_MS = 10;
const CURSOR_STEP_PX = 10;
const SPACE_SWIPE_THRESHOLD_PX = 8;
const BACKSPACE_WORD_SWIPE_PX = 24;

export type KeyGesturesConfig = {
  spaceCursorSwipe: boolean;
  backspaceWordSwipe: boolean;
  backspaceSentenceHold: boolean;
  onCursorMove: (offset: number) => void;
  onDeleteWord: () => void;
  onDeleteSentence: () => void;
  commaLauncher: boolean;
  commaLauncherActive: boolean;
  onCommaLongPress: () => void;
  onCommaLauncherPress: () => void;
  onCommaLauncherDisarm: () => void;
  swipeTyping: boolean;
};

type KeyProps = {
  keyDef: KeyDefinition;
  isUppercase: boolean;
  isShiftOn: boolean;
  isCapsLocked: boolean;
  onPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
  style?: StyleProp<ViewStyle>;
};

export function Key({
  keyDef,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onPress,
  keyGestures,
  style,
}: KeyProps) {
  const layoutContext = useKeyLayoutContext();
  const keyRef = useRef<View>(null);
  const backspaceHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceRepeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceIntervalRef = useRef(BACKSPACE_INITIAL_INTERVAL_MS);
  const spaceCursorAccumRef = useRef(0);
  const lastSpaceDxRef = useRef(0);
  const spaceSwipingRef = useRef(false);
  const spaceDidSwipeRef = useRef(false);
  const backspaceDidSwipeRef = useRef(false);
  const commaHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commaDidHoldRef = useRef(false);
  const commaSuppressLaunchRef = useRef(false);

  const isSpecial =
    keyDef.type &&
    keyDef.type !== 'char' &&
    keyDef.type !== 'enter' &&
    keyDef.type !== 'enter-backspace' &&
    keyDef.type !== 'essentials-save' &&
    keyDef.type !== 'essentials-back' &&
    keyDef.type !== 'shift' &&
    keyDef.type !== 'backspace';
  const isEnterKey =
    keyDef.type === 'enter' || keyDef.type === 'enter-backspace';
  const isEnterAction =
    keyDef.type === 'enter' || keyDef.type === 'essentials-save';
  const isEnterBackspace = keyDef.type === 'enter-backspace';
  const isShift = keyDef.type === 'shift';
  const isBackspace =
    keyDef.type === 'backspace' || keyDef.type === 'enter-backspace';
  const isNumbersIcon = keyDef.id === 'numbers';
  const isSymbolsIcon = keyDef.type === 'symbols';
  const isLetterKey = Boolean(
    keyDef.value && /^[a-z]$/i.test(keyDef.value),
  );
  const isSwipeTypingLetter =
    Boolean(keyGestures?.swipeTyping) && isLetterKey;
  const isTextKey =
    Boolean(keyDef.value) &&
    keyDef.type !== 'space' &&
    keyDef.type !== 'enter' &&
    keyDef.type !== 'shift' &&
    keyDef.type !== 'backspace' &&
    keyDef.type !== 'enter-backspace' &&
    keyDef.type !== 'numbers' &&
    keyDef.type !== 'symbols' &&
    keyDef.type !== 'essentials-back' &&
    keyDef.type !== 'essentials-save';
  const displayLabel = isTextKey
    ? isUppercase
      ? keyDef.value!.toUpperCase()
      : keyDef.value!.toLowerCase()
    : keyDef.label;

  const measureKey = useCallback(() => {
    const keyView = keyRef.current;
    const keysArea = layoutContext?.keysAreaRef.current;
    if (!keyView || !layoutContext) {
      return;
    }

    const registerFromRect = (x: number, y: number, width: number, height: number) => {
      const letter =
        keyDef.value && /^[a-z]$/i.test(keyDef.value)
          ? keyDef.value.toLowerCase()
          : undefined;

      layoutContext.registerKey({
        id: keyDef.id,
        letter,
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
      return;
    }
  }, [keyDef, layoutContext]);

  const clearCommaHold = useCallback(() => {
    if (commaHoldDelayRef.current) {
      clearTimeout(commaHoldDelayRef.current);
      commaHoldDelayRef.current = null;
    }
  }, []);

  const clearBackspaceRepeat = useCallback(() => {
    if (backspaceHoldDelayRef.current) {
      clearTimeout(backspaceHoldDelayRef.current);
      backspaceHoldDelayRef.current = null;
    }
    if (backspaceRepeatRef.current) {
      clearTimeout(backspaceRepeatRef.current);
      backspaceRepeatRef.current = null;
    }
    backspaceIntervalRef.current = BACKSPACE_INITIAL_INTERVAL_MS;
  }, []);

  const scheduleBackspaceRepeat = useCallback(() => {
    clearBackspaceRepeat();

    const tick = () => {
      if (keyGestures?.backspaceSentenceHold) {
        keyGestures.onDeleteSentence();
        backspaceRepeatRef.current = setTimeout(tick, 180);
        return;
      }
      onPress(keyDef);
      backspaceIntervalRef.current = Math.max(
        BACKSPACE_MIN_INTERVAL_MS,
        backspaceIntervalRef.current - BACKSPACE_ACCEL_STEP_MS,
      );
      backspaceRepeatRef.current = setTimeout(tick, backspaceIntervalRef.current);
    };

    backspaceHoldDelayRef.current = setTimeout(() => {
      backspaceHoldDelayRef.current = null;
      tick();
    }, BACKSPACE_HOLD_DELAY_MS);
  }, [clearBackspaceRepeat, keyDef, keyGestures, onPress]);

  useEffect(() => {
    const timer = setTimeout(measureKey, 0);
    return () => {
      clearTimeout(timer);
      clearBackspaceRepeat();
      clearCommaHold();
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [
    keyDef.id,
    layoutContext,
    measureKey,
    layoutContext?.areaBounds.pageX,
    layoutContext?.areaBounds.pageY,
    layoutContext?.areaBounds.width,
    layoutContext?.areaBounds.height,
    clearBackspaceRepeat,
    clearCommaHold,
  ]);

  const isCommaGesture =
    keyDef.id === 'comma' && keyGestures?.commaLauncher;
  const showCommaLauncher = Boolean(
    isCommaGesture && keyGestures?.commaLauncherActive,
  );

  const keyContent = isEnterBackspace ? (
    <BackspaceIcon width={24} height={16} />
  ) : isEnterAction ? (
    <EnterIcon width={20} height={20} />
  ) : isNumbersIcon ? (
    <NumbersIcon width={26} height={14} />
  ) : isSymbolsIcon ? (
    <SymbolsIcon width={22} height={22} />
  ) : isShift ? (
    <View
      style={[
        styles.shiftIconContainer,
        {transform: [{scaleY: isUppercase ? -1 : 1}]},
      ]}>
      <ShiftArrowIcon width={16} height={12} />
    </View>
  ) : isBackspace ? (
    <BackspaceIcon width={24} height={16} />
  ) : showCommaLauncher ? (
    <RocketLaunchIcon width={20} height={20} />
  ) : (
    <Text
      style={[
        styles.keyLabel,
        isSpecial && styles.specialKeyLabel,
        keyDef.type === 'space' && styles.spaceLabel,
      ]}>
      {displayLabel}
    </Text>
  );

  const borderRadius = isEnterKey ? ENTER_BORDER_RADIUS : KEY_BORDER_RADIUS;

  const handlePressIn = useCallback(() => {
    if (isSwipeTypingLetter) {
      if (shouldBlockSwipeTypingKeyInput()) {
        return;
      }
      triggerKeyHaptic();
      onPress(keyDef);
      return;
    }
    if (gestureSwipeActiveRef.current) {
      return;
    }
    triggerKeyHaptic();
    onPress(keyDef);
    if (isBackspace) {
      scheduleBackspaceRepeat();
    }
  }, [isBackspace, isSwipeTypingLetter, keyDef, onPress, scheduleBackspaceRepeat]);

  const handlePressOut = useCallback(() => {
    if (isBackspace) {
      clearBackspaceRepeat();
    }
  }, [clearBackspaceRepeat, isBackspace]);

  const isSpaceGesture =
    keyDef.type === 'space' && keyGestures?.spaceCursorSwipe;
  const isBackspaceGesture =
    isBackspace && keyGestures?.backspaceWordSwipe;
  const handleCommaPressIn = useCallback(() => {
    if (gestureSwipeActiveRef.current) {
      return;
    }
    clearCommaHold();
    commaDidHoldRef.current = false;

    if (showCommaLauncher) {
      commaSuppressLaunchRef.current = false;
      commaHoldDelayRef.current = setTimeout(() => {
        commaHoldDelayRef.current = null;
        commaDidHoldRef.current = true;
        commaSuppressLaunchRef.current = true;
        triggerKeyHaptic();
        keyGestures?.onCommaLauncherDisarm();
      }, COMMA_HOLD_DELAY_MS);
      return;
    }

    commaHoldDelayRef.current = setTimeout(() => {
      commaHoldDelayRef.current = null;
      commaDidHoldRef.current = true;
      commaSuppressLaunchRef.current = true;
      triggerKeyHaptic();
      keyGestures?.onCommaLongPress();
    }, COMMA_HOLD_DELAY_MS);
  }, [clearCommaHold, keyGestures, showCommaLauncher]);

  const handleCommaPressOut = useCallback(() => {
    if (showCommaLauncher) {
      if (commaHoldDelayRef.current) {
        clearCommaHold();
      }
      commaDidHoldRef.current = false;
      return;
    }
    if (commaHoldDelayRef.current) {
      clearCommaHold();
      if (!commaDidHoldRef.current) {
        triggerKeyHaptic();
        onPress(keyDef);
      }
    }
    commaDidHoldRef.current = false;
  }, [clearCommaHold, keyDef, onPress, showCommaLauncher]);

  const handleCommaLauncherPress = useCallback(() => {
    if (!showCommaLauncher) {
      return;
    }
    if (commaSuppressLaunchRef.current) {
      commaSuppressLaunchRef.current = false;
      return;
    }
    triggerKeyHaptic();
    keyGestures?.onCommaLauncherPress();
  }, [keyGestures, showCommaLauncher]);

  const handleSpacePress = useCallback(() => {
    if (
      gestureSwipeActiveRef.current ||
      spaceSwipingRef.current ||
      spaceDidSwipeRef.current
    ) {
      spaceSwipingRef.current = false;
      spaceDidSwipeRef.current = false;
      return;
    }
    triggerKeyHaptic();
    onPress(keyDef);
  }, [keyDef, onPress]);

  const spacePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Boolean(isSpaceGesture) &&
          Math.abs(gesture.dx) > SPACE_SWIPE_THRESHOLD_PX &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          spaceSwipingRef.current = false;
          spaceDidSwipeRef.current = false;
          spaceCursorAccumRef.current = 0;
          lastSpaceDxRef.current = 0;
        },
        onPanResponderMove: (_, gesture) => {
          if (!keyGestures) {
            return;
          }
          if (Math.abs(gesture.dx) > SPACE_SWIPE_THRESHOLD_PX) {
            spaceSwipingRef.current = true;
            spaceDidSwipeRef.current = true;
          }
          const delta = gesture.dx - lastSpaceDxRef.current;
          lastSpaceDxRef.current = gesture.dx;
          spaceCursorAccumRef.current += delta;
          const stepPx = CURSOR_STEP_PX * PixelRatio.get();
          while (Math.abs(spaceCursorAccumRef.current) >= stepPx) {
            const step = spaceCursorAccumRef.current > 0 ? 1 : -1;
            spaceCursorAccumRef.current -= step * stepPx;
            keyGestures.onCursorMove(step);
          }
        },
        onPanResponderRelease: () => {
          spaceSwipingRef.current = false;
          spaceCursorAccumRef.current = 0;
          lastSpaceDxRef.current = 0;
        },
        onPanResponderTerminate: () => {
          spaceSwipingRef.current = false;
          spaceDidSwipeRef.current = false;
          spaceCursorAccumRef.current = 0;
          lastSpaceDxRef.current = 0;
        },
      }),
    [isSpaceGesture, keyGestures],
  );

  const backspacePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Boolean(isBackspaceGesture) &&
          gesture.dx < -SPACE_SWIPE_THRESHOLD_PX &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          backspaceDidSwipeRef.current = false;
          clearBackspaceRepeat();
        },
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx < -SPACE_SWIPE_THRESHOLD_PX) {
            backspaceDidSwipeRef.current = true;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            backspaceDidSwipeRef.current &&
            (gesture.dx < -BACKSPACE_WORD_SWIPE_PX || gesture.vx < -0.4)
          ) {
            triggerKeyHaptic();
            keyGestures?.onDeleteWord();
          }
          backspaceDidSwipeRef.current = false;
        },
        onPanResponderTerminate: () => {
          backspaceDidSwipeRef.current = false;
        },
      }),
    [clearBackspaceRepeat, isBackspaceGesture, keyGestures],
  );

  const gestureHandlers = isSpaceGesture
    ? spacePanResponder.panHandlers
    : isBackspaceGesture
      ? backspacePanResponder.panHandlers
      : undefined;

  return (
    <View
      ref={keyRef}
      style={style}
      onLayout={measureKey}
      {...gestureHandlers}>
      <Pressable
        onPress={
          showCommaLauncher
            ? handleCommaLauncherPress
            : isSpaceGesture
              ? handleSpacePress
              : undefined
        }
        onPressIn={
          isCommaGesture
            ? handleCommaPressIn
            : isSpaceGesture
              ? undefined
              : handlePressIn
        }
        onPressOut={
          isCommaGesture
            ? handleCommaPressOut
            : isSpaceGesture
              ? undefined
              : handlePressOut
        }
        style={({pressed}) => [
          styles.key,
          {borderRadius},
          showCommaLauncher && styles.commaLauncherKey,
          isShift && styles.shiftKey,
          isSpecial && styles.specialKey,
          keyDef.type === 'space' && styles.spaceKey,
          isShift && isShiftOn && !isCapsLocked && styles.shiftKeyActive,
          isShift && isCapsLocked && styles.shiftKeyLocked,
          (isEnterAction || isEnterBackspace) && styles.enterKey,
          pressed && !isShift && !showCommaLauncher && styles.keyPressedBounce,
        ]}>
        {keyContent}
      </Pressable>
    </View>
  );
}

type KeyboardRowProps = {
  keys: KeyDefinition[];
  isUppercase: boolean;
  isShiftOn: boolean;
  isCapsLocked: boolean;
  onKeyPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
  rowStyle?: StyleProp<ViewStyle>;
};

export function KeyboardRow({
  keys,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onKeyPress,
  keyGestures,
  rowStyle,
}: KeyboardRowProps) {
  return (
    <View style={[styles.row, rowStyle]}>
      {keys.map(keyDef =>
        keyDef.type === 'spacer' ? (
          <View key={keyDef.id} style={{flex: keyDef.flex ?? 1}} />
        ) : (
          <Key
            key={keyDef.id}
            keyDef={keyDef}
            isUppercase={isUppercase}
            isShiftOn={isShiftOn}
            isCapsLocked={isCapsLocked}
            onPress={onKeyPress}
            keyGestures={keyGestures}
            style={{flex: keyDef.flex ?? 1}}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
    paddingHorizontal: 4,
  },
  key: {
    minHeight: keyboardTheme.keyHeight,
    backgroundColor: keyboardTheme.key,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  commaLauncherKey: {
    backgroundColor: '#474747',
  },
  shiftKey: {
    overflow: 'visible',
  },
  specialKey: {
    backgroundColor: keyboardTheme.key,
  },
  spaceKey: {
    backgroundColor: keyboardTheme.key,
  },
  shiftKeyActive: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  shiftKeyLocked: {
    backgroundColor: keyboardTheme.key,
    borderWidth: 1,
    borderColor: keyboardTheme.label,
  },
  shiftIconContainer: {
    width: 16,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterKey: {
    backgroundColor: keyboardTheme.enter,
  },
  keyPressedBounce: {
    transform: [{scale: KEY_PRESS_SCALE}],
  },
  keyLabel: {
    color: keyboardTheme.label,
    fontSize: 20,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '500',
  },
  specialKeyLabel: {
    fontSize: 17,
    fontWeight: '500',
  },
  spaceLabel: {
    fontSize: 16,
    color: keyboardTheme.spaceLabel,
    fontWeight: '400',
  },
});
