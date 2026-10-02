import React, {useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  clearTouchIntelligenceHits,
  loadTouchIntelligenceHitsSnapshot,
  subscribeTouchIntelligenceTelemetry,
  type TouchIntelligenceHitRecord,
  type TouchIntelligenceTelemetrySummary,
} from './src/keyboard/gesture/touchIntelligenceTelemetry';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  green: '#2CC642',
  muted: '#b0b0b5',
  red: '#D71921',
  border: '#e8e8ea',
} as const;

const CARD_R = 14;
const TEXT_KERNING = -0.7;

type CorrectionRow = {
  id: string;
  word: string;
  from: string;
  to: string;
};

function parseCorrection(record: TouchIntelligenceHitRecord): CorrectionRow | null {
  const from = record.geometricLetter?.toLowerCase();
  const to = (record.committedLetter ?? record.predictedLetter ?? '').toLowerCase();
  if (!record.appliedRerank || !from || !to || from === to) {
    return null;
  }

  return {
    id: record.id,
    word: `${record.wordPrefix}${to}`.toLowerCase(),
    from,
    to,
  };
}

function StatCard({
  label,
  value,
  first,
  last,
}: {
  label: string;
  value: number;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.rowCard,
        first ? styles.firstSettingCard : null,
        last ? styles.lastSettingCard : null,
      ]}>
      <View style={styles.rowInner}>
        <Text style={styles.rowSubLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

function CorrectionText({word, from, to}: Pick<CorrectionRow, 'word' | 'from' | 'to'>) {
  return (
    <Text style={styles.rowText}>
      {word} ({from} <Text style={styles.arrow}>→</Text> {to})
    </Text>
  );
}

const EMPTY_SUMMARY: TouchIntelligenceTelemetrySummary = {
  recordingEnabled: true,
  totalHits: 0,
  rerankCandidates: 0,
  appliedReranks: 0,
  confidentFastPathHits: 0,
  nativeCommits: 0,
  jsCommits: 0,
  mismatchCommits: 0,
  predictiveActiveHits: 0,
  neutralModeHits: 0,
};

export function TouchIntelligenceHitsScreen({onBack}: {onBack: () => void}) {
  const [hits, setHits] = useState<TouchIntelligenceHitRecord[]>([]);
  const [summary, setSummary] =
    useState<TouchIntelligenceTelemetrySummary>(EMPTY_SUMMARY);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const snapshot = await loadTouchIntelligenceHitsSnapshot();
      if (cancelled) {
        return;
      }
      setHits(snapshot.hits);
      setSummary(snapshot.summary);
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 1500);
    const unsubscribe = subscribeTouchIntelligenceTelemetry(() => {
      void refresh();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const corrections = useMemo(
    () =>
      hits
        .map(parseCorrection)
        .filter((entry): entry is CorrectionRow => entry != null),
    [hits],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Touch hits</Text>
          <View style={styles.betaTag}>
            <Text style={styles.betaTagText}>BETA</Text>
          </View>
        </View>

        <View style={styles.cardStack}>
          <StatCard
            label="Letter fixes (reranked)"
            value={summary.appliedReranks}
            first
          />
          <StatCard label="Taps analyzed" value={summary.totalHits} />
          <StatCard label="Rerank candidates" value={summary.rerankCandidates} />
          <StatCard label="Native path" value={summary.nativeCommits} />
          <StatCard label="Predictive-assisted" value={summary.predictiveActiveHits} />
          <StatCard label="Confident fast path" value={summary.confidentFastPathHits} last />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Recent fixes</Text>
          <Pressable onPress={clearTouchIntelligenceHits}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>

        {corrections.length === 0 ? (
          <Text style={styles.empty}>
            Type with the keyboard. When a near-miss gets corrected you will see entries
            like hope (r → e).
          </Text>
        ) : (
          <View style={styles.listCard}>
            {corrections.slice(0, 80).map(item => (
              <View key={item.id} style={styles.row}>
                <CorrectionText word={item.word} from={item.from} to={item.to} />
              </View>
            ))}
          </View>
        )}
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
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  betaTag: {
    backgroundColor: C.red,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 10,
  },
  betaTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'FragmentMono',
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  cardStack: {
    gap: 4,
    marginBottom: 4,
  },
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  firstSettingCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  lastSettingCard: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
  },
  rowSubLabel: {
    color: C.sub,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    flex: 1,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  listTitle: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  clear: {
    fontSize: 14,
    color: C.red,
    fontFamily: 'FragmentMono',
  },
  empty: {
    fontSize: 14,
    color: C.sub,
    fontFamily: 'FragmentMono',
    lineHeight: 20,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  listCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 4,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowText: {
    fontSize: 15,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  arrow: {
    color: C.green,
  },
});
