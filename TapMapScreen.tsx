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

import {
  clearTapMap,
  getTapMapSnapshot,
  hydrateTapMapFromStorage,
  type TapMapEntry,
} from './src/keyboard/gesture/tapMap';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  bubble: '#2B7FE0',
  bubbleMuted: '#8CB8E8',
  muted: '#b0b0b5',
  red: '#D71921',
} as const;

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;

const KEY_W = 28;
const KEY_H = 34;
const KEY_GAP = 5;
const OFFSET_SCALE = 0.55;

function KeyBubble({
  letter,
  entry,
}: {
  letter: string;
  entry?: TapMapEntry;
}) {
  const learned = entry != null && entry.samples >= 3;
  const dx = (entry?.dx ?? 0) * OFFSET_SCALE;
  const dy = (entry?.dy ?? 0) * OFFSET_SCALE;

  return (
    <View style={styles.keySlot}>
      <View
        style={[
          styles.bubble,
          {
            transform: [{translateX: dx}, {translateY: dy}],
            backgroundColor: learned ? C.bubble : C.bubbleMuted,
            opacity: learned ? 1 : 0.55,
          },
        ]}>
        <Text style={styles.bubbleText}>{letter}</Text>
      </View>
    </View>
  );
}

export function TapMapScreen({onBack}: {onBack: () => void}) {
  const [snapshot, setSnapshot] = useState(() => getTapMapSnapshot());

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;
    void hydrateTapMapFromStorage().then(() => {
      if (!cancelled) {
        setSnapshot(getTapMapSnapshot());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const learnedCount = useMemo(
    () =>
      Object.values(snapshot.letters).filter(entry => entry.samples >= 3).length,
    [snapshot.letters],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.title}>Your Tap Map</Text>
          <Pressable
            onPress={() => {
              void clearTapMap().then(() => setSnapshot(getTapMapSnapshot()));
            }}
            hitSlop={12}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Adjusted hit zones</Text>
          <Text style={styles.cardSub}>
            Keys stay where you see them — invisible touch targets shift to match
            how you actually tap.
          </Text>

          <View style={styles.keyboard}>
            {ROWS.map((row, rowIndex) => (
              <View
                key={`row-${rowIndex}`}
                style={[
                  styles.row,
                  rowIndex === 1 ? styles.rowInsetSmall : null,
                  rowIndex >= 2 ? styles.rowInsetLarge : null,
                ]}>
                {row.map(letter => (
                  <KeyBubble
                    key={letter}
                    letter={letter}
                    entry={snapshot.letters[letter]}
                  />
                ))}
              </View>
            ))}
          </View>

          <Text style={styles.footer}>
            {learnedCount > 0
              ? `${learnedCount} keys personalized · ${snapshot.totalSamples} taps learned`
              : 'Keep typing — Tap Map learns from consistent mis-taps and autocorrect fixes.'}
          </Text>
        </View>

        <Text style={styles.brand}>TypeBase Keyboard</Text>
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
    paddingTop: 12,
    paddingBottom: 110,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  back: {
    fontSize: 22,
    color: C.text,
    width: 44,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  reset: {
    fontSize: 13,
    color: C.red,
    width: 44,
    textAlign: 'right',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  cardSub: {
    fontSize: 13,
    lineHeight: 19,
    color: C.sub,
  },
  keyboard: {
    marginTop: 8,
    gap: KEY_GAP,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: KEY_GAP,
  },
  rowInsetSmall: {
    paddingLeft: 8,
  },
  rowInsetLarge: {
    paddingLeft: 16,
  },
  keySlot: {
    width: KEY_W,
    height: KEY_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    minWidth: KEY_W - 2,
    minHeight: KEY_H - 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: C.sub,
    marginTop: 4,
  },
  brand: {
    textAlign: 'center',
    fontSize: 12,
    color: C.muted,
  },
});
