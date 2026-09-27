import React, {useEffect, useState} from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import ArrowForwardIcon from './assets/onboarding/arrow-forward.svg';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
import {ensurePersonalTypingLoaded} from './src/keyboard/personalTyping/personalTypingEngine';
import {getLearnedCounts} from './src/keyboard/suggestions/learnedDictionary';
import {getLearnedPhraseCounts} from './src/keyboard/autocorrect/learnedPhrases';
import {getActiveLanguage} from './src/keyboard/autocorrect/dictionaryManager';
import {isGemmaModelDownloaded} from './src/keyboard/ai/gemmaBridge';
import {loadMetricsSnapshot} from './src/keyboard/metrics/metricsStore';
import {
  getTouchIntelligenceTelemetrySummary,
  subscribeTouchIntelligenceTelemetry,
} from './src/keyboard/gesture/touchIntelligenceTelemetry';
import {TouchIntelligenceHitsScreen} from './TouchIntelligenceHitsScreen';
import {TapMapScreen} from './TapMapScreen';
import {getTapMapSnapshot, hydrateTapMapFromStorage} from './src/keyboard/gesture/tapMap';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  muted: '#b0b0b5',
} as const;

const CARD_R = 14;
const TEXT_KERNING = -0.7;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  ar: 'Arabic',
};

