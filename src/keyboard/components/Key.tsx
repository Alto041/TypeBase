import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  findNodeHandle,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ShiftArrowIcon from '../../../assets/arrow_forward_ios.svg';
import EnterIcon from '../../../assets/enter.svg';
import QuivoxEnterIcon from '../../../assets/quivox_enter.svg';
import NextLineIcon from '../../../assets/next_line.svg';
import NumbersIcon from '../../../assets/123.svg';
import SymbolsIcon from '../../../assets/symbols.svg';
import RocketLaunchIcon from '../../../assets/rocket_launch.svg';
import ArtificialIcon from '../../../assets/Artificial.svg';
import {useKeyLayoutContext} from '../gesture/KeyLayoutContext';
import {gestureSwipeActiveRef} from '../gesture/gestureState';
import {
  isMultiTouchTextKey,
  registerMultiTouchKeyVisual,
} from '../gesture/multiTouchKeys';
import {hideKeyPreview, showKeyPreview} from '../KeyPreview';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyDefinition} from '../layouts/qwerty';
import type {KeyboardTheme} from '../theme';

const COMMA_HOLD_DELAY_MS = 400;
const PERIOD_HOLD_DELAY_MS = 400;
const CURSOR_STEP_PX = 10;
const SPACE_SWIPE_THRESHOLD_PX = 8;
const KEY_PRESS_RETENTION = {top: 18, left: 10, bottom: 18, right: 10};
const KEY_HIT_SLOP = {top: 3, left: 2, bottom: 3, right: 2};

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

export type KeyVariant = 'numpad';

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
  enterKeyNextLineEnabled?: boolean;
};

