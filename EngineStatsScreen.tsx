import React, {useEffect} from 'react';
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

/** Placeholder snapshot — wire to real engine telemetry later. */
const MOCK_SNAPSHOT = {
  live: true,
  autocorrectLang: 'en',
  symSpellReady: true,
  symSpellWords: 82_834,
  prefixIndexReady: true,
  learnedWords: 142,
  learnedPhrases: 18,
  aiProvider: 'on_device',
  gemmaDownloaded: true,
  gemmaLoaded: false,
  gemmaLoadMs: null as number | null,
  gemmaLastMs: null as number | null,
  gemmaP50Ms: null as number | null,
  voiceStt: 'android',
  voiceCleanup: 'on_device',
  fastPath: true,
  zeroLatency: false,
  swipeTyping: true,
  session: {
    exactFix: 12,
    symSpell: 34,
    missingSpace: 3,
    hinglish: 0,
    ai: 1,
    avgBoundaryMs: 4.2,
  },
  dictionary: {
    bootstrapWords: 3_000,
    targetWords: 82_834,
    cachedLangs: ['en'],
    seeding: false,
  },
} as const;

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

type StatusTone = 'ready' | 'idle' | 'warn';

function StatusChip({label, tone}: {label: string; tone: StatusTone}) {
  const dotColor =
    tone === 'ready' ? C.green : tone === 'warn' ? C.amber : C.muted;
  return (
    <View style={styles.statusChip}>
      <View style={[styles.statusDot, {backgroundColor: dotColor}]} />
      <Text style={styles.statusChipText}>{label}</Text>
    </View>
  );
}

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
  const snap = MOCK_SNAPSHOT;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const symSpellTone: StatusTone = snap.symSpellReady ? 'ready' : 'warn';
  const gemmaTone: StatusTone = snap.gemmaLoaded
    ? 'ready'
    : snap.gemmaDownloaded
      ? 'idle'
      : 'warn';

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
          <View style={styles.liveBadge}>
            <View
              style={[
                styles.liveDot,
                {backgroundColor: snap.live ? C.green : C.muted},
              ]}
            />
            <Text style={styles.liveText}>{snap.live ? 'LIVE' : 'OFF'}</Text>
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
          <View style={styles.statusRow}>
            <StatusChip
              label={snap.symSpellReady ? 'SymSpell ready' : 'SymSpell loading'}
              tone={symSpellTone}
            />
            <StatusChip
              label={
                snap.gemmaLoaded
                  ? 'Gemma loaded'
                  : snap.gemmaDownloaded
                    ? 'Gemma idle'
                    : 'Gemma missing'
              }
              tone={gemmaTone}
            />
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

        <SectionCard title="Autocorrect · session">
          <SectionRow label="Exact fix" value={String(snap.session.exactFix)} />
          <SectionRow label="SymSpell" value={String(snap.session.symSpell)} />
          <SectionRow
            label="Missing space"
            value={String(snap.session.missingSpace)}
          />
          <SectionRow label="Hinglish" value={String(snap.session.hinglish)} />
          <SectionRow label="AI" value={String(snap.session.ai)} />
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
            Benchmarks and live event tracing will land here.
          </Text>
          <Pressable style={styles.toolButton} disabled>
            <GraphicEqIcon width={16} height={16} color={C.muted} />
            <Text style={styles.toolButtonText}>Run benchmarks</Text>
          </Pressable>
          <Pressable style={styles.toolButton} disabled>
            <DeviceIcon width={16} height={16} color={C.muted} />
            <Text style={styles.toolButtonText}>Test inference</Text>
          </Pressable>
        </View>

        <Text style={styles.footerNote}>
          UI preview · values are placeholders until engine telemetry ships.
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.card,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: 0.8,
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.bg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    color: C.text,
    fontFamily: 'FragmentMono',
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