function StatTile({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SectionRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionRowLabel}>{label}</Text>
      <Text style={styles.sectionRowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function NavRow({
  title,
  hint,
  onPress,
}: {
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <View style={styles.navTextBlock}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navHint}>{hint}</Text>
      </View>
      <ArrowForwardIcon width={14} height={14} color={C.muted} />
    </Pressable>
  );
}

function voiceLabel(voiceStt: string): string {
  if (voiceStt === 'parakeet') {
    return 'On your phone';
  }
  if (voiceStt === 'speechmatics') {
    return 'Online (Speechmatics)';
  }
  return 'Android voice typing';
}

function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

export function EngineStatsScreen({onBack}: {onBack: () => void}) {
  const [showTouchHits, setShowTouchHits] = useState(false);
  const [showTapMap, setShowTapMap] = useState(false);
  const [tapMapSummary, setTapMapSummary] = useState(() => getTapMapSnapshot());
  const [touchSummary, setTouchSummary] = useState(() =>
    getTouchIntelligenceTelemetrySummary(),
  );
  const [stats, setStats] = useState({
    lang: 'en',
    corrections: 0,
    words: 0,
    characters: 0,
    charsSaved: 0,
    learnedWords: 0,
    learnedPhrases: 0,
    aiOnDevice: true,
    aiModelReady: false,
    swipeTyping: true,
    voiceStt: 'android',
  });

  useEffect(() => {
    const refreshTouchSummary = () => {
      setTouchSummary(getTouchIntelligenceTelemetrySummary());
    };
    refreshTouchSummary();
    return subscribeTouchIntelligenceTelemetry(refreshTouchSummary);
  }, []);

  useEffect(() => {
    void hydrateTapMapFromStorage().then(() => {
      setTapMapSummary(getTapMapSnapshot());
    });
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      const language = getActiveLanguage();
      const [gestureRaw, aiProvider, voiceStt, metrics, gemmaDownloaded] =
        await Promise.all([
          keyboardBridge.getGestureSettings().catch(() => '{}'),
          keyboardBridge.getAiProvider().catch(() => 'on_device'),
          keyboardBridge.getVoiceSttProvider().catch(() => 'android'),
          loadMetricsSnapshot(),
          isGemmaModelDownloaded().catch(() => false),
        ]);
      await ensurePersonalTypingLoaded();

      if (cancelled) {
        return;
      }

      let gestures: {swipeTyping?: boolean} = {};
      let autocorrect: {enabled?: boolean} = {};
      try {
        gestures = JSON.parse(gestureRaw) as typeof gestures;
      } catch {
        // ignore
      }
      try {
        const raw = await keyboardBridge.getAutocorrectSettings().catch(() => '{}');
        autocorrect = JSON.parse(raw) as typeof autocorrect;
      } catch {
        // ignore
      }

      setStats({
        lang: language,
        corrections: autocorrect.enabled === false ? 0 : metrics.today.corrections,
        words: metrics.today.words,
        characters: metrics.today.characters,
        charsSaved: metrics.today.charsSaved,
        learnedWords: getLearnedCounts().size,
        learnedPhrases: getLearnedPhraseCounts().size,
        aiOnDevice: aiProvider !== 'gemini',
        aiModelReady: gemmaDownloaded,
        swipeTyping: gestures.swipeTyping ?? true,
        voiceStt:
          voiceStt === 'android'
            ? 'android'
            : voiceStt === 'parakeet'
              ? 'parakeet'
              : 'speechmatics',
      });
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (showTapMap) {
    return <TapMapScreen onBack={() => setShowTapMap(false)} />;
  }

  if (showTouchHits) {
    return <TouchIntelligenceHitsScreen onBack={() => setShowTouchHits(false)} />;
  }

  const phraseHint =
    stats.learnedPhrases === 1
      ? 'plus 1 phrase'
      : stats.learnedPhrases > 0
        ? `plus ${stats.learnedPhrases} phrases`
        : 'from how you type';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Typing</Text>
          <Text style={styles.pageSummary}>
            {languageLabel(stats.lang)} keyboard · today on this phone
          </Text>
        </View>

        <View style={styles.statGrid}>
          <StatTile
            label="Autocorrects"
            value={String(stats.corrections)}
            hint="applied today"
          />
          <StatTile label="Words" value={String(stats.words)} hint="typed today" />
          <StatTile
            label="Your words"
            value={String(stats.learnedWords)}
            hint={phraseHint}
          />
          <StatTile
            label="Keystrokes saved"
            value={String(stats.charsSaved)}
            hint={
              stats.characters > 0 ? `${stats.characters} typed today` : 'from suggestions'
            }
          />
        </View>

        <SectionCard title="Your setup">
          <SectionRow
            label="Writing help"
            value={stats.aiOnDevice ? 'On your phone' : 'Uses the cloud'}
          />
          {stats.aiOnDevice ? (
            <SectionRow
              label="On-device model"
              value={stats.aiModelReady ? 'Downloaded' : 'Not downloaded yet'}
            />
          ) : null}
          <SectionRow
            label="Glide typing"
            value={stats.swipeTyping ? 'On' : 'Off'}
          />
          <SectionRow label="Voice typing" value={voiceLabel(stats.voiceStt)} />
        </SectionCard>

        <SectionCard title="Touch tuning">
          <NavRow
            title="Tap map"
            hint={
              tapMapSummary.totalSamples > 0
                ? `${tapMapSummary.totalSamples} taps remembered`
                : 'Where you usually hit each key'
            }
            onPress={() => setShowTapMap(true)}
          />
          <NavRow
            title="Tap fixes"
            hint={
              touchSummary.totalHits > 0
                ? `${touchSummary.totalHits} times we nudged a key`
                : 'When we moved a tap to the right key'
            }
            onPress={() => setShowTouchHits(true)}
          />
        </SectionCard>

        <Text style={styles.footerNote}>These numbers stay on this device.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 110,
    gap: 12,
  },
  header: {
    gap: 6,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 32,
    color: C.text,
    letterSpacing: -1.5,
    fontFamily: 'FragmentMono',
  },
  pageSummary: {
    fontSize: 13,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    fontFamily: 'Inter',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statTile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
    minWidth: 140,
  },
  statLabel: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'Inter',
    letterSpacing: TEXT_KERNING,
  },
  statValue: {
    fontSize: 26,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: -1,
    marginTop: 2,
  },
  statHint: {
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
    marginTop: 2,
    fontFamily: 'Inter',
  },
  sectionCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'Inter',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    fontFamily: 'Inter',
    letterSpacing: TEXT_KERNING,
  },
  sectionRowValue: {
    fontSize: 14,
    color: C.sub,
    fontFamily: 'Inter',
    letterSpacing: TEXT_KERNING,
    textAlign: 'right',
    maxWidth: '58%',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingVertical: 8,
  },
  navTextBlock: {
    flex: 1,
    gap: 2,
  },
  navTitle: {
    fontSize: 15,
    color: C.text,
    fontFamily: 'Inter',
    letterSpacing: TEXT_KERNING,
  },
  navHint: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'Inter',
    letterSpacing: TEXT_KERNING,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
    fontFamily: 'Inter',
    paddingTop: 2,
  },
});
