import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import NumberRowIcon from './assets/123.svg';
import SearchIcon from './assets/search.svg';
import {playSwitchOffSound, playSwitchOnSound} from './src/app/switchSound';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
import {
  addMyRowPin,
  buildMyRowKeyDefinitions,
  ensureMyRowUsageLoaded,
  getMyRowUsageSnapshot,
  isValidMyRowPin,
  MY_ROW_USAGE_CHANGED_EVENT,
  normalizeMyRowPin,
  parseMyRowPinFromPaste,
} from './src/keyboard/myRow/myRowStore';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  KEYBOARD_LAYOUT_CHANGED_EVENT,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {usePremium} from './src/licensing/PremiumContext';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  muted: '#b0b0b5',
  red: '#D71921',
} as const;

const CARD_R = 14;
const ROW_GAP = 8;
const ROW_ICON = 20;
const TEXT_KERNING = -0.7;

export function MyRowScreen({
  onBack,
  onOpenPremium,
}: {
  onBack: () => void;
  onOpenPremium?: () => void;
}) {
  const {isPremium, canUse} = usePremium();
  const [ready, setReady] = useState(false);
  const [myRowEnabled, setMyRowEnabled] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [usageTick, setUsageTick] = useState(0);
  const [customDraft, setCustomDraft] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const myRowAnim = useRef(new Animated.Value(0)).current;

  const animateToggle = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const reload = useCallback(async () => {
    await ensureLayoutLoaded();
    await ensureMyRowUsageLoaded();
    const layout = getKeyboardLayoutSettings();
    const enabled = layout.myRowEnabled ?? false;
    setMyRowEnabled(enabled);
    myRowAnim.setValue(enabled ? 1 : 0);
    setPins(layout.myRowPins ?? []);
    setReady(true);
  }, [myRowAnim]);

  useEffect(() => {
    void reload();
    const layoutSub = DeviceEventEmitter.addListener(
      KEYBOARD_LAYOUT_CHANGED_EVENT,
      () => {
        const layout = getKeyboardLayoutSettings();
        const enabled = layout.myRowEnabled ?? false;
        setMyRowEnabled(enabled);
        myRowAnim.setValue(enabled ? 1 : 0);
        setPins(layout.myRowPins ?? []);
      },
    );
    const usageSub = DeviceEventEmitter.addListener(
      MY_ROW_USAGE_CHANGED_EVENT,
      () => setUsageTick(tick => tick + 1),
    );
    return () => {
      layoutSub.remove();
      usageSub.remove();
    };
  }, [myRowAnim, reload]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const previewKeys = useMemo(() => {
    void usageTick;
    return buildMyRowKeyDefinitions(pins, getMyRowUsageSnapshot());
  }, [pins, usageTick]);

  const persistPins = async (next: string[]) => {
    setPins(next);
    await updateKeyboardLayoutSetting('myRowPins', next);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const requireMyRow = () => {
    if (!canUse('my_row')) {
      onOpenPremium?.();
      return false;
    }
    return true;
  };

  const addPin = async (raw: string) => {
    if (!requireMyRow()) {
      return;
    }
    const next = addMyRowPin(pins, raw);
    if (!next) {
      setPinError('Use a symbol — not plain letters or numbers.');
      return;
    }
    setPinError(null);
    setCustomDraft('');
    await persistPins(next);
  };

  const toggleMyRow = async () => {
    if (!requireMyRow()) {
      return;
    }
    const next = !myRowEnabled;
    setMyRowEnabled(next);
    await updateKeyboardLayoutSetting('myRowEnabled', next);
    animateToggle(myRowAnim, next ? 1 : 0);
    if (next) {
      playSwitchOnSound();
    } else {
      playSwitchOffSound();
    }
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const pasteCustomSymbol = async () => {
    if (!requireMyRow()) {
      return;
    }
    try {
      const clip = (await keyboardBridge.getClipboardText()).trim();
      const fromClip = parseMyRowPinFromPaste(clip);
      if (fromClip) {
        await addPin(fromClip);
        return;
      }
      if (customDraft.trim()) {
        const fromDraft = parseMyRowPinFromPaste(customDraft);
        if (fromDraft) {
          await addPin(fromDraft);
          return;
        }
      }
      setPinError('Copy a symbol, then paste.');
    } catch {
      setPinError('Could not read clipboard.');
    }
  };

  const submitCustomDraft = () => {
    const pin = parseMyRowPinFromPaste(customDraft);
    if (pin) {
      void addPin(pin);
      return;
    }
    if (isValidMyRowPin(customDraft)) {
      void addPin(normalizeMyRowPin(customDraft));
      return;
    }
    setPinError('Paste or type a symbol.');
  };

  const renderToggleRow = (
    label: string,
    enabled: boolean,
    anim: Animated.Value,
    onToggle: () => void,
    options?: {premiumBadge?: boolean; icon?: React.ReactNode},
  ) => (
    <View style={styles.rowInner}>
      {options?.icon ?? (
        <NumberRowIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
      )}
      <View style={styles.rowTitleWrap}>
        <Text style={styles.rowTitle}>{label}</Text>
        {options?.premiumBadge && !isPremium ? (
          <View style={styles.premiumPill}>
            <Text style={styles.premiumPillText}>PREMIUM</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.toggleWrap}>
        <Pressable
          onPress={onToggle}
          disabled={!ready}
          style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
          <Animated.View
            style={[
              styles.toggleThumb,
              {
                transform: [
                  {
                    translateX: anim.interpolate({
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
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>My Row</Text>
        <Text style={styles.pageIntro}>Pin symbols · show on Shift or Caps Lock</Text>

        {!isPremium ? (
          <Pressable
            style={[styles.rowCard, styles.unlockCard, {marginBottom: ROW_GAP}]}
            onPress={() => onOpenPremium?.()}>
            <View style={styles.rowInner}>
              <Text style={styles.rowTitle}>Unlock TypeBase Premium</Text>
              <Text style={styles.rowValue}>→</Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>Behavior</Text>
        <View style={styles.mainStack}>
          <View style={[styles.rowCard, styles.soloCard]}>
            {renderToggleRow('Use my row', myRowEnabled, myRowAnim, () =>
              void toggleMyRow(), {premiumBadge: true})}
          </View>
        </View>

        <View style={styles.addSymbolPill}>
          <Pressable
            hitSlop={8}
            onPress={() => void pasteCustomSymbol()}
            disabled={!ready || !canUse('my_row')}
            style={styles.addSymbolIconBtn}>
            <SearchIcon width={22} height={22} color={C.text} />
          </Pressable>
          <TextInput
            style={styles.addSymbolInput}
            value={customDraft}
            onChangeText={text => {
              setCustomDraft(text);
              if (pinError) {
                setPinError(null);
              }
            }}
            placeholder="Paste or type a symbol…"
            placeholderTextColor="#9a9aa0"
            autoCorrect={false}
            autoCapitalize="none"
            editable={ready && canUse('my_row')}
            onSubmitEditing={submitCustomDraft}
            returnKeyType="done"
          />
        </View>
        {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

        <Text style={styles.sectionLabel}>Live row</Text>
        <View style={styles.mainStack}>
          <View style={[styles.rowCard, styles.soloCard, styles.previewCard]}>
            <View style={styles.previewRow}>
              {previewKeys.map(key => (
                <View key={key.id} style={styles.previewKey}>
                  <Text style={styles.previewKeyLabel}>{key.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
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
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  pageIntro: {
    fontSize: 11,
    lineHeight: 15,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  mainStack: {
    gap: 4,
    marginBottom: ROW_GAP,
  },
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  unlockCard: {
    borderRadius: 20,
  },
  soloCard: {
    borderRadius: 20,
  },
  previewCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addSymbolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 18,
    minHeight: 52,
    marginBottom: ROW_GAP,
    gap: 12,
  },
  addSymbolIconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSymbolInput: {
    flex: 1,
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    paddingVertical: 12,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
  },
  rowTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowTitle: {
    color: C.text,
    fontSize: 16,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    marginLeft: 'auto',
    letterSpacing: TEXT_KERNING,
  },
  premiumPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: C.border,
  },
  premiumPillText: {
    fontSize: 9,
    fontFamily: 'FragmentMono',
    color: C.text,
    letterSpacing: 0.4,
  },
  toggleWrap: {
    marginLeft: 'auto',
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
    backgroundColor: '#2CC642',
  },
  toggleThumb: {
    width: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewKey: {
    minWidth: 30,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewKeyLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    color: C.text,
  },
  pinError: {
    fontFamily: 'FragmentMono',
    fontSize: 12,
    color: C.red,
    marginTop: -4,
    marginBottom: 12,
  },
});
