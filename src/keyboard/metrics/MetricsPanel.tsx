import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import ResetIcon from '../../../assets/reset.svg';
import StatsIcon from '../../../assets/stats.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {
  formatActiveDuration,
  formatCompactNumber,
  loadMetricsSnapshot,
  resetMetricsData,
} from './metricsStore';
import type {MetricsSnapshot} from './types';

const RESET_COLOR = '#E5484D';
const PIXEL_FONT = 'Pixel' as const;

type StatCellProps = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
};

function StatCell({label, value, unit, hint}: StatCellProps) {
  const styles = useThemedStyles(createMetricsStyles);
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function emptySnapshot(): MetricsSnapshot {
  return {
    today: {
      date: '',
      keystrokes: 0,
      characters: 0,
      words: 0,
      corrections: 0,
      charsSaved: 0,
      backspaces: 0,
      activeMs: 0,
      sessions: 0,
    },
    lifetime: {
      keystrokes: 0,
      characters: 0,
      words: 0,
      corrections: 0,
      charsSaved: 0,
      backspaces: 0,
      activeMs: 0,
      sessions: 0,
    },
    wpmToday: 0,
    wpmLifetime: 0,
    accuracyToday: 100,
    accuracyLifetime: 100,
    avgSessionMinToday: 0,
  };
}

export function MetricsPanel() {
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createMetricsStyles);
  const [snap, setSnap] = useState<MetricsSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reload = useCallback(async () => {
    const next = await loadMetricsSnapshot();
    setSnap(next);
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleReset = () => {
    if (resetting) {
      return;
    }
    triggerKeyHaptic();
    void (async () => {
      setResetting(true);
      try {
        await resetMetricsData();
        await reload();
      } finally {
        setResetting(false);
      }
    })();
  };

  const today = snap.today;

  return (
    <View style={panelStyles.container}>
      <PluginScrollView fadeScrollInset>
        <View style={styles.stack}>
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <StatsIcon width={18} height={18} color={theme.icon} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>TELEMETRY</Text>
              <Text style={styles.heroSub}>Quivox · keyboard ops</Text>
            </View>
            <Text style={styles.heroLive}>{ready ? 'LIVE' : '…'}</Text>
          </View>

          <View style={styles.grid}>
            <StatCell
              label="WPM"
              value={String(snap.wpmToday)}
              hint={snap.wpmLifetime > 0 ? `lifetime ${snap.wpmLifetime}` : 'words / min'}
            />
            <StatCell
              label="ACCURACY"
              value={String(snap.accuracyToday)}
              unit="%"
              hint="vs autocorrect"
            />
          </View>

          <View style={styles.grid}>
            <StatCell
              label="CORRECTIONS"
              value={formatCompactNumber(today.corrections)}
              hint="auto-applied today"
            />
            <StatCell
              label="CHARS SAVED"
              value={formatCompactNumber(today.charsSaved)}
              hint="edit distance fixed"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TODAY · ACTIVE</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Keyboard used</Text>
              <Text style={styles.rowValue}>
                {formatActiveDuration(today.activeMs)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Sessions</Text>
              <Text style={styles.rowValue}>{today.sessions}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Avg session</Text>
              <Text style={styles.rowValue}>
                {snap.avgSessionMinToday > 0
                  ? `${snap.avgSessionMinToday} min`
                  : '—'}
              </Text>
            </View>
          </View>

          <View style={[styles.section, styles.sectionLast]}>
            <Text style={styles.sectionTitle}>THROUGHPUT</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Keystrokes</Text>
              <Text style={styles.rowValue}>
                {formatCompactNumber(today.keystrokes)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Characters</Text>
              <Text style={styles.rowValue}>
                {formatCompactNumber(today.characters)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Words</Text>
              <Text style={styles.rowValue}>
                {formatCompactNumber(today.words)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Backspaces</Text>
              <Text style={styles.rowValue}>
                {formatCompactNumber(today.backspaces)}
              </Text>
            </View>
          </View>

          <View style={styles.lifetimeBar}>
            <Text style={styles.lifetimeLabel}>LIFETIME</Text>
            <Text style={styles.lifetimeValue}>
              {formatCompactNumber(snap.lifetime.characters)} ch ·{' '}
              {formatCompactNumber(snap.lifetime.corrections)} fix ·{' '}
              {formatActiveDuration(snap.lifetime.activeMs)}
            </Text>
          </View>

          <Pressable
            onPress={handleReset}
            disabled={resetting}
            style={({pressed}) => [
              styles.resetBtn,
              pressed && styles.resetBtnPressed,
            ]}>
            <ResetIcon width={14} height={14} color={RESET_COLOR} />
            <Text style={styles.resetText}>
              {resetting ? 'Clearing…' : 'Reset telemetry'}
            </Text>
          </Pressable>
        </View>
      </PluginScrollView>
    </View>
  );
}

function createMetricsStyles(theme: KeyboardTheme) {
  const cardRadius = {
    borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
    borderTopRightRadius: PLUGIN_OUTER_RADIUS,
    borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
    borderBottomRightRadius: PLUGIN_INNER_RADIUS,
  };

  return StyleSheet.create({
    // Same gutter for stacked rows and side-by-side cells.
    stack: {
      gap: 2,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      ...cardRadius,
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
      gap: 1,
    },
    heroTitle: {
      color: theme.label,
      fontSize: 13,
      letterSpacing: 1.2,
      fontFamily: theme.fontFamily,
      fontWeight: '700',
    },
    heroSub: {
      color: theme.spaceLabel,
      fontSize: 11,
      fontFamily: theme.fontFamily,
    },
    heroLive: {
      color: theme.spaceLabel,
      fontSize: 11,
      letterSpacing: 1,
      fontFamily: PIXEL_FONT,
    },
    grid: {
      flexDirection: 'row',
      gap: 2,
    },
    statCell: {
      flex: 1,
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
      borderRadius: PLUGIN_INNER_RADIUS,
    },
    statLabel: {
      color: theme.spaceLabel,
      fontSize: 10,
      letterSpacing: 1.1,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    statValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    statValue: {
      color: theme.label,
      fontSize: 28,
      lineHeight: 32,
      fontFamily: PIXEL_FONT,
    },
    statUnit: {
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: PIXEL_FONT,
    },
    statHint: {
      color: theme.spaceLabel,
      fontSize: 11,
      fontFamily: theme.fontFamily,
    },
    section: {
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
      borderRadius: PLUGIN_INNER_RADIUS,
    },
    sectionLast: {
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    },
    sectionTitle: {
      color: theme.spaceLabel,
      fontSize: 10,
      letterSpacing: 1.2,
      fontFamily: theme.fontFamily,
      fontWeight: '700',
      marginBottom: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    rowLabel: {
      color: theme.label,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
    },
    rowValue: {
      color: theme.label,
      fontSize: 16,
      fontFamily: PIXEL_FONT,
    },
    lifetimeBar: {
      marginTop: 6,
      paddingHorizontal: 4,
      gap: 2,
    },
    lifetimeLabel: {
      color: theme.spaceLabel,
      fontSize: 10,
      letterSpacing: 1.2,
      fontFamily: theme.fontFamily,
      fontWeight: '700',
    },
    lifetimeValue: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
    },
    resetBtn: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: PLUGIN_OUTER_RADIUS,
      backgroundColor: theme.pluginCard,
    },
    resetBtnPressed: {
      backgroundColor: theme.pluginCardSecondary,
    },
    resetText: {
      color: RESET_COLOR,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
  });
}
