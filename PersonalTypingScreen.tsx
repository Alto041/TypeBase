import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  clearPersonalTypingProfile,
  ensurePersonalTypingLoaded,
  getPersonalTypingSnapshot,
} from './src/keyboard/personalTyping/personalTypingEngine';
import type {PersonalTypingSnapshot} from './src/keyboard/personalTyping/types';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  green: '#2CC642',
  muted: '#b0b0b5',
} as const;

type Tab = 'words' | 'phrases' | 'corrections';

type ListRow = {
  id: string;
  label: string;
  detail: string;
};

const TAB_LABELS: Record<Tab, string> = {
  words: 'Words',
  phrases: 'Phrases',
  corrections: 'Corrections',
};

function emptySnapshot(): PersonalTypingSnapshot {
  return {
    words: [],
    phrases: [],
    corrections: [],
    punctuation: [],
    wordCount: 0,
    phraseCount: 0,
    correctionCount: 0,
  };
}

function confidencePct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildRows(
  tab: Tab,
  snapshot: PersonalTypingSnapshot,
  query: string,
): ListRow[] {
  const q = query.trim().toLowerCase();

  if (tab === 'words') {
    return snapshot.words
      .filter(item => !q || item.word.includes(q))
      .map(item => ({
        id: item.word,
        label: item.word,
        detail: `${item.uses} uses · ${confidencePct(item.confidence)}`,
      }));
  }

  if (tab === 'phrases') {
    return snapshot.phrases
      .filter(item => !q || item.phrase.includes(q))
      .map(item => ({
        id: item.phrase,
        label: item.phrase,
        detail: `${item.uses} uses · ${confidencePct(item.confidence)}`,
      }));
  }

  return snapshot.corrections
    .filter(item => !q || item.from.includes(q) || item.to.includes(q))
    .map(item => ({
      id: `${item.from}->${item.to}`,
      label: `${item.from} → ${item.to}`,
      detail: `${item.accepts} accepted · ${confidencePct(item.confidence)}`,
    }));
}

const Row = React.memo(function Row({item}: {item: ListRow}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText} numberOfLines={2}>
        {item.label}
      </Text>
      <Text style={styles.rowDetail}>{item.detail}</Text>
    </View>
  );
});

export function PersonalTypingScreen({onBack}: {onBack: () => void}) {
  const [tab, setTab] = useState<Tab>('words');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [snapshot, setSnapshot] = useState<PersonalTypingSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(async () => {
    await ensurePersonalTypingLoaded();
    setSnapshot(getPersonalTypingSnapshot(250));
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const rows = useMemo(
    () => buildRows(tab, snapshot, debouncedQuery),
    [debouncedQuery, snapshot, tab],
  );

  const summary = useMemo(() => {
    if (!ready) {
      return 'Loading…';
    }
    const shown = rows.length;
    const total =
      tab === 'words'
        ? snapshot.wordCount
        : tab === 'phrases'
          ? snapshot.phraseCount
          : snapshot.correctionCount;
    const suffix =
      debouncedQuery.trim().length > 0 && shown !== total
        ? `${shown} shown · ${total} total`
        : `${total} total`;
    return suffix;
  }, [debouncedQuery, ready, rows.length, snapshot, tab]);

  const handleClearAll = useCallback(() => {
    if (clearing) {
      return;
    }
    void (async () => {
      setClearing(true);
      try {
        await clearPersonalTypingProfile();
        await reload();
      } finally {
        setClearing(false);
      }
    })();
  }, [clearing, reload]);

  const renderItem = useCallback(
    ({item}: {item: ListRow}) => <Row item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: ListRow) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>Personal typing</Text>
        <Text style={styles.summary}>{summary}</Text>
        <View style={styles.tabs}>
          {(['words', 'phrases', 'corrections'] as const).map(item => (
            <Pressable key={item} onPress={() => setTab(item)} hitSlop={6}>
              <Text style={[styles.tab, tab === item && styles.tabActive]}>
                {TAB_LABELS[item]}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={C.muted}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable onPress={handleClearAll} disabled={clearing || !ready}>
          <Text style={[styles.clear, (clearing || !ready) && styles.clearDisabled]}>
            Clear all
          </Text>
        </Pressable>
      </View>

      {!ready ? (
        <Text style={styles.empty}>Loading learned words and phrases…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {debouncedQuery.trim().length > 0
            ? 'No matches for that search.'
            : 'Type with the keyboard. Words, phrases, and corrections you use will show up here.'}
        </Text>
      ) : (
        <FlatList
          data={rows}
          key={tab}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          initialNumToRender={18}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
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
  tabs: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
  },
  tab: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'FragmentMono',
  },
  tabActive: {
    color: C.text,
  },
  search: {
    marginTop: 4,
    fontSize: 13,
    color: C.text,
    fontFamily: 'FragmentMono',
    paddingVertical: 6,
  },
  clear: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'FragmentMono',
    marginTop: 2,
  },
  clearDisabled: {
    opacity: 0.45,
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
    gap: 4,
  },
  rowText: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    lineHeight: 22,
  },
  rowDetail: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
    lineHeight: 18,
  },
});
