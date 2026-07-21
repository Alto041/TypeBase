import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import OneHandIcon from '../../../assets/onehand.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import type {OneHandSettings, OneHandSide} from './types';

const TOGGLE_ON_COLOR = '#2CC642';

type OneHandPanelProps = {
  settings: OneHandSettings;
  onToggleEnabled: (enabled: boolean) => void;
  onSelectSide: (side: OneHandSide) => void;
  onSelectStrength: (strength: number) => void;
};

const STRENGTH_PRESETS: Array<{label: string; value: number}> = [
  {label: 'Soft', value: 0.35},
  {label: 'Normal', value: 0.55},
  {label: 'Strong', value: 0.8},
];

function FeatureToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(createOneHandStyles);
  return (
    <Pressable
      onPress={() => {
        triggerKeyHaptic();
        onToggle();
      }}
      style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
      <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
    </Pressable>
  );
}

function SideChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createOneHandStyles);
  return (
    <Pressable
      onPress={() => {
        triggerKeyHaptic();
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function OneHandPanel({
  settings,
  onToggleEnabled,
  onSelectSide,
  onSelectStrength,
}: OneHandPanelProps) {
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createOneHandStyles);
  const activeSide: OneHandSide = settings.enabled ? settings.side : 'center';

  return (
    <View style={panelStyles.container}>
      <PluginScrollView fadeScrollInset>
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <OneHandIcon width={18} height={18} color={theme.icon} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>One Hand</Text>
            <Text style={styles.heroSub}>
            Same layout, optimized for thumb reach.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Enable</Text>
              <Text style={styles.rowHint}>
              Fit keys into a compact one-handed area.
              </Text>
            </View>
            <FeatureToggle
              enabled={settings.enabled}
              onToggle={() => onToggleEnabled(!settings.enabled)}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>POSITION</Text>
          <View style={styles.chipRow}>
            <SideChip
              label="Left"
              selected={activeSide === 'left'}
              onPress={() => onSelectSide('left')}
            />
            <SideChip
              label="Center"
              selected={activeSide === 'center' || !settings.enabled}
              onPress={() => onSelectSide('center')}
            />
            <SideChip
              label="Right"
              selected={activeSide === 'right'}
              onPress={() => onSelectSide('right')}
            />
          </View>
          <Text style={styles.sectionHint}>
          Pack keys toward the left or right edge.
          </Text>
        </View>

        <View style={[styles.card, styles.cardLast]}>
          <Text style={styles.sectionLabel}>REACH</Text>
          <View style={styles.chipRow}>
            {STRENGTH_PRESETS.map(preset => {
              const selected =
                settings.enabled &&
                Math.abs(settings.strength - preset.value) < 0.08;
              return (
                <SideChip
                  key={preset.label}
                  label={preset.label}
                  selected={selected}
                  onPress={() => onSelectStrength(preset.value)}
                />
              );
            })}
          </View>
          <Text style={styles.sectionHint}>
          Resize the key area while preserving the same layout.
          </Text>
        </View>
      </PluginScrollView>
    </View>
  );
}

function createOneHandStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 2,
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
    },
    heroIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: theme.pluginCardSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroText: {
      flex: 1,
      gap: 2,
    },
    heroTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    heroSub: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    card: {
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 2,
      borderRadius: PLUGIN_INNER_RADIUS,
      gap: 10,
    },
    cardLast: {
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    rowHint: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    sectionLabel: {
      color: theme.spaceLabel,
      fontSize: 10,
      letterSpacing: 1.1,
      fontFamily: theme.fontFamily,
      fontWeight: '700',
    },
    sectionHint: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 6,
    },
    chip: {
      flex: 1,
      minHeight: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.pluginCardSecondary,
      paddingHorizontal: 8,
    },
    chipSelected: {
      backgroundColor: theme.chipSelectedBackground,
    },
    chipText: {
      color: theme.label,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    chipTextSelected: {
      color: theme.chipSelectedText,
    },
    toggleTrack: {
      width: 44,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.modifierKeyPressed,
      padding: 2,
      justifyContent: 'center',
    },
    toggleTrackOn: {
      backgroundColor: TOGGLE_ON_COLOR,
    },
    toggleThumb: {
      width: 22,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.label,
      transform: [{translateX: 0}],
    },
    toggleThumbOn: {
      transform: [{translateX: 18}],
    },
  });
}
