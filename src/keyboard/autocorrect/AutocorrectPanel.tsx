import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import ResetIcon from '../../../assets/reset.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import {
  loadLearnedAutocorrectCounts,
  resetLearnedAutocorrectData,
} from './learnedDataReset';
import type {KeyboardTheme} from '../theme';
import {AUTOCORRECT_REMEMBERS, type AutocorrectSettings} from './types';

type AutocorrectPanelProps = {
  settings: AutocorrectSettings;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAutoApply: (autoApplyOnSpace: boolean) => void;
  onToggleAiAutoCorrect: (enabled: boolean) => void;
  onLearnedDataReset?: () => void;
};

const TOGGLE_ON_COLOR = '#2CC642';
const RESET_COLOR = '#E5484D';

function formatLearnedSummary(wordCount: number, phraseCount: number): string {
  const wordLabel = wordCount === 1 ? 'word' : 'words';
  const phraseLabel = phraseCount === 1 ? 'phrase' : 'phrases';
  return `${wordCount} ${wordLabel} · ${phraseCount} ${phraseLabel}`;
}

type FeatureToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

function FeatureToggle({enabled, onToggle}: FeatureToggleProps) {
  const styles = useThemedStyles(createAutocorrectStyles);

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

function SettingRow({
  title,
  hint,
  enabled,
  onToggle,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(createAutocorrectStyles);

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingHint}>{hint}</Text>
      </View>
      <FeatureToggle enabled={enabled} onToggle={onToggle} />
    </View>
  );
}

export function AutocorrectPanel({
  settings,
  onToggleEnabled,
  onToggleAutoApply,
  onToggleAiAutoCorrect,
  onLearnedDataReset,
}: AutocorrectPanelProps) {
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createAutocorrectStyles);
  const [wordCount, setWordCount] = useState(0);
  const [phraseCount, setPhraseCount] = useState(0);
  const [countsReady, setCountsReady] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    const counts = await loadLearnedAutocorrectCounts();
    setWordCount(counts.wordCount);
    setPhraseCount(counts.phraseCount);
    setCountsReady(true);
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const hasLearnedData = wordCount > 0 || phraseCount > 0;

  const handleReset = () => {
    if (resetting || !hasLearnedData) {
      return;
    }

    triggerKeyHaptic();
    void (async () => {
      setResetting(true);
      setResetError(null);
      try {
        await resetLearnedAutocorrectData();
        const counts = await loadLearnedAutocorrectCounts();
        setWordCount(counts.wordCount);
        setPhraseCount(counts.phraseCount);
        onLearnedDataReset?.();
      } catch {
        setResetError('Reset failed. Rebuild the app and try again.');
        await loadCounts();
      } finally {
        setResetting(false);
      }
    })();
  };

  return (
    <View style={panelStyles.container}>
      <PluginScrollView>
        <View style={[styles.card, styles.cardTop]}>
          <SettingRow
            title="Suggestions"
            hint="Show typo fixes in the bar while you type."
            enabled={settings.enabled}
            onToggle={() => onToggleEnabled(!settings.enabled)}
          />
        </View>

        <View style={[styles.card, styles.cardMiddle]}>
          <SettingRow
            title="Auto-fix on space"
            hint="Replace typos when you press space. Off keeps your exact word."
            enabled={settings.autoApplyOnSpace}
            onToggle={() => onToggleAutoApply(!settings.autoApplyOnSpace)}
          />
        </View>

        <View style={[styles.card, styles.cardMiddle]}>
          <SettingRow
            title="AI auto correct"
            hint="Proofread recent typing after pauses. Bigger fixes show as a chip."
            enabled={settings.aiAutoCorrectEnabled}
            onToggle={() =>
              onToggleAiAutoCorrect(!settings.aiAutoCorrectEnabled)
            }
          />
        </View>

        <View style={[styles.card, styles.infoCard]}>
          <Text style={styles.sectionTitle}>What it remembers</Text>
          {AUTOCORRECT_REMEMBERS.map(item => (
            <Text key={item} style={styles.bullet}>
              {'• '}
              {item}
            </Text>
          ))}
        </View>

        <View style={[styles.card, styles.statsCard]}>
          <View style={styles.statsRow}>
            <View style={styles.statsText}>
              <Text style={styles.sectionTitle}>Saved on this device</Text>
              <Text style={styles.statsLine}>
                {countsReady
                  ? formatLearnedSummary(wordCount, phraseCount)
                  : 'Loading…'}
              </Text>
            </View>
            <Pressable
              onPress={handleReset}
              disabled={resetting || !countsReady || !hasLearnedData}
              hitSlop={8}
              style={[
                styles.resetIconButton,
                (resetting || !hasLearnedData) && styles.resetIconButtonDisabled,
              ]}>
              <ResetIcon width={22} height={22} />
            </Pressable>
          </View>
          {resetError ? (
            <Text style={styles.resetError}>{resetError}</Text>
          ) : null}
        </View>
      </PluginScrollView>
    </View>
  );
}

function createAutocorrectStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    cardTop: {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
    },
    cardMiddle: {
      borderRadius: PLUGIN_INNER_RADIUS,
    },
    infoCard: {
      borderRadius: PLUGIN_INNER_RADIUS,
      gap: 6,
    },
    statsCard: {
      borderTopLeftRadius: PLUGIN_INNER_RADIUS,
      borderTopRightRadius: PLUGIN_INNER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
      marginTop: 2,
      gap: 6,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statsText: {
      flex: 1,
      gap: 2,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    settingText: {
      flex: 1,
      gap: 2,
    },
    settingTitle: {
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    settingHint: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    sectionTitle: {
      color: theme.label,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    bullet: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      lineHeight: 18,
      paddingLeft: 2,
    },
    statsLine: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
    },
    resetIconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetIconButtonDisabled: {
      opacity: 0.35,
    },
    resetError: {
      color: RESET_COLOR,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    toggleTrack: {
      width: 44,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.modifierKey,
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
