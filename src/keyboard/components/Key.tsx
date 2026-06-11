import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import BackKeyIcon from '../../../assets/back-key.svg';
import BackspaceIcon from '../../../assets/keyboard_backspace.svg';
import EnterIcon from '../../../assets/enter.svg';
import NumbersIcon from '../../../assets/123.svg';
import SymbolsIcon from '../../../assets/symbols.svg';
import RocketLaunchIcon from '../../../assets/rocket_launch.svg';
import ArtificialIcon from '../../../assets/Artificial.svg';
import {useKeyLayoutContext} from '../gesture/KeyLayoutContext';
import {
  gestureSwipeActiveRef,
  shouldBlockSwipeTypingKeyInput,
  swipeTypingSessionRef,
} from '../gesture/gestureState';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyDefinition} from '../layouts/qwerty';
import {keyboardTheme} from '../theme';

const KEY_BORDER_RADIUS = 6;
const KEY_PRESS_SCALE = 0.96;
const BACKSPACE_HOLD_DELAY_MS = 280;
const BACKSPACE_SENTENCE_ESCALATE_MS = 700;
const BACKSPACE_SWIPE_ACTIVATE_PX = 10;
const COMMA_HOLD_DELAY_MS = 400;
const PERIOD_HOLD_DELAY_MS = 400;
const BACKSPACE_INITIAL_INTERVAL_MS = 75;
const BACKSPACE_MIN_INTERVAL_MS = 25;
const BACKSPACE_ACCEL_STEP_MS = 10;
const CURSOR_STEP_PX = 10;
const SPACE_SWIPE_THRESHOLD_PX = 8;
const BACKSPACE_WORD_SWIPE_PX = 24;
const KEY_PRESS_RETENTION = {top: 18, left: 10, bottom: 18, right: 10};
const KEY_HIT_SLOP = {top: 3, left: 2, bottom: 3, right: 2};

function dp(value: number): number {
  return value * PixelRatio.get();
}

export type KeyGesturesConfig = {
  spaceCursorSwipe: boolean;
  backspaceWordSwipe: boolean;
  backspaceSentenceHold: boolean;
  onCursorMove: (offset: number) => void;
  onDeleteWord: () => void;
  onDeleteSentence: () => void;
  onBackspaceRelease?: () => void;
  commaLauncher: boolean;
  commaLauncherActive: boolean;
  onCommaLongPress: () => void;
  onCommaLauncherPress: () => void;
  onCommaLauncherDisarm: () => void;
  periodRewrite: boolean;
  periodRewriteActive: boolean;
  onPeriodLongPress: () => void;
  onPeriodRewritePress: () => void;
  onPeriodRewriteDisarm: () => void;
  swipeTyping: boolean;
};

type KeyVariant = 'numpad';

type KeyProps = {
  keyDef: KeyDefinition;
  isUppercase: boolean;
  isShiftOn: boolean;
  isCapsLocked: boolean;
  onPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
  keyHeight?: number;
  variant?: KeyVariant;
  style?: StyleProp<ViewStyle>;
};

