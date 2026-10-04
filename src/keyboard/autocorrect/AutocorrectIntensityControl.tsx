import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';

import {SettingsSegmentBar} from '../../app/SettingsSegmentBar';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardThemeOrNull} from '../KeyboardThemeContext';
import type {AutocorrectIntensity} from './types';

const INTENSITY_OPTIONS: ReadonlyArray<{
  id: AutocorrectIntensity;
  label: string;
  settingsLabel: string;
}> = [
  {id: 'low', label: 'Low', settingsLabel: 'LOW'},
  {id: 'medium', label: 'Med', settingsLabel: 'MED'},
  {id: 'high', label: 'High', settingsLabel: 'HIGH'},
];

const TEXT_KERNING = -0.7;
const SEGMENT_PADDING = 4;

const SETTINGS = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  track: '#ECECEE',
  pill: '#111111',
  pillText: '#ffffff',
} as const;

function intensityIndex(value: AutocorrectIntensity): number {
  if (value === 'low') {
    return 0;
  }
  if (value === 'high') {
    return 2;
  }
  return 1;
}

type SegmentPalette = {
  track: string;
  pill: string;
  text: string;
  textOn: string;
  fontFamily: string;
  labelUppercase: boolean;
};

export type AutocorrectIntensityControlProps = {
  intensity: AutocorrectIntensity;
  onChange: (intensity: AutocorrectIntensity) => void;
  disabled?: boolean;
  appearance?: 'keyboard' | 'settings';
  /** Hide title when the parent row already shows it (Settings). */
  showTitle?: boolean;
};

export function AutocorrectIntensityControl({
  intensity,
  onChange,
  disabled = false,
  appearance = 'keyboard',
  showTitle = true,
}: AutocorrectIntensityControlProps) {
  const theme = useKeyboardThemeOrNull();
  const isSettings = appearance === 'settings';

  const palette: SegmentPalette = useMemo(() => {
    if (isSettings || !theme) {
      return {
        track: SETTINGS.track,
        pill: SETTINGS.pill,
        text: SETTINGS.text,
        textOn: SETTINGS.pillText,
        fontFamily: 'FragmentMono',
        labelUppercase: true,
      };
    }
    return {
      track: theme.pluginCardSecondary,
      pill: theme.chipSelectedBackground,
      text: theme.label,
      textOn: theme.chipSelectedText,
      fontFamily: theme.fontFamily,
      labelUppercase: false,
    };
  }, [isSettings, theme]);

  const styles = useMemo(
    () => createStyles(palette, isSettings),
    [palette, isSettings],
  );

  const hint =
    intensity === 'low'
      ? 'Fewer auto-fixes on space; bar still suggests fixes.'
      : intensity === 'high'
        ? 'Fixes more typos on space; may over-correct rare words.'
        : 'Default Typebase balance.';

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      {showTitle ? (
        <View style={styles.header}>
          <Text style={styles.title}>Correction intensity</Text>
          {!isSettings ? (
            <Text style={styles.hint}>{hint}</Text>
          ) : null}
        </View>
      ) : null}
      {isSettings ? (
        <SettingsSegmentBar
          options={INTENSITY_OPTIONS.map(option => ({
            id: option.id,
            label: option.settingsLabel,
          }))}
          value={intensity}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <IntensitySegmentBar
          intensity={intensity}
          disabled={disabled}
          palette={palette}
          onChange={next => {
            triggerKeyHaptic();
            onChange(next);
          }}
        />
      )}
    </View>
  );
}

