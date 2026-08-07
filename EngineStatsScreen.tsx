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

import StatsIcon from './assets/stats.svg';
import DeviceIcon from './assets/device.svg';
import GraphicEqIcon from './assets/graphic_eq.svg';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
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
  askGemma,
} from './src/keyboard/ai/gemmaBridge';
import {ensureGemmaModelLoaded} from './src/keyboard/ai/gemmaModelManager';
import {loadMetricsSnapshot} from './src/keyboard/metrics/metricsStore';
import {getAiAutocorrectTelemetry} from './src/keyboard/autocorrect/aiAutocorrectTelemetry';

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
  gemmaLoadMs: null as number | null,
  gemmaLastMs: null as number | null,
  gemmaP50Ms: null as number | null,
  voiceStt: 'android',
  voiceCleanup: 'on_device',
  fastPath: false,
  zeroLatency: false,
  swipeTyping: true,
  session: {
    exactFix: 0,
    symSpell: 0,
    missingSpace: 0,
    hinglish: 0,
    ai: 0,
    avgBoundaryMs: 0,
  },
  typing: {
    characters: 0,
    words: 0,
    charsSaved: 0,
  },
  aiPreflight: {
    requests: 0,
    accepted: 0,
    stale: 0,
    p50Ms: null as number | null,
  },
  dictionary: {
    bootstrapWords: 0,
    targetWords: 0,
    cachedLangs: ['en'],
    seeding: false,
  },
};

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  green: '#2CC642',
  amber: '#E5A000',
  muted: '#b0b0b5',
} as const;

const CARD_R = 14;
const HERO_R = 20;
const TEXT_KERNING = -0.7;

function StatTile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <View style={styles.statTile}>
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

function SectionRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionRowLabel}>{label}</Text>
      <Text
        style={[styles.sectionRowValue, mono && styles.sectionRowValueMono]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  return `${Math.round(value)}ms`;
}

