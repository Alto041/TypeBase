import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const TRACK_RIGHT_GUTTER = 0;
const FILL_END_RADIUS = 12;
const DIVIDER_WIDTH = 3;
const LABEL_FONT = 'FragmentMono';
const VALUE_FONT = 'NType82';
const H_PADDING = 16;
const LABEL_VALUE_GAP = 10;

export type InsetSliderProps = {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  isDark?: boolean;
  invertTrackColors?: boolean;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(
  value: number,
  minimumValue: number,
  maximumValue: number,
  step: number,
): number {
  const stepped =
    minimumValue + Math.round((value - minimumValue) / step) * step;
  return clamp(stepped, minimumValue, maximumValue);
}

function InsetSlider({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  isDark = false,
  invertTrackColors = false,
  disabled = false,
  formatValue,
  onChange,
}: InsetSliderProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const [liveValue, setLiveValue] = useState(value);
  const labelTranslateX = useRef(new Animated.Value(0)).current;
  const lastEmittedRef = useRef(value);

  const trackBg = isDark ? '#3F3F3F' : '#E3E3E3';
  const fillBgDefault = isDark ? '#1F1F1F' : '#ffffff';
  const invertTrack = invertTrackColors && isDark;
  const containerBg = invertTrack ? fillBgDefault : trackBg;
  const fillBg = invertTrack ? trackBg : fillBgDefault;
  const dividerColor = isDark ? '#444450' : '#d0d0d4';
  const textColor = isDark ? '#ffffff' : '#111111';

  useEffect(() => {
    setLiveValue(value);
    lastEmittedRef.current = value;
  }, [value]);

  const displayValue = formatValue ? formatValue(liveValue) : String(liveValue);

  const progress =
    maximumValue === minimumValue
      ? 0
      : (liveValue - minimumValue) / (maximumValue - minimumValue);
  const fillWidth =
    layoutWidth > 0
      ? Math.max(0, progress * (layoutWidth - TRACK_RIGHT_GUTTER))
      : 0;
  const dividerLeft = Math.max(0, fillWidth - DIVIDER_WIDTH);

  useEffect(() => {
    const labelSafeRight = H_PADDING + labelWidth + LABEL_VALUE_GAP;
    const overflow = fillWidth - labelSafeRight;
    const target = overflow > 0 ? overflow : 0;
    Animated.spring(labelTranslateX, {
      toValue: target,
      useNativeDriver: true,
      stiffness: 520,
      damping: 34,
      mass: 0.7,
    }).start();
  }, [fillWidth, labelTranslateX, labelWidth]);

  const emitValue = useCallback(
    (next: number, haptic: boolean) => {
      const snapped = snapToStep(next, minimumValue, maximumValue, step);
      setLiveValue(snapped);
      if (snapped !== lastEmittedRef.current) {
        lastEmittedRef.current = snapped;
        onChange(snapped);
        if (haptic) {
          void Haptics.selectionAsync().catch(() => {});
        }
      }
    },
    [maximumValue, minimumValue, onChange, step],
  );

  const valueFromX = useCallback(
    (x: number) => {
      if (layoutWidth <= 0) {
        return liveValue;
      }
      const ratio = clamp(x / layoutWidth, 0, 1);
      return minimumValue + ratio * (maximumValue - minimumValue);
    },
    [layoutWidth, liveValue, maximumValue, minimumValue],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: evt => {
          emitValue(valueFromX(evt.nativeEvent.locationX), true);
        },
        onPanResponderMove: evt => {
          emitValue(valueFromX(evt.nativeEvent.locationX), false);
        },
        onPanResponderRelease: () => {
          void Haptics.selectionAsync().catch(() => {});
        },
      }),
    [disabled, emitValue, valueFromX],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: containerBg},
        disabled && styles.disabled,
      ]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      accessibilityValue={{
        min: minimumValue,
        max: maximumValue,
        now: liveValue,
      }}>
      <Text
        style={styles.labelMeasure}
        onLayout={event => setLabelWidth(event.nativeEvent.layout.width)}>
        {label}
      </Text>

      {layoutWidth > 0 && fillWidth > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              width: fillWidth,
              backgroundColor: fillBg,
              borderTopRightRadius: FILL_END_RADIUS,
              borderBottomRightRadius: FILL_END_RADIUS,
            },
          ]}
        />
      ) : null}

      {layoutWidth > 0 && fillWidth > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.divider,
            {left: dividerLeft, backgroundColor: dividerColor},
          ]}
        />
      ) : null}

      <Animated.Text
        pointerEvents="none"
        style={[
          styles.label,
          {color: textColor, transform: [{translateX: labelTranslateX}]},
        ]}
        numberOfLines={1}>
        {label}
      </Animated.Text>

      <Text pointerEvents="none" style={[styles.valueText, {color: textColor}]}>
        {displayValue}
      </Text>
    </View>
  );
}

export function StandaloneInsetSlider(props: InsetSliderProps) {
  return (
    <View style={standaloneStyles.shell}>
      <View style={standaloneStyles.bleed}>
        <InsetSlider {...props} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: H_PADDING,
  },
  disabled: {
    opacity: 0.38,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  divider: {
    position: 'absolute',
    top: '22%',
    bottom: '22%',
    width: DIVIDER_WIDTH,
    borderRadius: 999,
  },
  labelMeasure: {
    position: 'absolute',
    opacity: 0,
    left: H_PADDING,
    fontFamily: LABEL_FONT,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  label: {
    position: 'absolute',
    left: H_PADDING,
    top: 0,
    bottom: 0,
    fontFamily: LABEL_FONT,
    fontSize: 13,
    textTransform: 'uppercase',
    zIndex: 2,
    textAlignVertical: 'center',
    lineHeight: 54,
    includeFontPadding: false,
  },
  valueText: {
    position: 'absolute',
    right: H_PADDING,
    top: 0,
    bottom: 0,
    fontFamily: VALUE_FONT,
    fontSize: 13,
    textAlignVertical: 'center',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
    zIndex: 1,
    lineHeight: 54,
    includeFontPadding: false,
  },
});

const standaloneStyles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  bleed: {
    marginHorizontal: -12,
    alignSelf: 'stretch',
  },
});