function IntensitySegmentBar({
  intensity,
  disabled,
  palette,
  onChange,
}: {
  intensity: AutocorrectIntensity;
  disabled: boolean;
  palette: SegmentPalette;
  onChange: (next: AutocorrectIntensity) => void;
}) {
  const index = intensityIndex(intensity);
  const slideAnim = useRef(new Animated.Value(index)).current;
  const [slotWidth, setSlotWidth] = useState(0);
  const segmentCount = INTENSITY_OPTIONS.length;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: index,
      useNativeDriver: true,
      stiffness: 520,
      damping: 32,
      mass: 0.8,
    }).start();
  }, [index, slideAnim]);

  const inputRange = useMemo(
    () => INTENSITY_OPTIONS.map((_, optionIndex) => optionIndex),
    [],
  );
  const outputRange = useMemo(
    () => INTENSITY_OPTIONS.map((_, optionIndex) => optionIndex * (slotWidth || 0)),
    [slotWidth],
  );

  const barStyles = useMemo(
    () =>
      StyleSheet.create({
        segment: {
          flexDirection: 'row',
          backgroundColor: palette.track,
          borderRadius: 16,
          padding: SEGMENT_PADDING,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 32,
          opacity: disabled ? 0.45 : 1,
        },
        pill: {
          position: 'absolute',
          left: SEGMENT_PADDING,
          top: SEGMENT_PADDING,
          bottom: SEGMENT_PADDING,
          borderRadius: 12,
          backgroundColor: palette.pill,
        },
        item: {
          flex: 1,
          paddingVertical: 5,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        },
        text: {
          fontFamily: palette.fontFamily,
          fontSize: 12,
          letterSpacing: TEXT_KERNING,
          color: palette.text,
          textTransform: palette.labelUppercase ? 'uppercase' : 'none',
          fontWeight: '600',
        },
        textOn: {
          color: palette.textOn,
        },
      }),
    [disabled, palette],
  );

  return (
    <View
      style={barStyles.segment}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        if (width > 0) {
          const inset = SEGMENT_PADDING * 2;
          setSlotWidth((width - inset) / segmentCount);
        }
      }}>
      {slotWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            barStyles.pill,
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
      {INTENSITY_OPTIONS.map(option => {
        const selected = intensity === option.id;
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
            style={barStyles.item}>
            <Text style={[barStyles.text, selected && barStyles.textOn]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(palette: SegmentPalette, isSettings: boolean) {
  return StyleSheet.create({
    wrap: {
      gap: isSettings ? 10 : 8,
    },
    wrapDisabled: {
      opacity: 0.92,
    },
    header: {
      gap: 2,
    },
    title: {
      color: isSettings ? SETTINGS.text : palette.text,
      fontSize: isSettings ? 16 : 15,
      fontFamily: isSettings ? 'FragmentMono' : palette.fontFamily,
      fontWeight: isSettings ? '400' : '600',
      textTransform: isSettings ? 'uppercase' : 'none',
      letterSpacing: TEXT_KERNING,
    },
    hint: {
      color: SETTINGS.sub,
      fontSize: isSettings ? 13 : 12,
      fontFamily: isSettings ? 'FragmentMono' : palette.fontFamily,
      lineHeight: isSettings ? 18 : 16,
      letterSpacing: isSettings ? TEXT_KERNING : 0,
    },
  });
}

/** Keyboard Autocorrect panel — matches SettingRow title + hint + segment. */
export function AutocorrectIntensitySettingBlock({
  intensity,
  onChange,
  disabled,
}: {
  intensity: AutocorrectIntensity;
  onChange: (intensity: AutocorrectIntensity) => void;
  disabled?: boolean;
}) {
  const theme = useKeyboardThemeOrNull();
  const styles = useMemo(() => {
    const font = theme?.fontFamily ?? 'System';
    return StyleSheet.create({
      block: {
        gap: 10,
      },
      settingText: {
        gap: 2,
      },
      settingTitle: {
        color: theme?.label ?? SETTINGS.text,
        fontSize: 15,
        fontFamily: font,
        fontWeight: '600',
      },
      settingHint: {
        color: theme?.spaceLabel ?? SETTINGS.sub,
        fontSize: 12,
        fontFamily: font,
        lineHeight: 16,
      },
    });
  }, [theme]);

  return (
    <View style={styles.block}>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>Correction intensity</Text>
        <Text style={styles.settingHint}>
          How bold auto-fix on space is — Low, Med, or High.
        </Text>
      </View>
      <AutocorrectIntensityControl
        intensity={intensity}
        onChange={onChange}
        disabled={disabled}
        appearance="keyboard"
        showTitle={false}
      />
    </View>
  );
}