export function EngineStatsScreen({onBack}: {onBack: () => void}) {
  const [snap, setSnap] = useState(DEFAULT_SNAPSHOT);
  const [diagnosticMessage, setDiagnosticMessage] = useState('');

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
      const [
        autocorrectRaw,
        gestureRaw,
        aiProvider,
        voiceStt,
        words,
        phrases,
        metrics,
      ] =
        await Promise.all([
          keyboardBridge.getAutocorrectSettings().catch(() => '{}'),
          keyboardBridge.getGestureSettings().catch(() => '{}'),
          keyboardBridge.getAiProvider().catch(() => 'on_device'),
          keyboardBridge.getVoiceSttProvider().catch(() => 'android'),
          keyboardBridge.getLearnedWordCounts().catch(() => ({})),
          keyboardBridge.getLearnedPhraseCounts().catch(() => ({})),
          loadMetricsSnapshot(),
        ]);

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

      const learnedWords = Object.keys(words).length;
      const learnedPhrases = Object.keys(phrases).length;
      const aiTelemetry = getAiAutocorrectTelemetry();
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
        gemmaLoadMs: getGemmaRuntimeStats().lastLoadMs,
        gemmaLastMs: getGemmaRuntimeStats().lastInferenceMs,
        gemmaP50Ms: getGemmaRuntimeStats().p50InferenceMs,
        aiProvider: aiProvider === 'on_device' ? 'on_device' : 'cloud',
        voiceStt: voiceStt === 'android' ? 'android' : 'speechmatics',
        fastPath: (() => {
          try {
            return keyboardBridge.isNativeTypingCommitActive();
          } catch {
            return false;
          }
        })(),
        swipeTyping: gestures.swipeTyping ?? current.swipeTyping,
        dictionary: {
          ...current.dictionary,
          bootstrapWords: language === 'en' ? englishWordCount : 0,
          targetWords: language === 'en' ? englishWordCount : 0,
          cachedLangs: [language],
        },
        session: {
          ...current.session,
          exactFix: autocorrect.enabled === false ? 0 : metrics.today.corrections,
          symSpell: 0,
          missingSpace: 0,
          hinglish: 0,
          ai: 0,
        },
        typing: {
          characters: metrics.today.characters,
          words: metrics.today.words,
          charsSaved: metrics.today.charsSaved,
        },
        aiPreflight: {
          requests: aiTelemetry.preflightRequests,
          accepted: aiTelemetry.preflightAccepted,
          stale: aiTelemetry.staleResults,
          p50Ms: aiTelemetry.p50PreflightMs,
        },
      }));
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const runBenchmark = () => {
    const startedAt = Date.now();
    const words = getEnglishWordsByFrequency();
    const sample = words.slice(0, 1000);
    const elapsed = Date.now() - startedAt;
    setDiagnosticMessage(
      `Checked ${sample.length.toLocaleString()} dictionary entries in ${elapsed}ms.`,
    );
  };

  const testInference = async () => {
    setDiagnosticMessage('Running a short on-device inference…');
    try {
      await ensureGemmaModelLoaded();
      await askGemma('Reply with the single word: ready');
      const runtime = getGemmaRuntimeStats();
      setSnap(current => ({
        ...current,
        gemmaLoaded: true,
        gemmaLastMs: runtime.lastInferenceMs,
        gemmaP50Ms: runtime.p50InferenceMs,
        gemmaLoadMs: runtime.lastLoadMs,
      }));
      setDiagnosticMessage('On-device inference completed.');
    } catch (error) {
      setDiagnosticMessage(
        error instanceof Error ? error.message : 'Inference is unavailable.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>Engine</Text>
            <Text style={styles.pageSubtitle}>On-device runtime</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <StatsIcon width={18} height={18} color={C.text} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>LOCAL STACK</Text>
              <Text style={styles.heroSub}>
                SymSpell · dictionaries · Gemma
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatTile
            label="Language"
            value={snap.autocorrectLang}
            hint="autocorrect"
          />
          <StatTile
            label="Dictionary"
            value={formatCount(snap.symSpellWords)}
            hint="indexed words"
          />
          <StatTile
            label="Learned"
            value={`${snap.learnedWords}w`}
            hint={`${snap.learnedPhrases} phrases`}
          />
          <StatTile
            label="Boundary"
            value={String(snap.session.avgBoundaryMs)}
            unit="ms"
            hint="avg space-bar"
          />
        </View>

        <SectionCard title="Typing · today">
          <SectionRow
            label="Corrections"
            value={String(snap.session.exactFix)}
          />
          <SectionRow
            label="Characters"
            value={String(snap.typing.characters)}
          />
          <SectionRow label="Words" value={String(snap.typing.words)} />
          <SectionRow
            label="Characters saved"
            value={String(snap.typing.charsSaved)}
          />
          <SectionRow
            label="AI preflight"
            value={`${snap.aiPreflight.accepted}/${snap.aiPreflight.requests}`}
          />
          <SectionRow
            label="AI p50"
            value={formatMs(snap.aiPreflight.p50Ms)}
          />
        </SectionCard>

        <SectionCard title="Gemma">
          <SectionRow
            label="Provider"
            value={snap.aiProvider === 'on_device' ? 'On-device' : 'Cloud'}
          />
          <SectionRow
            label="Model"
            value={snap.gemmaDownloaded ? 'Downloaded' : 'Not downloaded'}
          />
          <SectionRow
            label="RAM"
            value={snap.gemmaLoaded ? 'Loaded' : 'Unloaded'}
          />
          <SectionRow label="Load time" value={formatMs(snap.gemmaLoadMs)} />
          <SectionRow label="Last inference" value={formatMs(snap.gemmaLastMs)} />
          <SectionRow label="p50 latency" value={formatMs(snap.gemmaP50Ms)} />
        </SectionCard>

        <SectionCard title="Dictionary">
          <SectionRow
            label="Bootstrap"
            value={`${formatCount(snap.dictionary.bootstrapWords)} / ${formatCount(snap.dictionary.targetWords)}`}
          />
          <SectionRow
            label="Prefix index"
            value={snap.prefixIndexReady ? 'Ready' : 'Building'}
          />
          <SectionRow
            label="SymSpell langs"
            value={snap.dictionary.cachedLangs.join(', ')}
          />
          <SectionRow
            label="Background seed"
            value={snap.dictionary.seeding ? 'In progress' : 'Idle'}
          />
        </SectionCard>

        <SectionCard title="Voice">
          <SectionRow
            label="STT"
            value={snap.voiceStt === 'android' ? 'Android' : 'Speechmatics'}
          />
          <SectionRow
            label="Cleanup"
            value={snap.voiceCleanup === 'on_device' ? 'On-device' : 'Cloud'}
          />
        </SectionCard>

        <SectionCard title="Input path">
          <SectionRow
            label="Native fast path"
            value={snap.fastPath ? 'On' : 'Off'}
          />
          <SectionRow
            label="Zero latency"
            value={snap.zeroLatency ? 'Active' : 'Off'}
          />
          <SectionRow
            label="Swipe typing"
            value={snap.swipeTyping ? 'On' : 'Off'}
          />
        </SectionCard>

        <View style={styles.toolsCard}>
          <View style={styles.toolsHeader}>
            <DeviceIcon width={18} height={18} color={C.text} />
            <Text style={styles.toolsTitle}>Diagnostics</Text>
          </View>
          <Text style={styles.toolsHint}>
            Run a lightweight dictionary check or test the on-device model.
          </Text>
          <Pressable style={styles.toolButton} onPress={runBenchmark}>
            <GraphicEqIcon width={16} height={16} color={C.muted} />
            <Text style={styles.toolButtonText}>Run benchmarks</Text>
          </Pressable>
          <Pressable style={styles.toolButton} onPress={() => void testInference()}>
            <DeviceIcon width={16} height={16} color={C.muted} />
            <Text style={styles.toolButtonText}>Test inference</Text>
          </Pressable>
          {diagnosticMessage ? (
            <Text style={styles.toolsResult}>{diagnosticMessage}</Text>
          ) : null}
        </View>

        <Text style={styles.footerNote}>
          Settings and learned-data values are read from this device.
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
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  pageSubtitle: {
    fontSize: 13,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
  },
  heroCard: {
    backgroundColor: C.card,
    borderRadius: HERO_R,
    padding: 16,
    gap: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    fontSize: 12,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: 0.6,
  },
  heroSub: {
    fontSize: 12,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
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
    gap: 4,
    minWidth: 140,
  },
  statLabel: {
    fontSize: 10,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: -1,
  },
  statUnit: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
  },
  statHint: {
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
  },
  sectionCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 10,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  sectionRowLabel: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  sectionRowValue: {
    fontSize: 14,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textAlign: 'right',
    maxWidth: '52%',
  },
  sectionRowValueMono: {
    fontSize: 12,
  },
  toolsCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    padding: 14,
    gap: 10,
  },
  toolsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolsTitle: {
    fontSize: 14,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  toolsHint: {
    fontSize: 12,
    color: C.sub,
    lineHeight: 17,
    letterSpacing: TEXT_KERNING,
  },
  toolsResult: {
    fontSize: 12,
    color: C.sub,
    lineHeight: 17,
    letterSpacing: TEXT_KERNING,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: C.bg,
    opacity: 0.72,
  },
  toolButtonText: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
});
