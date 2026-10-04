import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';

const SEGMENT_PADDING = 4;
const TEXT_KERNING = -0.7;

export const SETTINGS_SEGMENT_PALETTE = {
  track: '#ECECEE',
  pill: '#111111',
  text: '#111111',
  textOn: '#ffffff',
  fontFamily: 'FragmentMono',
} as const;

export type SettingsSegmentOption<T extends string = string> = {
  id: T;
  label: string;
};

export type SettingsSegmentBarProps<T extends string> = {
  options: ReadonlyArray<SettingsSegmentOption<T>>;
  value: T | null | undefined;
  onChange: (next: T) => void;
  disabled?: boolean;
};

export function SettingsSegmentBar<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SettingsSegmentBarProps<T>) {
  const selectedIndex = useMemo(() => {
    if (!value) {
      return -1;
    }
    const index = options.findIndex(option => option.id === value);
    return index >= 0 ? index : -1;
  }, [options, value]);

  const pillIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const slideAnim = useRef(new Animated.Value(pillIndex)).current;
  const [slotWidth, setSlotWidth] = useState(0);
  const segmentCount = options.length;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: pillIndex,
      useNativeDriver: true,
      stiffness: 520,
      damping: 32,
      mass: 0.8,
    }).start();
  }, [pillIndex, slideAnim]);

  const inputRange = useMemo(
    () => options.map((_, optionIndex) => optionIndex),
    [options],
  );
  const outputRange = useMemo(
    () => options.map((_, optionIndex) => optionIndex * (slotWidth || 0)),
    [options, slotWidth],
  );

  const showPill = selectedIndex >= 0 && slotWidth > 0;

  return (
    <View
      style={[styles.segment, disabled && styles.segmentDisabled]}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        if (width > 0) {
          const inset = SEGMENT_PADDING * 2;
          setSlotWidth((width - inset) / segmentCount);
        }
      }}>
      {showPill ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: slotWidth,
              transform: [
                {
                  translateX: slideAnim.interpolate({
                    inputRange,
                    outputRange,
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {options.map(option => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{selected, disabled}}
            onPress={() => {
              if (selected) {
                return;
              }
              onChange(option.id);
            }}
            style={styles.item}>
            <Text style={[styles.text, selected && styles.textOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: SETTINGS_SEGMENT_PALETTE.track,
    borderRadius: 16,
    padding: SEGMENT_PADDING,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 32,
  },
  segmentDisabled: {
    opacity: 0.45,
  },
  pill: {
    position: 'absolute',
    left: SEGMENT_PADDING,
    top: SEGMENT_PADDING,
    bottom: SEGMENT_PADDING,
    borderRadius: 12,
    backgroundColor: SETTINGS_SEGMENT_PALETTE.pill,
  },
  item: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  text: {
    fontFamily: SETTINGS_SEGMENT_PALETTE.fontFamily,
    fontSize: 11,
    letterSpacing: TEXT_KERNING,
    color: SETTINGS_SEGMENT_PALETTE.text,
    textTransform: 'uppercase',
    fontWeight: '400',
  },
  textOn: {
    color: SETTINGS_SEGMENT_PALETTE.textOn,
  },
});
