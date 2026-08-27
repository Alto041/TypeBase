import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const FILL_END_RADIUS = 12;
const DIVIDER_WIDTH = 3;
/** Inset from the inner track end so the divider stops before the value label / rounded edge. */
const TRACK_RIGHT_INSET = 52;
const LABEL_FONT = 'FragmentMono';
const VALUE_FONT = 'NType82';
const H_PADDING = 16;
/** Gap between label and divider when label sits to the right of the divider. */
const LABEL_DIVIDER_GAP = 8;
const TAP_MOVE_THRESHOLD_PX = 4;

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
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const labelTranslateX = useRef(new Animated.Value(0)).current;
  const lastEmittedRef = useRef(value);
  const dragStartXRef = useRef(0);
  const dragStartValueRef = useRef(value);
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);

  const trackBg = isDark ? '#3F3F3F' : '#E3E3E3';
  const fillBgDefault = isDark ? '#1F1F1F' : '#ffffff';
  const invertTrack = invertTrackColors && isDark;
  const containerBg = invertTrack ? fillBgDefault : trackBg;
  const fillBg = invertTrack ? trackBg : fillBgDefault;
  const dividerColor = isDark ? '#444450' : '#d0d0d4';
  const textColor = isDark ? '#ffffff' : '#111111';

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isDragging) {
      setLiveValue(value);
      lastEmittedRef.current = value;
      setDragValue(null);
    }
  }, [isDragging, value]);

  const visualValue =
    isDragging && dragValue != null
      ? clamp(dragValue, minimumValue, maximumValue)
      : liveValue;
  const snappedVisualValue = snapToStep(
    visualValue,
    minimumValue,
    maximumValue,
    step,
  );
  const displayValue = formatValue
    ? formatValue(snappedVisualValue)
    : String(snappedVisualValue);

  const trackWidth =
    layoutWidth > 0
      ? Math.max(0, layoutWidth - H_PADDING * 2 - TRACK_RIGHT_INSET)
      : 0;
  trackWidthRef.current = trackWidth;

  const progress =
    maximumValue === minimumValue
      ? 0
      : (visualValue - minimumValue) / (maximumValue - minimumValue);
  const fillWidth = trackWidth > 0 ? Math.max(0, progress * trackWidth) : 0;
  const dividerLeft = Math.max(0, fillWidth - DIVIDER_WIDTH);
  const labelRightEdge = H_PADDING + labelWidth;
  const dividerOverlapsLabel =
    fillWidth > 0 && labelWidth > 0 && dividerLeft <= labelRightEdge;
  const maxLabelTranslateX =
    layoutWidth > 0
      ? Math.max(0, layoutWidth - H_PADDING * 2 - TRACK_RIGHT_INSET - labelWidth)
      : 0;

  const labelTargetX = dividerOverlapsLabel
    ? Math.min(
        dividerLeft + DIVIDER_WIDTH + LABEL_DIVIDER_GAP - H_PADDING,
        maxLabelTranslateX,
      )
    : 0;

  useLayoutEffect(() => {
    if (isDragging) {
      labelTranslateX.stopAnimation();
      labelTranslateX.setValue(labelTargetX);
      return;
    }
    Animated.spring(labelTranslateX, {
      toValue: labelTargetX,
      useNativeDriver: true,
      stiffness: 520,
      damping: 34,
      mass: 0.7,
    }).start();
  }, [isDragging, labelTargetX, labelTranslateX]);

  const valueFromX = useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return dragStartValueRef.current;
    }
    const ratio = clamp((x - H_PADDING) / width, 0, 1);
    return minimumValue + ratio * (maximumValue - minimumValue);
  }, [maximumValue, minimumValue]);

  const valueFromDelta = useCallback(
    (deltaX: number, startValue: number) => {
      const width = trackWidthRef.current;
      if (width <= 0) {
        return startValue;
      }
      const deltaRatio = deltaX / width;
      return clamp(
        startValue + deltaRatio * (maximumValue - minimumValue),
        minimumValue,
        maximumValue,
      );
    },
    [maximumValue, minimumValue],
  );

  const commitValue = useCallback(
    (next: number) => {
      const snapped = snapToStep(next, minimumValue, maximumValue, step);
      setLiveValue(snapped);
      lastEmittedRef.current = snapped;
      onChangeRef.current(snapped);
      return snapped;
    },
    [maximumValue, minimumValue, step],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: evt => {
          dragStartXRef.current = evt.nativeEvent.locationX;
          dragStartValueRef.current = lastEmittedRef.current;
          setDragValue(lastEmittedRef.current);
          setIsDragging(true);
        },
        onPanResponderMove: evt => {
          const deltaX = evt.nativeEvent.locationX - dragStartXRef.current;
          setDragValue(valueFromDelta(deltaX, dragStartValueRef.current));
        },
        onPanResponderRelease: evt => {
          const deltaX = evt.nativeEvent.locationX - dragStartXRef.current;
          const raw =
            Math.abs(deltaX) <= TAP_MOVE_THRESHOLD_PX
              ? valueFromX(evt.nativeEvent.locationX)
              : valueFromDelta(deltaX, dragStartValueRef.current);
          commitValue(raw);
          setDragValue(null);
          setIsDragging(false);
          void Haptics.selectionAsync().catch(() => {});
        },
        onPanResponderTerminate: () => {
          setDragValue(null);
          setIsDragging(false);
        },
      }),
    [commitValue, disabled, valueFromDelta, valueFromX],
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
        now: snappedVisualValue,
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
