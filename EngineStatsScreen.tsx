import React, {useEffect, useMemo, useState} from 'react';
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

import ArrowForwardIcon from './assets/arrow_forward_ios.svg';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
import {ensurePersonalTypingLoaded} from './src/keyboard/personalTyping/personalTypingEngine';
import {getLearnedCounts} from './src/keyboard/suggestions/learnedDictionary';
import {getLearnedPhraseCounts} from './src/keyboard/autocorrect/learnedPhrases';
import {
  getActiveLanguage,
  isSymSpellLookupReady,
} from './src/keyboard/autocorrect/dictionaryManager';
import {isEnglishPrefixIndexReady} from './src/keyboard/autocorrect/englishPrefixIndex';
import {getEnglishWordsByFrequency} from './src/keyboard/autocorrect/englishFrequencyDictionary';
import {
  getGemmaRuntimeStats,
  isGemmaModelDownloaded,
  isGemmaModelLoaded,
} from './src/keyboard/ai/gemmaBridge';
import {loadMetricsSnapshot} from './src/keyboard/metrics/metricsStore';
import {getAiAutocorrectTelemetry} from './src/keyboard/autocorrect/aiAutocorrectTelemetry';
import {
  getTouchIntelligenceTelemetrySummary,
  subscribeTouchIntelligenceTelemetry,
} from './src/keyboard/gesture/touchIntelligenceTelemetry';
import {TouchIntelligenceHitsScreen} from './TouchIntelligenceHitsScreen';
import {TapMapScreen} from './TapMapScreen';
import {getTapMapSnapshot, hydrateTapMapFromStorage} from './src/keyboard/gesture/tapMap';

const DEFAULT_SNAPSHOT = {
  autocorrectLang: 'en',
  symSpellReady: false,
  symSpellWords: 0,
  prefixIndexReady: false,
  learnedWords: 0,
  learnedPhrases: 0,
  aiProvider: 'on_device',
  gemmaDownloaded: false,
  gemmaLoaded: false,
  gemmaP50Ms: null as number | null,
  voiceStt: 'android',
  fastPath: false,
  swipeTyping: true,
  sessionCorrections: 0,
  typing: {
    characters: 0,
    words: 0,
    charsSaved: 0,
  },
  aiPreflight: {
    requests: 0,
    accepted: 0,
    p50Ms: null as number | null,
  },
};

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

