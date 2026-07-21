import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ArtificialIcon from '../../../assets/Artificial.svg';
import RocketLaunchIcon from '../../../assets/rocket_launch.svg';
import {useKeyLayoutContext} from '../gesture/KeyLayoutContext';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyDefinition} from '../layouts/qwerty';
import type {KeyboardTheme} from '../theme';
import {keyboardKeyChromeStyle, keyboardKeyPressMotionStyle} from '../theme';
import type {KeyGesturesConfig} from './Key';
import {MacintoshKeyBevels} from './MacintoshKeyBevels';

const LAUNCHER_HOLD_DELAY_MS = 400;
const REWRITE_HOLD_DELAY_MS = 400;

type PunctuationKeyProps = {
  keyDef: KeyDefinition;
  onPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
  keyHeight?: number;
  style?: StyleProp<ViewStyle>;
};

function PunctuationKeyComponent({
  keyDef,
  onPress,
  keyGestures,
  keyHeight: keyHeightProp,
  style,
}: PunctuationKeyProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createPunctuationKeyStyles);
  const keyHeight = keyHeightProp ?? theme.keyHeight;
  const layoutContext = useKeyLayoutContext();
  const keyRef = useRef<View>(null);

  const keyGesturesRef = useRef(keyGestures);
  keyGesturesRef.current = keyGestures;

  const [pressed, setPressed] = useState(false);
  const touchActiveRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef = useRef(false);
  const suppressTapRef = useRef(false);

  const isPeriod = keyDef.type === 'period';
  const isComma = keyDef.type === 'comma';
  const launcherOnPeriod = Boolean(keyGestures?.commaLauncher);
  const isLauncherKey =
    (isPeriod && launcherOnPeriod) || (isComma && !launcherOnPeriod);
  const isRewriteKey =
    (isComma && launcherOnPeriod) || (isPeriod && !launcherOnPeriod);

  const showLauncher =
    isLauncherKey && Boolean(keyGestures?.commaLauncherActive);
  const showRewrite =
    isRewriteKey &&
    Boolean(keyGestures?.periodRewrite && keyGestures.periodRewriteActive);

  const showLauncherRef = useRef(showLauncher);
  const showRewriteRef = useRef(showRewrite);
  showLauncherRef.current = showLauncher;
  showRewriteRef.current = showRewrite;

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const measureKey = useCallback(() => {
    const keyView = keyRef.current;
    const keysArea = layoutContext?.keysAreaRef.current;
    if (!keyView || !layoutContext) {
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
  }, [keyDef, layoutContext]);

  useEffect(() => {
    measureKey();
    return () => {
      layoutContext?.unregisterKey(keyDef.id);
    };
  }, [keyDef.id, layoutContext, measureKey]);

  useEffect(() => {
    const timer = setTimeout(measureKey, 0);
    return () => clearTimeout(timer);
  }, [
    measureKey,
    layoutContext?.layoutEpoch,
    layoutContext?.areaBounds.pageX,
    layoutContext?.areaBounds.pageY,
    layoutContext?.areaBounds.width,
    layoutContext?.areaBounds.height,
  ]);

  useEffect(() => () => clearHold(), [clearHold]);

  const beginTouch = useCallback(() => {
    if (touchActiveRef.current) {
      return;
    }
    touchActiveRef.current = true;
    didHoldRef.current = false;
    suppressTapRef.current = false;
    setPressed(true);
    triggerKeyHaptic();

    const gestures = keyGesturesRef.current;
    if (!gestures) {
      return;
    }

    if (isLauncherKey) {
      if (showLauncherRef.current) {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          didHoldRef.current = true;
          suppressTapRef.current = true;
          triggerKeyHaptic();
          gestures.onCommaLauncherDisarm();
        }, LAUNCHER_HOLD_DELAY_MS);
      } else {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          didHoldRef.current = true;
          suppressTapRef.current = true;
          triggerKeyHaptic();
          gestures.onCommaLongPress();
        }, LAUNCHER_HOLD_DELAY_MS);
      }
      return;
    }

    if (isRewriteKey && gestures.periodRewrite) {
      if (showRewriteRef.current) {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          didHoldRef.current = true;
          suppressTapRef.current = true;
          triggerKeyHaptic();
          gestures.onPeriodRewriteDisarm();
        }, REWRITE_HOLD_DELAY_MS);
      } else {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          didHoldRef.current = true;
          suppressTapRef.current = true;
          triggerKeyHaptic();
          gestures.onPeriodLongPress();
        }, REWRITE_HOLD_DELAY_MS);
      }
    }
  }, [isRewriteKey, isLauncherKey]);

  const finishTouch = useCallback(() => {
    if (!touchActiveRef.current) {
      return;
    }
    touchActiveRef.current = false;
    setPressed(false);

    const gestures = keyGesturesRef.current;
    const hadPendingHold = holdTimerRef.current !== null;
    clearHold();

    if (isLauncherKey && gestures) {
      if (showLauncherRef.current) {
        if (!suppressTapRef.current && !didHoldRef.current) {
          triggerKeyHaptic();
          gestures.onCommaLauncherPress();
        }
      } else if (hadPendingHold && !didHoldRef.current) {
        triggerKeyHaptic();
        onPress(keyDef);
      }
      didHoldRef.current = false;
      suppressTapRef.current = false;
      return;
    }

    if (isRewriteKey && gestures?.periodRewrite) {
      if (showRewriteRef.current) {
        if (!suppressTapRef.current && !didHoldRef.current) {
          triggerKeyHaptic();
          gestures.onPeriodRewritePress();
        }
      } else if (hadPendingHold && !didHoldRef.current) {
        triggerKeyHaptic();
        onPress(keyDef);
      }
      didHoldRef.current = false;
      suppressTapRef.current = false;
      return;
    }

    onPress(keyDef);
  }, [clearHold, isLauncherKey, isRewriteKey, keyDef, onPress]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderGrant: beginTouch,
        onPanResponderRelease: finishTouch,
        onPanResponderTerminate: finishTouch,
      }),
    [beginTouch, finishTouch],
  );

  const label = keyDef.label;
  const featureIconColor =
    theme.design === 'quivox' && showRewrite
      ? theme.iconOnEnter
      : theme.icon;
  const isQuivox = theme.design === 'quivox';
  const content = showLauncher ? (
    <RocketLaunchIcon width={20} height={20} color={featureIconColor} />
  ) : showRewrite ? (
    <ArtificialIcon width={18} height={17} color={featureIconColor} />
  ) : (
    <Text style={styles.keyLabel}>{label}</Text>
  );

  return (
    <View
      ref={keyRef}
      style={style}
      onLayout={measureKey}
      collapsable={false}
      {...panResponder.panHandlers}>
      <View
        style={[
          styles.key,
          {borderRadius: theme.keyRadius, minHeight: keyHeight},
          showRewrite && theme.design !== 'macintosh' && styles.rewriteKey,
          keyboardKeyChromeStyle(theme, pressed),
          keyboardKeyPressMotionStyle(theme, isQuivox && pressed),
          pressed && styles.keyPressed,
        ]}>
        {theme.design === 'macintosh' ? (
          <MacintoshKeyBevels pressed={pressed} />
        ) : null}
        {content}
      </View>
    </View>
  );
}

export const PunctuationKey = memo(PunctuationKeyComponent);

function createPunctuationKeyStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    key: {
      minHeight: theme.keyHeight,
      backgroundColor: theme.letterKey,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      overflow: 'hidden',
      position: 'relative',
    },
    rewriteKey: {
      backgroundColor: theme.essentialsAccent,
    },
    keyPressed: {
      backgroundColor: theme.letterKeyPressed,
    },
    keyLabel: {
      color: theme.label,
      fontSize: 22,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
    },
  });
}
