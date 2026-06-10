import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  PLUGIN_CARD_COLOR,
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  pluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {getLearnedCounts} from '../suggestions/learnedDictionary';
import {keyboardTheme} from '../theme';
import {AUTOCORRECT_REMEMBERS, type AutocorrectSettings} from './types';
import {getLearnedPhraseCounts} from './learnedPhrases';

type AutocorrectPanelProps = {
  settings: AutocorrectSettings;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAutoApply: (autoApplyOnSpace: boolean) => void;
};

type FeatureToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

function FeatureToggle({enabled, onToggle}: FeatureToggleProps) {
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
  style,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
  style?: object;
}) {
  return (
    <View style={[styles.settingRow, style]}>
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
}: AutocorrectPanelProps) {
  const learnedWordCount = getLearnedCounts().size;
  const learnedPhraseCount = getLearnedPhraseCounts().size;

  return (
    <View style={pluginPanelStyles.container}>
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

        <View style={[styles.card, styles.cardBottom]}>
          <Text style={styles.sectionTitle}>What it remembers</Text>
          {AUTOCORRECT_REMEMBERS.map(item => (
            <Text key={item} style={styles.bullet}>
              {'• '}
              {item}
            </Text>
          ))}
          <View style={styles.statsDivider} />
          <Text style={styles.statsText}>
            {learnedWordCount} words · {learnedPhraseCount} phrases learned
          </Text>
        </View>
      </PluginScrollView>
    </View>
  );
}

const TOGGLE_ON_COLOR = '#2CC642';

const styles = StyleSheet.create({
  card: {
    backgroundColor: PLUGIN_CARD_COLOR,
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
  cardBottom: {
    borderTopLeftRadius: PLUGIN_INNER_RADIUS,
    borderTopRightRadius: PLUGIN_INNER_RADIUS,
    borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
    borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
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
    color: keyboardTheme.label,
    fontSize: 15,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  settingHint: {
    color: keyboardTheme.spaceLabel,
    fontSize: 12,
    fontFamily: keyboardTheme.fontFamily,
    lineHeight: 16,
  },
  sectionTitle: {
    color: keyboardTheme.label,
    fontSize: 14,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  bullet: {
    color: keyboardTheme.spaceLabel,
    fontSize: 13,
    fontFamily: keyboardTheme.fontFamily,
    lineHeight: 18,
    paddingLeft: 2,
  },
  statsDivider: {
    height: 1,
    backgroundColor: keyboardTheme.keyPressed,
    marginTop: 4,
  },
  statsText: {
    color: keyboardTheme.spaceLabel,
    fontSize: 12,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 44,
    height: 20,
    borderRadius: 10,
    backgroundColor: keyboardTheme.keyPressed,
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
    backgroundColor: keyboardTheme.label,
    transform: [{translateX: 0}],
  },
  toggleThumbOn: {
    transform: [{translateX: 18}],
  },
});