export function Key({
  keyDef,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onPress,
  keyGestures,
  keyHeight = keyboardTheme.keyHeight,
  variant,
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
  const backspaceHoldStartedAtRef = useRef(0);
  const backspaceTouchActiveRef = useRef(false);
  const keyGesturesRef = useRef(keyGestures);
  const [isBackspaceHeld, setIsBackspaceHeld] = useState(false);

  keyGesturesRef.current = keyGestures;
  const launcherHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launcherDidHoldRef = useRef(false);
  const launcherSuppressPressRef = useRef(false);
  const rewriteHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewriteDidHoldRef = useRef(false);
  const rewriteSuppressPressRef = useRef(false);

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
  const isNumpadBack = keyDef.type === 'numpad-back';
  const isNumpadActionKey =
    variant === 'numpad' &&
    (isNumpadBack || keyDef.type === 'space' || keyDef.type === 'letters');
  const isBackspace =
    keyDef.type === 'backspace' ||
    keyDef.type === 'enter-backspace' ||
    isNumpadBack;
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

  const clearLauncherHold = useCallback(() => {
    if (launcherHoldDelayRef.current) {
      clearTimeout(launcherHoldDelayRef.current);
      launcherHoldDelayRef.current = null;
    }
  }, []);

  const clearRewriteHold = useCallback(() => {
    if (rewriteHoldDelayRef.current) {
      clearTimeout(rewriteHoldDelayRef.current);
      rewriteHoldDelayRef.current = null;
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
    backspaceHoldStartedAtRef.current = Date.now();

    const tick = () => {
      const gestures = keyGesturesRef.current;
      const heldFor = Date.now() - backspaceHoldStartedAtRef.current;
      if (
        gestures?.backspaceSentenceHold &&
        heldFor >= BACKSPACE_SENTENCE_ESCALATE_MS
      ) {
        gestures.onDeleteSentence();
        backspaceRepeatRef.current = setTimeout(tick, 180);
        return;
      }

      keyboardBridge.deleteBackward();
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
  }, [clearBackspaceRepeat]);

  useEffect(() => {
    const timer = setTimeout(measureKey, 0);
    return () => clearTimeout(timer);
  }, [
    measureKey,
    keyDef.id,
    layoutContext?.areaBounds.pageX,
    layoutContext?.areaBounds.pageY,
    layoutContext?.areaBounds.width,
    layoutContext?.areaBounds.height,
  ]);

  useEffect(() => {
    return () => {
      clearBackspaceRepeat();
      clearLauncherHold();
      clearRewriteHold();
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [clearBackspaceRepeat, clearLauncherHold, clearRewriteHold, keyDef.id, layoutContext]);

  const isLauncherGesture =
    keyDef.id === 'period' && keyGestures?.commaLauncher;
  const showLauncher = Boolean(
    isLauncherGesture && keyGestures?.commaLauncherActive,
  );
  const isRewriteGesture =
    keyDef.id === 'comma' && keyGestures?.periodRewrite;
  const showRewrite = Boolean(
    isRewriteGesture && keyGestures?.periodRewriteActive,
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
  ) : isNumpadBack ? (
    <BackKeyIcon width={22} height={22} />
  ) : isBackspace ? (
    <BackspaceIcon width={24} height={16} />
  ) : showLauncher ? (
    <RocketLaunchIcon width={20} height={20} />
  ) : showRewrite ? (
    <ArtificialIcon width={18} height={17} />
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

  const borderRadius = isEnterKey ? keyHeight / 2 : KEY_BORDER_RADIUS;

  const handlePressIn = useCallback(() => {
    if (isSwipeTypingLetter) {
      if (shouldBlockSwipeTypingKeyInput()) {
        return;
      }
      onPress(keyDef);
      swipeTypingSessionRef.tapCommitted = true;
      triggerKeyHaptic();
      return;
    }
    onPress(keyDef);
    triggerKeyHaptic();
  }, [isSwipeTypingLetter, keyDef, onPress]);

  const finishBackspaceHold = useCallback(() => {
    if (!backspaceTouchActiveRef.current) {
      return;
    }
    backspaceTouchActiveRef.current = false;
    setIsBackspaceHeld(false);
    clearBackspaceRepeat();
    keyGesturesRef.current?.onBackspaceRelease?.();
  }, [clearBackspaceRepeat]);

  const handleBackspaceTouchStart = useCallback(() => {
    if (gestureSwipeActiveRef.current || backspaceTouchActiveRef.current) {
      return;
    }
    backspaceTouchActiveRef.current = true;
    setIsBackspaceHeld(true);
    triggerKeyHaptic();
    keyboardBridge.deleteBackward();
    scheduleBackspaceRepeat();
  }, [scheduleBackspaceRepeat]);

  const handlePressOut = useCallback(() => {
    if (isSwipeTypingLetter) {
      return;
    }
    if (isBackspace) {
      finishBackspaceHold();
    }
  }, [finishBackspaceHold, isBackspace, isSwipeTypingLetter]);

  const isSpaceGesture =
    keyDef.type === 'space' && keyGestures?.spaceCursorSwipe;
  const isBackspaceGesture =
    isBackspace && keyGestures?.backspaceWordSwipe;
  const handleLauncherPressIn = useCallback(() => {
    clearLauncherHold();
    launcherDidHoldRef.current = false;

    if (showLauncher) {
      launcherSuppressPressRef.current = false;
      launcherHoldDelayRef.current = setTimeout(() => {
        launcherHoldDelayRef.current = null;
        launcherDidHoldRef.current = true;
        launcherSuppressPressRef.current = true;
        triggerKeyHaptic();
        keyGestures?.onCommaLauncherDisarm();
      }, COMMA_HOLD_DELAY_MS);
      return;
    }

    launcherHoldDelayRef.current = setTimeout(() => {
      launcherHoldDelayRef.current = null;
      launcherDidHoldRef.current = true;
      launcherSuppressPressRef.current = true;
      triggerKeyHaptic();
      keyGestures?.onCommaLongPress();
    }, COMMA_HOLD_DELAY_MS);
  }, [clearLauncherHold, keyGestures, showLauncher]);

  const handleLauncherPressOut = useCallback(() => {
    if (showLauncher) {
      if (launcherHoldDelayRef.current) {
        clearLauncherHold();
      }
      launcherDidHoldRef.current = false;
      return;
    }
    if (launcherHoldDelayRef.current) {
      clearLauncherHold();
      if (!launcherDidHoldRef.current) {
        triggerKeyHaptic();
        onPress(keyDef);
      }
    }
    launcherDidHoldRef.current = false;
  }, [clearLauncherHold, keyDef, onPress, showLauncher]);

  const handleLauncherPress = useCallback(() => {
    if (!showLauncher) {
      return;
    }
    if (launcherSuppressPressRef.current) {
      launcherSuppressPressRef.current = false;
      return;
    }
    triggerKeyHaptic();
    keyGestures?.onCommaLauncherPress();
  }, [keyGestures, showLauncher]);

  const handleRewritePressIn = useCallback(() => {
    clearRewriteHold();
    rewriteDidHoldRef.current = false;

    if (showRewrite) {
      rewriteSuppressPressRef.current = false;
      rewriteHoldDelayRef.current = setTimeout(() => {
        rewriteHoldDelayRef.current = null;
        rewriteDidHoldRef.current = true;
        rewriteSuppressPressRef.current = true;
        triggerKeyHaptic();
        keyGestures?.onPeriodRewriteDisarm();
      }, PERIOD_HOLD_DELAY_MS);
      return;
    }

    rewriteHoldDelayRef.current = setTimeout(() => {
      rewriteHoldDelayRef.current = null;
      rewriteDidHoldRef.current = true;
      rewriteSuppressPressRef.current = true;
      triggerKeyHaptic();
      keyGestures?.onPeriodLongPress();
    }, PERIOD_HOLD_DELAY_MS);
  }, [clearRewriteHold, keyGestures, showRewrite]);

  const handleRewritePressOut = useCallback(() => {
    if (showRewrite) {
      if (rewriteHoldDelayRef.current) {
        clearRewriteHold();
      }
      rewriteDidHoldRef.current = false;
      return;
    }
    if (rewriteHoldDelayRef.current) {
      clearRewriteHold();
      if (!rewriteDidHoldRef.current) {
        triggerKeyHaptic();
        onPress(keyDef);
      }
    }
    rewriteDidHoldRef.current = false;
  }, [clearRewriteHold, keyDef, onPress, showRewrite]);

  const handleRewritePress = useCallback(() => {
    if (!showRewrite) {
      return;
    }
    if (rewriteSuppressPressRef.current) {
      rewriteSuppressPressRef.current = false;
      return;
    }
    triggerKeyHaptic();
    keyGestures?.onPeriodRewritePress();
  }, [keyGestures, showRewrite]);

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

  const backspaceWordSwipePx = dp(BACKSPACE_WORD_SWIPE_PX);

  const backspacePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isBackspace,
        onMoveShouldSetPanResponder: (_, gesture) =>
          isBackspace &&
          Math.abs(gesture.dx) > dp(BACKSPACE_SWIPE_ACTIVATE_PX) &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          backspaceDidSwipeRef.current = false;
          handleBackspaceTouchStart();
        },
        onPanResponderMove: (_, gesture) => {
          if (!isBackspaceGesture) {
            return;
          }
          if (gesture.dx < -dp(BACKSPACE_SWIPE_ACTIVATE_PX)) {
            if (!backspaceDidSwipeRef.current) {
              clearBackspaceRepeat();
            }
            backspaceDidSwipeRef.current = true;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            isBackspaceGesture &&
            backspaceDidSwipeRef.current &&
            (gesture.dx < -backspaceWordSwipePx || gesture.vx < -0.4)
          ) {
            triggerKeyHaptic();
            keyGesturesRef.current?.onDeleteWord();
          }
          backspaceDidSwipeRef.current = false;
          finishBackspaceHold();
        },
        onPanResponderTerminate: () => {
          backspaceDidSwipeRef.current = false;
          finishBackspaceHold();
        },
      }),
    [
      clearBackspaceRepeat,
      finishBackspaceHold,
      handleBackspaceTouchStart,
      isBackspace,
      isBackspaceGesture,
      backspaceWordSwipePx,
    ],
  );

  const gestureHandlers = isBackspace
    ? backspacePanResponder.panHandlers
    : isSpaceGesture
      ? spacePanResponder.panHandlers
      : undefined;

  return (
    <View
      ref={keyRef}
      style={style}
      onLayout={measureKey}
      {...gestureHandlers}>
      {isBackspace ? (
        <View
          style={[
            styles.key,
            {borderRadius, minHeight: keyHeight},
            isNumpadActionKey && styles.numpadActionKey,
            (isEnterAction || isEnterBackspace) && styles.enterKey,
            isBackspaceHeld && styles.keyPressedBounce,
          ]}>
          {keyContent}
        </View>
      ) : (
        <Pressable
          pressRetentionOffset={KEY_PRESS_RETENTION}
          hitSlop={isTextKey ? KEY_HIT_SLOP : undefined}
          onPress={
            showLauncher
              ? handleLauncherPress
              : showRewrite
                ? handleRewritePress
                : isSpaceGesture
                  ? handleSpacePress
                  : undefined
          }
          onPressIn={
            isLauncherGesture
              ? handleLauncherPressIn
              : isRewriteGesture
                ? handleRewritePressIn
                : isSpaceGesture
                  ? undefined
                  : handlePressIn
          }
          onPressOut={
            isLauncherGesture
              ? handleLauncherPressOut
              : isRewriteGesture
                ? handleRewritePressOut
                : isSpaceGesture
                  ? undefined
                  : handlePressOut
          }
          style={({pressed}) => [
            styles.key,
            {borderRadius, minHeight: keyHeight},
            showLauncher && styles.launcherKey,
            showRewrite && styles.rewriteKey,
            isShift && styles.shiftKey,
            isSpecial && styles.specialKey,
            keyDef.type === 'space' && styles.spaceKey,
            isNumpadActionKey && styles.numpadActionKey,
            isShift && isShiftOn && !isCapsLocked && styles.shiftKeyActive,
            isShift && isCapsLocked && styles.shiftKeyLocked,
            (isEnterAction || isEnterBackspace) && styles.enterKey,
            pressed &&
              !isShift &&
              !showLauncher &&
              !showRewrite &&
              styles.keyPressedBounce,
          ]}>
          {keyContent}
        </Pressable>
      )}
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
  keyHeight?: number;
  variant?: KeyVariant;
  rowStyle?: StyleProp<ViewStyle>;
};

export function KeyboardRow({
  keys,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onKeyPress,
  keyGestures,
  keyHeight,
  variant,
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
            keyHeight={keyHeight}
            variant={variant}
            style={{flex: keyDef.flex ?? 1, minWidth: 0}}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: keyboardTheme.keyGap,
    marginBottom: keyboardTheme.keyRowMargin,
    paddingHorizontal: keyboardTheme.keyRowPaddingHorizontal,
    alignItems: 'stretch',
  },
  key: {
    minHeight: keyboardTheme.keyHeight,
    backgroundColor: keyboardTheme.key,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  launcherKey: {
    backgroundColor: '#474747',
  },
  numpadActionKey: {
    backgroundColor: keyboardTheme.numpadActionKey,
  },
  rewriteKey: {
    backgroundColor: keyboardTheme.essentialsAccent,
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
    fontSize: 22,
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
