import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import BackIcon from './assets/back.svg';
import ResetIcon from './assets/reset.svg';
import {
  clearPersonalTypingProfile,
  ensurePersonalTypingLoaded,
  getPersonalTypingSnapshot,
  removePersonalPhraseEntry,
  removePersonalWordEntry,
  setPersonalPhraseEntry,
  setPersonalWordEntry,
} from './src/keyboard/personalTyping/personalTypingEngine';
import type {PersonalTypingSnapshot} from './src/keyboard/personalTyping/types';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  accent: '#2CC642',
  danger: '#E5484D',
} as const;

const CARD_R = 14;
const TEXT_KERNING = -0.7;

type Tab = 'words' | 'phrases' | 'corrections';

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

function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function ConfidenceBar({value}: {value: number}) {
  const filled = Math.max(4, Math.round(value * 100));
  return (
    <View style={styles.confidenceTrack}>
      <View style={[styles.confidenceFill, {flex: filled}]} />
      <View style={{flex: 100 - filled}} />
    </View>
  );
}

export function PersonalTypingScreen({onBack}: {onBack: () => void}) {
  const [tab, setTab] = useState<Tab>('words');
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState<PersonalTypingSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editUses, setEditUses] = useState('1');
  const [editConfidence, setEditConfidence] = useState('50');

  const reload = useCallback(async () => {
    await ensurePersonalTypingLoaded();
    setSnapshot(getPersonalTypingSnapshot(250));
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const filteredWords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.words;
    return snapshot.words.filter(item => item.word.includes(q));
  }, [query, snapshot.words]);

  const filteredPhrases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.phrases;
    return snapshot.phrases.filter(item => item.phrase.includes(q));
  }, [query, snapshot.phrases]);

  const filteredCorrections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.corrections;
    return snapshot.corrections.filter(
      item => item.from.includes(q) || item.to.includes(q),
    );
  }, [query, snapshot.corrections]);

  const beginEdit = (key: string, uses: number, confidence: number) => {
    setEditingKey(key);
    setEditUses(String(uses));
    setEditConfidence(String(Math.round(confidence * 100)));
  };

  const saveEdit = () => {
    if (!editingKey) return;
    const uses = Number.parseInt(editUses, 10);
    const confidencePct = Number.parseInt(editConfidence, 10);
    if (!Number.isFinite(uses) || !Number.isFinite(confidencePct)) return;
    const confidence = Math.max(0, Math.min(100, confidencePct)) / 100;
    if (tab === 'words') {
      setPersonalWordEntry(editingKey, uses, confidence);
    } else if (tab === 'phrases') {
      setPersonalPhraseEntry(editingKey, uses, confidence);
    }
    setEditingKey(null);
    void reload();
  };

  const removeCurrent = (key: string) => {
    if (tab === 'words') removePersonalWordEntry(key);
    else if (tab === 'phrases') removePersonalPhraseEntry(key);
    void reload();
  };

  const handleClearAll = () => {
    if (resetting) return;
    void (async () => {
      setResetting(true);
      try {
        await clearPersonalTypingProfile();
        setEditingKey(null);
        await reload();
      } finally {
        setResetting(false);
      }
    })();
  };

  const summary =
    tab === 'words'
      ? `${snapshot.wordCount} words`
      : tab === 'phrases'
        ? `${snapshot.phraseCount} phrases`
        : `${snapshot.correctionCount} patterns`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <BackIcon width={22} height={14} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Personal typing</Text>
        <Pressable
          onPress={handleClearAll}
          disabled={resetting || !ready}
          hitSlop={8}
          style={resetting ? styles.resetDisabled : undefined}>
          <ResetIcon width={22} height={22} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Words, phrases, and corrections Typebase learns from your typing.
      </Text>

      <View style={styles.tabRow}>
        {(['words', 'phrases', 'corrections'] as Tab[]).map(item => (
          <Pressable
            key={item}
            onPress={() => {
              setTab(item);
              setEditingKey(null);
            }}
            style={[styles.tab, tab === item && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>
              {item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchCard}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={C.sub}
          style={styles.searchInput}
        />
        <Text style={styles.summary}>{ready ? summary : 'Loading…'}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {tab === 'words'
          ? filteredWords.map(item => (
              <View key={item.word} style={styles.rowCard}>
                {editingKey === item.word ? (
                  <View style={styles.editBlock}>
                    <Text style={styles.rowTitle}>{item.word}</Text>
                    <View style={styles.editFields}>
                      <TextInput
                        value={editUses}
                        onChangeText={setEditUses}
                        keyboardType="number-pad"
                        style={styles.editInput}
                        placeholder="Uses"
                        placeholderTextColor={C.sub}
                      />
                      <TextInput
                        value={editConfidence}
                        onChangeText={setEditConfidence}
                        keyboardType="number-pad"
                        style={styles.editInput}
                        placeholder="Confidence %"
                        placeholderTextColor={C.sub}
                      />
                    </View>
                    <View style={styles.editActions}>
                      <Pressable onPress={saveEdit} style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingKey(null)}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{item.word}</Text>
                      <Text style={styles.rowMeta}>
                        {item.uses} uses · {confidenceLabel(item.confidence)}
                      </Text>
                      <ConfidenceBar value={item.confidence} />
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable onPress={() => beginEdit(item.word, item.uses, item.confidence)}>
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => removeCurrent(item.word)}>
                        <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ))
          : null}

        {tab === 'phrases'
          ? filteredPhrases.map(item => (
              <View key={item.phrase} style={styles.rowCard}>
                {editingKey === item.phrase ? (
                  <View style={styles.editBlock}>
                    <Text style={styles.rowTitle}>{item.phrase}</Text>
                    <View style={styles.editFields}>
                      <TextInput
                        value={editUses}
                        onChangeText={setEditUses}
                        keyboardType="number-pad"
                        style={styles.editInput}
                        placeholder="Uses"
                        placeholderTextColor={C.sub}
                      />
                      <TextInput
                        value={editConfidence}
                        onChangeText={setEditConfidence}
                        keyboardType="number-pad"
                        style={styles.editInput}
                        placeholder="Confidence %"
                        placeholderTextColor={C.sub}
                      />
                    </View>
                    <View style={styles.editActions}>
                      <Pressable onPress={saveEdit} style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingKey(null)}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{item.phrase}</Text>
                      <Text style={styles.rowMeta}>
                        {item.uses} uses · {confidenceLabel(item.confidence)}
                      </Text>
                      <ConfidenceBar value={item.confidence} />
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() =>
                          beginEdit(item.phrase, item.uses, item.confidence)
                        }>
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => removeCurrent(item.phrase)}>
                        <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ))
          : null}

        {tab === 'corrections'
          ? filteredCorrections.map(item => (
              <View key={`${item.from}->${item.to}`} style={styles.rowCard}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>
                    {item.from} → {item.to}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.accepts} accepted · {item.rejections} rejected
                  </Text>
                  <ConfidenceBar value={item.confidence} />
                </View>
              </View>
            ))
          : null}

        {ready &&
        ((tab === 'words' && filteredWords.length === 0) ||
          (tab === 'phrases' && filteredPhrases.length === 0) ||
          (tab === 'corrections' && filteredCorrections.length === 0)) ? (
          <Text style={styles.emptyText}>Nothing learned in this category yet.</Text>
        ) : null}

        {snapshot.punctuation.length > 0 ? (
          <View style={styles.rowCard}>
            <Text style={styles.rowTitle}>Punctuation habits</Text>
            <Text style={styles.rowMeta}>
              {snapshot.punctuation
                .slice(0, 8)
                .map(item => `${item.pattern} (${item.uses})`)
                .join(' · ')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: C.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  backBtn: {padding: 4},
  headerTitle: {
    flex: 1,
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: TEXT_KERNING,
  },
  subtitle: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 10,
    letterSpacing: TEXT_KERNING,
  },
  tabRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8},
  tab: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {backgroundColor: '#e6e6e8'},
  tabText: {color: C.sub, fontSize: 13, fontWeight: '600'},
  tabTextActive: {color: C.text},
  searchCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  searchInput: {color: C.text, fontSize: 15, paddingVertical: 2},
  summary: {color: C.sub, fontSize: 12},
  scroll: {flex: 1},
  scrollContent: {paddingHorizontal: 16, paddingBottom: 24, gap: 8},
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowMain: {flex: 1, gap: 4},
  rowTitle: {color: C.text, fontSize: 15, fontWeight: '600'},
  rowMeta: {color: C.sub, fontSize: 12},
  confidenceTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e6e6e8',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  confidenceFill: {height: 4, borderRadius: 2, backgroundColor: C.accent},
  rowActions: {gap: 6, alignItems: 'flex-end'},
  actionText: {color: C.text, fontSize: 12, fontWeight: '600'},
  deleteText: {color: C.danger},
  editBlock: {flex: 1, gap: 8},
  editFields: {flexDirection: 'row', gap: 8},
  editInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    backgroundColor: '#f2f2f4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editActions: {flexDirection: 'row', alignItems: 'center', gap: 12},
  saveButton: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveButtonText: {color: '#111', fontSize: 13, fontWeight: '700'},
  cancelText: {color: C.sub, fontSize: 13},
  emptyText: {color: C.sub, fontSize: 14, lineHeight: 20, paddingVertical: 8},
  resetDisabled: {opacity: 0.35},
});
