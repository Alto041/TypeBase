import React, {useEffect, useMemo, useState} from 'react';
import {
  Animated,
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
  clearWalkingTapMap,
  getTapMapSnapshot,
  hydrateTapMapFromStorage,
  subscribeTapMapChanges,
} from './src/keyboard/gesture/tapMap';
import {TapDriftOutlineGraph} from './src/keyboard/gesture/TapDriftOutlineGraph';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';

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
const MIN_SAMPLES = 4;

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;

const KEY_W = 30;
const KEY_H = 36;
const KEY_MIN_W = 24;
const KEY_MAX_W = 30;
const KEY_GAP = 5;
const OFFSET_SCALE = 0.65;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function WalkModeScreen({onBack}: {onBack: () => void}) {
  const [snapshot, setSnapshot] = useState(() => getTapMapSnapshot());
  const [walkEnabled, setWalkEnabled] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [trayWidth, setTrayWidth] = useState(0);
  const toggleAnim = useMemo(() => new Animated.Value(1), []);

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
    void ensureLayoutLoaded().then(() => {
      if (cancelled) {
        return;
      }
      const on = getKeyboardLayoutSettings().walkModeEnabled !== false;
      setWalkEnabled(on);
      toggleAnim.setValue(on ? 1 : 0);
    });
    const unsubscribe = subscribeTapMapChanges(() => {
      if (!cancelled) {
        setSnapshot(getTapMapSnapshot());
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [toggleAnim]);

  const learnedCount = useMemo(
    () =>
      Object.values(snapshot.walkingLetters).filter(entry => entry.samples >= MIN_SAMPLES)
        .length,
    [snapshot.walkingLetters],
  );

  const keyMetrics = useMemo(() => {
    if (trayWidth <= 0) {
      return null;
    }
    const trayInnerWidth = Math.max(160, trayWidth - 20);
    const usableRowWidth = trayInnerWidth - KEY_GAP * 9;
    const keyWidth = clamp(Math.floor(usableRowWidth / 10), KEY_MIN_W, KEY_MAX_W);
    const keyHeight = clamp(Math.round(keyWidth * 1.16), 30, KEY_H);
    return {keyWidth, keyHeight, graphWidth: trayInnerWidth};
  }, [trayWidth]);

  const toggleWalkMode = () => {
    const next = !walkEnabled;
    setWalkEnabled(next);
    void updateKeyboardLayoutSetting('walkModeEnabled', next);
    Animated.spring(toggleAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const handleReset = () => {
    if (resetting) {
      return;
    }
    setResetting(true);
    void clearWalkingTapMap()
      .then(() => setSnapshot(getTapMapSnapshot()))
      .finally(() => setResetting(false));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Walk mode</Text>

        <View style={styles.cardStack}>
          <View style={[styles.rowCard, styles.firstSettingCard]}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Walk mode</Text>
              <Pressable
                onPress={toggleWalkMode}
                style={[styles.toggleTrack, walkEnabled && styles.toggleTrackOn]}>
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [
                        {
                          translateX: toggleAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 18],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.rowCard}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Walking taps fixed</Text>
              <Text style={styles.rowValue}>{snapshot.impact.walkingTapsFixed}</Text>
            </View>
          </View>
          <View style={styles.rowCard}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Keys learned</Text>
              <Text style={styles.rowValue}>{learnedCount}</Text>
            </View>
          </View>
          <View style={[styles.rowCard, styles.lastSettingCard]}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>Tap samples</Text>
              <Text style={styles.rowValue}>{snapshot.walkingTotalSamples}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.rowCard, styles.keyboardCard]}>
          <View style={styles.keyboardHeader}>
            <Text style={styles.keyboardTitle}>Touch drift</Text>
            <Text style={styles.keyboardHint}>
              Key outlines are the standard positions. Lines and the green shape show
              where your taps land on average while walking.
            </Text>
          </View>
          <View
            style={styles.keyboardTray}
            onLayout={event => {
              const width = Math.round(event.nativeEvent.layout.width);
              if (width > 0 && width !== trayWidth) {
                setTrayWidth(width);
              }
            }}>
            {learnedCount === 0 || keyMetrics == null ? (
              <Text style={styles.keyboardEmpty}>
                {learnedCount === 0
                  ? 'Walk with the keyboard open and type a bit. Drift outlines appear as offsets are learned.'
                  : ''}
              </Text>
            ) : (
              <TapDriftOutlineGraph
                rows={ROWS}
                letters={snapshot.walkingLetters}
                offsetScale={OFFSET_SCALE}
                width={keyMetrics.graphWidth}
                keyWidth={keyMetrics.keyWidth}
                keyHeight={keyMetrics.keyHeight}
                gap={KEY_GAP}
              />
            )}
          </View>
        </View>

        <Pressable
          onPress={handleReset}
          disabled={resetting}
          style={[styles.rowCard, styles.resetCard]}>
          <View style={styles.rowInner}>
            <Text style={[styles.rowTitle, styles.resetLabel]}>
              {resetting ? 'Resetting…' : 'Reset walking tap map'}
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
    flex: 1,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    marginLeft: 'auto',
    letterSpacing: TEXT_KERNING,
  },
  toggleTrack: {
    width: 44,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1D1D6',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: C.green,
  },
  toggleThumb: {
    width: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  keyboardCard: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingBottom: 14,
    gap: 8,
  },
  keyboardHeader: {
    paddingHorizontal: 2,
    gap: 2,
  },
  keyboardTitle: {
    fontSize: 14,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  keyboardHint: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  keyboardEmpty: {
    fontSize: 13,
    color: C.sub,
    fontFamily: 'FragmentMono',
    lineHeight: 20,
    letterSpacing: TEXT_KERNING,
  },
  keyboardTray: {
    width: '100%',
    backgroundColor: C.bg,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    minHeight: 120,
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
