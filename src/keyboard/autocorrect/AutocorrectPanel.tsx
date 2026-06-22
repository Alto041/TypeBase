import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import ArrowIcon from '../../../assets/plugins/arrow.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import {ensureLearnedDictionaryLoaded, getLearnedCounts} from '../suggestions/learnedDictionary';
import type {KeyboardTheme} from '../theme';
import {AUTOCORRECT_REMEMBERS, type AutocorrectSettings} from './types';
import {ensureLearnedPhrasesLoaded, getLearnedPhraseCounts} from './learnedPhrases';

type AutocorrectPanelProps = {
  settings: AutocorrectSettings;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAutoApply: (autoApplyOnSpace: boolean) => void;
};

type PanelPage = 'settings' | 'words' | 'phrases';

const TOGGLE_ON_COLOR = '#2CC642';

function getTileStyle(index: number, total: number): ViewStyle {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (total === 1) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  if (isFirst) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
    };
  }

  if (isLast) {
    return {
      borderTopLeftRadius: PLUGIN_INNER_RADIUS,
      borderTopRightRadius: PLUGIN_INNER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  return {
    borderTopLeftRadius: PLUGIN_INNER_RADIUS,
    borderTopRightRadius: PLUGIN_INNER_RADIUS,
    borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
    borderBottomRightRadius: PLUGIN_INNER_RADIUS,
  };
}

function sortLearnedEntries(
  entries: ReadonlyMap<string, number>,
): Array<{text: string; uses: number}> {
  return [...entries.entries()]
    .map(([text, uses]) => ({text, uses}))
    .sort(
      (left, right) =>
        right.uses - left.uses || left.text.localeCompare(right.text),
    );
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

function NavRow({
  title,
  subtitle,
  onPress,
  style,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createAutocorrectStyles);

  return (
    <Pressable
      onPress={() => {
        triggerKeyHaptic();
        onPress();
      }}
      style={[styles.navRow, style]}>
      <View style={styles.navText}>
        <Text style={styles.navTitle}>{title}</Text>
        {subtitle ? <Text style={styles.navSubtitle}>{subtitle}</Text> : null}
      </View>
      <ArrowIcon width={9} height={16} color={theme.iconMuted} />
    </Pressable>
  );
}

function PanelBackRow({label, onPress}: {label: string; onPress: () => void}) {
  const styles = useThemedStyles(createAutocorrectStyles);

  return (
    <Pressable
      onPress={() => {
        triggerKeyHaptic();
        onPress();
      }}
      style={styles.backRow}>
      <Text style={styles.backLabel}>{label}</Text>
    </Pressable>
  );
}

function LearnedDataRow({
  text,
  uses,
  style,
}: {
  text: string;
  uses: number;
  style?: ViewStyle;
}) {
  const styles = useThemedStyles(createAutocorrectStyles);

  return (
    <View style={[styles.dataRow, style]}>
      <Text style={styles.dataRowText} numberOfLines={2}>
        {text}
      </Text>
      <Text style={styles.useCount}>×{uses}</Text>
    </View>
  );
}

function LearnedDataListPage({
  kind,
  onBack,
}: {
  kind: 'words' | 'phrases';
  onBack: () => void;
}) {
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createAutocorrectStyles);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load =
      kind === 'words'
        ? ensureLearnedDictionaryLoaded()
        : ensureLearnedPhrasesLoaded();
    void load.then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const entries = useMemo(() => {
    if (!ready) {
      return [];
    }
    const source =
      kind === 'words' ? getLearnedCounts() : getLearnedPhraseCounts();
    return sortLearnedEntries(source);
  }, [kind, ready]);

  const emptyHint =
    kind === 'words'
      ? 'Words you type often are saved here for suggestions and swipe typing.'
      : 'Short phrases you type often are saved here for phrase suggestions.';

  return (
    <View style={panelStyles.container}>
      <PanelBackRow label="← Autocorrect" onPress={onBack} />
      <PluginScrollView>
        {!ready ? (
          <View style={[styles.card, styles.cardSingle]}>
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={[styles.card, styles.cardSingle, panelStyles.emptyState]}>
            <Text style={panelStyles.emptyTitle}>Nothing saved yet</Text>
            <Text style={panelStyles.emptyHint}>{emptyHint}</Text>
          </View>
        ) : (
          entries.map((entry, index) => (
            <LearnedDataRow
              key={entry.text}
              text={entry.text}
              uses={entry.uses}
              style={getTileStyle(index, entries.length)}
            />
          ))
        )}
      </PluginScrollView>
    </View>
  );
}

export function AutocorrectPanel({
  settings,
  onToggleEnabled,
  onToggleAutoApply,
}: AutocorrectPanelProps) {
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createAutocorrectStyles);
  const [page, setPage] = useState<PanelPage>('settings');

  if (page === 'words' || page === 'phrases') {
    return (
      <LearnedDataListPage
        kind={page}
        onBack={() => setPage('settings')}
      />
    );
  }

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

        <View style={[styles.card, styles.infoCard]}>
          <Text style={styles.sectionTitle}>What it remembers</Text>
          {AUTOCORRECT_REMEMBERS.map(item => (
            <Text key={item} style={styles.bullet}>
              {'• '}
              {item}
            </Text>
          ))}
        </View>

        <NavRow
          title="Learned words"
          subtitle="Browse saved words"
          onPress={() => setPage('words')}
          style={styles.navRowTop}
        />
        <NavRow
          title="Learned phrases"
          subtitle="Browse saved phrases"
          onPress={() => setPage('phrases')}
          style={styles.navRowBottom}
        />
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
    cardSingle: {
      borderRadius: PLUGIN_OUTER_RADIUS,
    },
    infoCard: {
      borderRadius: PLUGIN_INNER_RADIUS,
      gap: 6,
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
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      minHeight: 44,
    },
    navRowTop: {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
      marginTop: 2,
    },
    navRowBottom: {
      borderTopLeftRadius: PLUGIN_INNER_RADIUS,
      borderTopRightRadius: PLUGIN_INNER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    },
    navText: {
      flex: 1,
      gap: 2,
    },
    navTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    navSubtitle: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
    },
    backRow: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 4,
    },
    backLabel: {
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    dataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      minHeight: 44,
    },
    dataRowText: {
      flex: 1,
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
    },
    useCount: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    loadingText: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      textAlign: 'center',
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
