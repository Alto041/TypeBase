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
  border: '#e8e8ea',
  green: '#2CC642',
  muted: '#b0b0b5',
} as const;

const CARD_R = 14;
const ROW_GAP = 8;
const TEXT_KERNING = -0.7;
const MIN_SAMPLES = 3;

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;

const KEY_W = 30;
const KEY_H = 36;
const KEY_GAP = 6;
const OFFSET_SCALE = 0.65;

function KeyBubble({
  letter,
  entry,
}: {
  letter: string;
  entry?: TapMapEntry;
}) {
  const learned = entry != null && entry.samples >= MIN_SAMPLES;
  const dx = (entry?.dx ?? 0) * OFFSET_SCALE;
  const dy = (entry?.dy ?? 0) * OFFSET_SCALE;

  return (
    <View style={styles.keySlot}>
      <View style={styles.keyGhost} />
      <View
        style={[
          styles.bubble,
          learned ? styles.bubbleLearned : styles.bubbleNeutral,
          {transform: [{translateX: dx}, {translateY: dy}]},
        ]}>
        <Text
          style={[styles.bubbleText, learned ? styles.bubbleTextLearned : null]}>
          {letter}
        </Text>
      </View>
    </View>
  );
}

export function TapMapScreen({onBack}: {onBack: () => void}) {
  const [snapshot, setSnapshot] = useState(() => getTapMapSnapshot());
  const [resetting, setResetting] = useState(false);

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
      Object.values(snapshot.letters).filter(entry => entry.samples >= MIN_SAMPLES)
        .length,
    [snapshot.letters],
  );

  const handleReset = () => {
    if (resetting) {
      return;
    }
    setResetting(true);
    void clearTapMap()
      .then(() => setSnapshot(getTapMapSnapshot()))
      .finally(() => setResetting(false));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Tap map</Text>

        <View style={styles.cardStack}>
          <View style={[styles.rowCard, styles.firstSettingCard]}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Keys learned</Text>
              <Text style={styles.rowValue}>{learnedCount}</Text>
            </View>
          </View>
          <View style={[styles.rowCard, styles.lastSettingCard]}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Total taps</Text>
              <Text style={styles.rowValue}>{snapshot.totalSamples}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.rowCard, styles.keyboardCard]}>
          {learnedCount === 0 ? (
            <Text style={styles.keyboardEmpty}>
              Type normally for a few minutes. Green keys appear as offsets are
              learned.
            </Text>
          ) : (
            <View style={styles.keyboardTray}>
              {ROWS.map((row, rowIndex) => (
                <View
                  key={`row-${rowIndex}`}
                  style={[
                    styles.keyboardRow,
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
          )}
        </View>

        <Pressable
          onPress={handleReset}
          disabled={resetting}
          style={[styles.rowCard, styles.resetCard]}>
          <View style={styles.rowInner}>
            <Text style={[styles.rowTitle, styles.resetLabel]}>
              {resetting ? 'Resetting…' : 'Reset tap map'}
            </Text>
          </View>
        </Pressable>
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
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  cardStack: {
    gap: 4,
    marginBottom: ROW_GAP,
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
  rowTitle: {
    color: C.text,
    fontSize: 16,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  rowSubLabel: {
    color: C.sub,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    marginLeft: 'auto',
    letterSpacing: TEXT_KERNING,
  },
  keyboardCard: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingBottom: 14,
  },
  keyboardEmpty: {
    fontSize: 13,
    color: C.sub,
    fontFamily: 'FragmentMono',
    lineHeight: 20,
    letterSpacing: TEXT_KERNING,
  },
  keyboardTray: {
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: KEY_GAP,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  keyboardRow: {
    flexDirection: 'row',
    gap: KEY_GAP,
  },
  rowInsetSmall: {
    paddingLeft: 10,
  },
  rowInsetLarge: {
    paddingLeft: 18,
  },
  keySlot: {
    width: KEY_W,
    height: KEY_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyGhost: {
    position: 'absolute',
    width: KEY_W - 4,
    height: KEY_H - 6,
    borderRadius: 9,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  bubble: {
    minWidth: KEY_W - 4,
    minHeight: KEY_H - 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bubbleLearned: {
    backgroundColor: C.green,
  },
  bubbleNeutral: {
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    opacity: 0.72,
  },
  bubbleText: {
    fontSize: 12,
    fontFamily: 'FragmentMono',
    color: C.sub,
    textTransform: 'uppercase',
  },
  bubbleTextLearned: {
    color: '#ffffff',
    fontWeight: '600',
  },
  resetCard: {
    borderRadius: 20,
    marginTop: 2,
  },
  resetLabel: {
    color: C.muted,
    fontSize: 14,
  },
});