function StatTile({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
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
      <Text style={styles.sectionRowValue} numberOfLines={2}>{value}</Text>
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

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(value);
}

function formatMs(value: number | null): string {
  if (value == null) {
    return '—';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${Math.round(value)} ms`;
}

function voiceSttLabel(
  voiceStt: string,
): string {
  if (voiceStt === 'parakeet') {
    return 'Parakeet';
  }
  if (voiceStt === 'speechmatics') {
    return 'Speechmatics';
  }
  return 'Android';
}

function gemmaStatusLabel(downloaded: boolean, loaded: boolean): string {
  if (!downloaded) {
    return 'Not on device';
  }
  return loaded ? 'Ready in memory' : 'On device, unloaded';
}

export function EngineStatsScreen({onBack}: {onBack: () => void}) {
  const [snap, setSnap] = useState(DEFAULT_SNAPSHOT);
  const [showTouchHits, setShowTouchHits] = useState(false);
  const [showTapMap, setShowTapMap] = useState(false);
  const [tapMapSummary, setTapMapSummary] = useState(() => getTapMapSnapshot());
  const [touchSummary, setTouchSummary] = useState(() =>
    getTouchIntelligenceTelemetrySummary(),
  );

  const headerLine = useMemo(() => {
    const parts = [snap.autocorrectLang.toUpperCase()];
    if (snap.symSpellWords > 0) {
      parts.push(`${formatCount(snap.symSpellWords)} word index`);
    }
    parts.push(snap.symSpellReady ? 'SymSpell on' : 'SymSpell off');
    return parts.join(' · ');
  }, [snap.autocorrectLang, snap.symSpellReady, snap.symSpellWords]);

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
      const englishWordCount = getEnglishWordsByFrequency().length;
      const gemmaState = await Promise.all([
        isGemmaModelDownloaded().catch(() => false),
        isGemmaModelLoaded().catch(() => false),
      ]);
      const [autocorrectRaw, gestureRaw, aiProvider, voiceStt, metrics] =
        await Promise.all([
          keyboardBridge.getAutocorrectSettings().catch(() => '{}'),
          keyboardBridge.getGestureSettings().catch(() => '{}'),
          keyboardBridge.getAiProvider().catch(() => 'on_device'),
          keyboardBridge.getVoiceSttProvider().catch(() => 'android'),
          loadMetricsSnapshot(),
        ]);
      await ensurePersonalTypingLoaded();

      if (cancelled) {
        return;
      }

      let autocorrect: {enabled?: boolean} = {};
      let gestures: {swipeTyping?: boolean} = {};
      try {
        autocorrect = JSON.parse(autocorrectRaw) as typeof autocorrect;
      } catch {
        // Keep defaults when storage contains an older or invalid value.
      }
      try {
        gestures = JSON.parse(gestureRaw) as typeof gestures;
      } catch {
        // Keep defaults when storage contains an older or invalid value.
      }

      const learnedWords = getLearnedCounts().size;
      const learnedPhrases = getLearnedPhraseCounts().size;
      const aiTelemetry = getAiAutocorrectTelemetry();
      const gemmaStats = getGemmaRuntimeStats();

      setSnap(current => ({
        ...current,
        learnedWords,
        learnedPhrases,
        autocorrectLang: language,
        symSpellReady: isSymSpellLookupReady(),
        symSpellWords: language === 'en' ? englishWordCount : 0,
        prefixIndexReady:
          language === 'en' ? isEnglishPrefixIndexReady() : false,
        gemmaDownloaded: gemmaState[0],
        gemmaLoaded: gemmaState[1],
        gemmaP50Ms: gemmaStats.p50InferenceMs,
        aiProvider: aiProvider === 'on_device' ? 'on_device' : 'cloud',
        voiceStt:
          voiceStt === 'android'
            ? 'android'
            : voiceStt === 'parakeet'
              ? 'parakeet'
              : 'speechmatics',
        fastPath: (() => {
          try {
            return keyboardBridge.isNativeTypingCommitActive();
          } catch {
            return false;
          }
        })(),
        swipeTyping: gestures.swipeTyping ?? current.swipeTyping,
        sessionCorrections:
          autocorrect.enabled === false ? 0 : metrics.today.corrections,
        typing: {
          characters: metrics.today.characters,
          words: metrics.today.words,
          charsSaved: metrics.today.charsSaved,
        },
        aiPreflight: {
          requests: aiTelemetry.preflightRequests,
          accepted: aiTelemetry.preflightAccepted,
          p50Ms: aiTelemetry.p50PreflightMs,
        },
      }));
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

  const preflightLabel =
    snap.aiPreflight.requests > 0
      ? `${snap.aiPreflight.accepted} of ${snap.aiPreflight.requests}`
      : 'No requests yet';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Engine</Text>
          <Text style={styles.pageSummary}>{headerLine}</Text>
        </View>

        <View style={styles.statGrid}>
          <StatTile
            label="Corrections"
            value={String(snap.sessionCorrections)}
            hint="today"
          />
          <StatTile
            label="Words typed"
            value={String(snap.typing.words)}
            hint="today"
          />
          <StatTile
            label="Learned"
            value={String(snap.learnedWords)}
            hint={`${snap.learnedPhrases} phrases`}
          />
          <StatTile
            label="Chars saved"
            value={String(snap.typing.charsSaved)}
            hint={`${snap.typing.characters} typed`}
          />
        </View>

        <SectionCard title="AI">
          <SectionRow
            label="Provider"
            value={snap.aiProvider === 'on_device' ? 'On-device' : 'Cloud'}
          />
          <SectionRow
            label="Gemma"
            value={gemmaStatusLabel(snap.gemmaDownloaded, snap.gemmaLoaded)}
          />
          <SectionRow label="Preflight" value={preflightLabel} />
          <SectionRow
            label="Latency"
            value={`AI ${formatMs(snap.aiPreflight.p50Ms)} · Gemma ${formatMs(snap.gemmaP50Ms)}`}
          />
        </SectionCard>

        <SectionCard title="Dictionary">
          <SectionRow
            label="Prefix index"
            value={snap.prefixIndexReady ? 'Ready' : 'Building'}
          />
          <SectionRow
            label="Personal entries"
            value={`${snap.learnedWords} words · ${snap.learnedPhrases} phrases`}
          />
        </SectionCard>

        <SectionCard title="Input">
          <SectionRow
            label="Native fast path"
            value={snap.fastPath ? 'On' : 'Off'}
          />
          <SectionRow
            label="Swipe typing"
            value={snap.swipeTyping ? 'On' : 'Off'}
          />
          <SectionRow label="Voice input" value={voiceSttLabel(snap.voiceStt)} />
        </SectionCard>

        <SectionCard title="Touch">
          <NavRow
            title="Tap map"
            hint={
              tapMapSummary.totalSamples > 0
                ? `${tapMapSummary.totalSamples} taps learned`
                : 'Per-key touch offsets'
            }
            onPress={() => setShowTapMap(true)}
          />
          <NavRow
            title="Touch hits"
            hint={
              touchSummary.totalHits > 0
                ? `${touchSummary.totalHits} corrections logged`
                : 'Key correction history'
            }
            onPress={() => setShowTouchHits(true)}
          />
        </SectionCard>

        <Text style={styles.footerNote}>
          Values reflect this device only.
        </Text>
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
    fontFamily: 'FragmentMono',
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
    fontFamily: 'FragmentMono',
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
    fontFamily: 'FragmentMono',
    letterSpacing: 0.4,
    marginBottom: 4,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  sectionRowValue: {
    fontSize: 14,
    color: C.sub,
    fontFamily: 'FragmentMono',
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  navHint: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
    paddingTop: 2,
  },
});