function KeyComponent({
  keyDef,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onPress,
  keyGestures,
  keyHeight: keyHeightProp,
  variant,
  enterKeyNextLineEnabled,
  style,
}: KeyProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createKeyStyles);
  const keyHeight = keyHeightProp ?? theme.keyHeight;
  const layoutContext = useKeyLayoutContext();
  const keyRef = useRef<View>(null);
  const spaceCursorAccumRef = useRef(0);
  const lastSpaceDxRef = useRef(0);
  const spaceSwipingRef = useRef(false);
  const spaceDidSwipeRef = useRef(false);
  const [multiTouchPressed, setMultiTouchPressed] = useState(false);
  const usesMultiTouchRouter = isMultiTouchTextKey(keyDef);
  const launcherHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launcherDidHoldRef = useRef(false);
  const launcherSuppressPressRef = useRef(false);
  const rewriteHoldDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewriteDidHoldRef = useRef(false);
  const rewriteSuppressPressRef = useRef(false);

  const isSpecial =
    keyDef.type &&
    keyDef.type !== 'char' &&
    keyDef.type !== 'comma' &&
    keyDef.type !== 'period' &&
    keyDef.type !== 'enter' &&
    keyDef.type !== 'enter-backspace' &&
    keyDef.type !== 'essentials-save' &&
    keyDef.type !== 'essentials-back' &&
    // Numbers/symbols are "alpha-numeric" style keys and should keep the
    // letterKey colors (not the modifierKey neutral caps).
    keyDef.type !== 'numbers' &&
    keyDef.type !== 'symbols' &&
    keyDef.type !== 'shift';
  const isEnterKey = keyDef.type === 'enter';
  const isEnterAction =
    keyDef.type === 'enter' || keyDef.type === 'essentials-save';
  const isShift = keyDef.type === 'shift';
  const isNumpadActionKey =
    variant === 'numpad' &&
    (keyDef.type === 'space' || keyDef.type === 'letters');
  const isSpaceKey = keyDef.type === 'space';
  const isAbcKey = keyDef.id === 'abc';
  const isNumbersIcon = keyDef.id === 'numbers';
  const isSymbolsIcon = keyDef.type === 'symbols';
  const isTextKey =
    Boolean(keyDef.value) &&
    keyDef.type !== 'space' &&
    keyDef.type !== 'enter' &&
    keyDef.type !== 'shift' &&
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
    if (!usesMultiTouchRouter) {
      return;
    }

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
  }, [keyDef, layoutContext, usesMultiTouchRouter]);

  useEffect(() => {
    if (!usesMultiTouchRouter) {
      return;
    }
    return registerMultiTouchKeyVisual(keyDef.id, pressed => {
      setMultiTouchPressed(pressed);
      if (pressed) {
        const tag = findNodeHandle(keyRef.current);
        const label = isUppercase
          ? (keyDef.value ?? '').toUpperCase()
          : (keyDef.value ?? '').toLowerCase();
        if (tag) {
          showKeyPreview(tag, label);
        }
      } else {
        hideKeyPreview(80);
      }
    });
  }, [keyDef.id, keyDef.value, isUppercase, usesMultiTouchRouter]);

  useEffect(() => {
    if (!usesMultiTouchRouter) {
      return;
    }
    measureKey();
    return () => {
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [keyDef.id, layoutContext, measureKey, usesMultiTouchRouter]);

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

  useEffect(() => {
    if (!usesMultiTouchRouter) {
      return;
    }
    const timer = setTimeout(measureKey, 0);
    return () => clearTimeout(timer);
  }, [
    measureKey,
    keyDef.id,
    usesMultiTouchRouter,
    layoutContext?.areaBounds.pageX,
    layoutContext?.areaBounds.pageY,
    layoutContext?.areaBounds.width,
    layoutContext?.areaBounds.height,
  ]);

  useEffect(() => {
    return () => {
      clearLauncherHold();
      clearRewriteHold();
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [clearLauncherHold, clearRewriteHold, keyDef.id, layoutContext]);

  const isLauncherGesture =
    keyDef.type === 'period' && keyGestures?.commaLauncher;
  const showLauncher = Boolean(
    isLauncherGesture && keyGestures?.commaLauncherActive,
  );
  const isRewriteGesture =
    keyDef.type === 'comma' && keyGestures?.periodRewrite;
  const showRewrite = Boolean(
    isRewriteGesture && keyGestures?.periodRewriteActive,
  );
  const isModifierKey =
    isShift ||
    isSpecial ||
    isNumpadActionKey ||
    showLauncher;
  const keyIconColor = isEnterAction ? theme.iconOnEnter : theme.icon;

  const keyContent = isEnterAction ? (
    theme.design === 'quivox' && isEnterKey ? (
      <QuivoxEnterIcon width={22} height={19} />
    ) : isEnterKey && enterKeyNextLineEnabled ? (
      <NextLineIcon width={20} height={20} color={keyIconColor} />
    ) : (
      <EnterIcon width={20} height={20} color={keyIconColor} />
    )
  ) : isNumbersIcon ? (
    <NumbersIcon width={26} height={14} color={keyIconColor} />
  ) : isSymbolsIcon ? (
    <SymbolsIcon width={22} height={22} color={keyIconColor} />
  ) : isShift ? (
    <View
      style={[
        styles.shiftIconContainer,
        {transform: [{scaleY: isUppercase ? -1 : 1}]},
      ]}>
      <ShiftArrowIcon width={16} height={12} color={keyIconColor} />
    </View>
  ) : showLauncher ? (
    <RocketLaunchIcon width={20} height={20} color={keyIconColor} />
  ) : showRewrite ? (
    <ArtificialIcon width={18} height={17} />
  ) : (
    <Text
      style={[
        styles.keyLabel,
        (isSpecial || isAbcKey) && styles.specialKeyLabel,
        isAbcKey && styles.abcLabel,
        keyDef.type === 'space' && styles.spaceLabel,
      ]}>
      {displayLabel}
    </Text>
  );

  const borderRadius = isEnterKey ? keyHeight / 2 : theme.keyRadius;

  const handlePressIn = useCallback(() => {
    onPress(keyDef);
    triggerKeyHaptic();
  }, [keyDef, onPress]);

  const isSpaceGesture =
    keyDef.type === 'space' && keyGestures?.spaceCursorSwipe;
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

  const gestureHandlers = isSpaceGesture ? spacePanResponder.panHandlers : undefined;

  const handlePressOut = useCallback(() => {}, []);

  if (usesMultiTouchRouter) {
    return (
      <View
        ref={keyRef}
        style={style}
        onLayout={measureKey}
        collapsable={false}
        pointerEvents="box-none">
        <View
          pointerEvents="none"
          style={[
            styles.key,
            {borderRadius, minHeight: keyHeight},
            multiTouchPressed && {opacity: 0.6},
          ]}>
          {keyContent}
        </View>
      </View>
    );
  }

  return (
    <View
      ref={keyRef}
      style={style}
      onLayout={measureKey}
      {...gestureHandlers}>
      <Pressable
          unstable_pressDelay={0}
          android_ripple={
            Platform.OS === 'android' &&
            !isTextKey &&
            !(isEnterAction || isShift || isModifierKey || isNumpadActionKey || isAbcKey)
              ? {color: theme.keyRipple}
              : undefined
          }
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
            {
              borderRadius:
                pressed &&
                (isEnterAction || isShift || isModifierKey || isNumpadActionKey || isAbcKey)
                  ? 0
                  : borderRadius,
              minHeight: keyHeight,
            },
            showRewrite && styles.rewriteKey,
            isShift && styles.shiftKey,
            isSpaceKey && styles.spaceKey,
            isModifierKey && styles.modifierKey,
            isShift && isShiftOn && !isCapsLocked && styles.shiftKeyActive,
            isShift && isCapsLocked && styles.shiftKeyLocked,
            isEnterAction && styles.enterKey,
            pressed &&
              !showLauncher &&
              !showRewrite &&
              (isEnterAction
                ? styles.enterKeyPressed
                : isSpaceKey
                  ? styles.spaceKeyPressed
                  : isModifierKey || isNumpadActionKey || isShift
                    ? styles.modifierKeyPressed
                    : styles.letterKeyPressed),
          ]}>
        {keyContent}
      </Pressable>
    </View>
  );
}

function keyPropsAreEqual(prev: KeyProps, next: KeyProps): boolean {
  return (
    prev.keyDef === next.keyDef &&
    prev.isUppercase === next.isUppercase &&
    prev.isShiftOn === next.isShiftOn &&
    prev.isCapsLocked === next.isCapsLocked &&
    prev.onPress === next.onPress &&
    prev.keyGestures === next.keyGestures &&
    prev.keyHeight === next.keyHeight &&
    prev.variant === next.variant &&
    prev.enterKeyNextLineEnabled === next.enterKeyNextLineEnabled &&
    prev.style === next.style
  );
}

export const Key = memo(KeyComponent, keyPropsAreEqual);

function createKeyStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    key: {
      minHeight: theme.keyHeight,
      backgroundColor: theme.letterKey,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      overflow: 'hidden',
    },
    modifierKey: {
      backgroundColor: theme.modifierKey,
    },
    spaceKey: {
      backgroundColor: theme.spaceKey,
    },
    rewriteKey: {
      backgroundColor: theme.essentialsAccent,
    },
    shiftKey: {
      overflow: 'visible',
    },
    shiftKeyActive: {
      backgroundColor: theme.modifierKeyPressed,
    },
    shiftKeyLocked: {
      backgroundColor: theme.modifierKey,
      borderWidth: 1,
      borderColor: theme.label,
    },
    shiftIconContainer: {
      width: 16,
      height: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    enterKey: {
      backgroundColor: theme.enter,
    },
    letterKeyPressed: {
      backgroundColor: theme.letterKeyPressed,
    },
    modifierKeyPressed: {
      backgroundColor: theme.modifierKeyPressed,
    },
    spaceKeyPressed: {
      backgroundColor: theme.spaceKeyPressed,
    },
    enterKeyPressed: {
      backgroundColor: theme.enterPressed,
    },
    keyLabel: {
      color: theme.label,
      fontSize: 22,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
    },
    specialKeyLabel: {
      fontSize: 15,
      fontWeight: '500',
    },
    abcLabel: {
      fontSize: 13,
      fontWeight: '600',
    },
    spaceLabel: {
      fontSize: 16,
      color: theme.spaceLabel,
      fontWeight: '400',
    },
  });
}
