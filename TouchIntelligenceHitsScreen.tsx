import React, {useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
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
} from './src/keyboard/gesture/touchIntelligenceTelemetry';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  green: '#2CC642',
  muted: '#b0b0b5',
} as const;

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

function CorrectionText({word, from, to}: Pick<CorrectionRow, 'word' | 'from' | 'to'>) {
  return (
    <Text style={styles.rowText}>
      {word} ({from} <Text style={styles.arrow}>→</Text> {to})
    </Text>
  );
}

export function TouchIntelligenceHitsScreen({onBack}: {onBack: () => void}) {
  const [hits, setHits] = useState<TouchIntelligenceHitRecord[]>([]);
  const [summary, setSummary] = useState({
    totalHits: 0,
    nativeCommits: 0,
    appliedReranks: 0,
  });

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
      setSummary({
        totalHits: snapshot.summary.totalHits,
        nativeCommits: snapshot.summary.nativeCommits,
        appliedReranks: snapshot.summary.appliedReranks,
      });
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
      <View style={styles.header}>
        <Text style={styles.title}>Touch hits</Text>
        <Text style={styles.summary}>
          {corrections.length} fixes · {summary.totalHits} analyzed ·{' '}
          {summary.nativeCommits} native
        </Text>
        <Pressable onPress={clearTouchIntelligenceHits}>
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      </View>

      {corrections.length === 0 ? (
        <Text style={styles.empty}>
          Type with the keyboard. Every letter tap is analyzed on-device; when a
          near-miss gets corrected you'll see the word and what changed, like
          hope (r → e).
        </Text>
      ) : (
        <FlatList
          data={corrections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <View style={styles.row}>
              <CorrectionText word={item.word} from={item.from} to={item.to} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 32,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: -1.5,
  },
  summary: {
    fontSize: 13,
    color: C.sub,
    fontFamily: 'FragmentMono',
  },
  clear: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'FragmentMono',
    marginTop: 4,
  },
  empty: {
    paddingHorizontal: 18,
    fontSize: 13,
    color: C.sub,
    fontFamily: 'FragmentMono',
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 6,
  },
  row: {
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowText: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    lineHeight: 22,
  },
  arrow: {
    color: C.green,
  },
});
