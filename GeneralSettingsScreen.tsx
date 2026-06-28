import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import BackIcon from './assets/back.svg';
import HapticIcon from './assets/haptic.svg';
import DiscordIcon from './assets/discord.svg';
import FeedbackIcon from './assets/feedback.svg';
import GraphicEqIcon from './assets/graphic_eq.svg';
import DevIcon from './assets/dev.svg';
import SymbolToggleIcon from './assets/symbol-toggle.svg';
import NumberRowIcon from './assets/123.svg';

import {playSwitchOffSound, playSwitchOnSound} from './src/app/switchSound';
import {
  ensureUiSoundsLoaded,
  getUiSoundsEnabled,
  setUiSoundsEnabled,
} from './src/app/uiSoundsStore';

import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  type ControllerSettings,
} from './src/keyboard/controller/controllerSettings';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  red: '#D71921',
} as const;

const CARD_R = 14;
const ROW_GAP = 8;
const ROW_ICON = 20;
const TEXT_KERNING = -0.7;

export function GeneralSettingsScreen({
  onBack,
  onOpenConsole,
}: {
  onBack: () => void;
  onOpenConsole?: () => void;
}) {
  const [uiSoundsEnabled, setUiSoundsEnabledState] = useState(true);
  const [keyHapticEnabled, setKeyHapticEnabledState] = useState(true);
  const [developerEyeEnabled, setDeveloperEyeEnabledState] = useState(false);
  const [letterSymbolAlternatesEnabled, setLetterSymbolAlternatesEnabledState] =
    useState(false);
  const [numberRowEnabled, setNumberRowEnabledState] = useState(false);
  const [controllerSettings, setControllerSettings] =
    useState<ControllerSettings>(DEFAULT_CONTROLLER_SETTINGS);

  const uiSoundsAnim = useRef(new Animated.Value(0)).current;
  const keyHapticAnim = useRef(new Animated.Value(0)).current;
  const developerEyeAnim = useRef(new Animated.Value(0)).current;
  const symbolAlternatesAnim = useRef(new Animated.Value(0)).current;
  const numberRowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void ensureUiSoundsLoaded()
      .then(() => getUiSoundsEnabled())
      .then((v) => {
        setUiSoundsEnabledState(v);
        uiSoundsAnim.setValue(v ? 1 : 0);
      })
      .catch(() => setUiSoundsEnabledState(true));

    void ensureLayoutLoaded().then(() => {
      const layout = getKeyboardLayoutSettings();
      setKeyHapticEnabledState(layout.keyHapticEnabled);
      keyHapticAnim.setValue(layout.keyHapticEnabled ? 1 : 0);
      setDeveloperEyeEnabledState(layout.developerEyeEnabled);
      developerEyeAnim.setValue(layout.developerEyeEnabled ? 1 : 0);
      setLetterSymbolAlternatesEnabledState(layout.letterSymbolAlternatesEnabled);
      symbolAlternatesAnim.setValue(layout.letterSymbolAlternatesEnabled ? 1 : 0);
      setNumberRowEnabledState(layout.numberRowEnabled ?? false);
      numberRowAnim.setValue(layout.numberRowEnabled ? 1 : 0);
      setControllerSettings(layout.controller);
    });
  }, []);

  const animateToggle = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const handleDiscordPress = () => {
    void Haptics.selectionAsync().catch(() => {});
    Linking.openURL('https://discord.gg/qHtw2N5v6P').catch(() => {});
  };

  const handleFeedbackPress = () => {
    void Haptics.selectionAsync().catch(() => {});
  };

  const toggleUiSounds = async () => {
    const next = !uiSoundsEnabled;
    setUiSoundsEnabledState(next);
    await setUiSoundsEnabled(next);
    animateToggle(uiSoundsAnim, next ? 1 : 0);
    if (next) playSwitchOnSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  const toggleKeyHaptic = async () => {
    const next = !keyHapticEnabled;
    setKeyHapticEnabledState(next);
    void updateKeyboardLayoutSetting('keyHapticEnabled', next);
    animateToggle(keyHapticAnim, next ? 1 : 0);
    if (next) playSwitchOnSound();
    else playSwitchOffSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  const toggleDeveloperEye = async () => {
    const next = !developerEyeEnabled;
    setDeveloperEyeEnabledState(next);
    void updateKeyboardLayoutSetting('developerEyeEnabled', next);
    animateToggle(developerEyeAnim, next ? 1 : 0);
    if (next) playSwitchOnSound();
    else playSwitchOffSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  const toggleLetterSymbolAlternates = async () => {
    const next = !letterSymbolAlternatesEnabled;
    setLetterSymbolAlternatesEnabledState(next);
    void updateKeyboardLayoutSetting('letterSymbolAlternatesEnabled', next);
    animateToggle(symbolAlternatesAnim, next ? 1 : 0);
    if (next) playSwitchOnSound();
    else playSwitchOffSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  const toggleNumberRow = async () => {
    const next = !numberRowEnabled;
    setNumberRowEnabledState(next);
    void updateKeyboardLayoutSetting('numberRowEnabled', next);
    animateToggle(numberRowAnim, next ? 1 : 0);
    if (next) playSwitchOnSound();
    else playSwitchOffSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Main keyboard settings — separate cards, tighter gaps, Nothing-style outer rounding */}
        <View style={styles.mainSettingsStack}>
          {/* Key Haptic Toggle — first card, more rounded top */}
          <View style={[styles.rowCard, styles.firstSettingCard]}>
            <View style={styles.rowInner}>
              <HapticIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Key Haptic</Text>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleKeyHaptic}
                  style={[styles.toggleTrack, keyHapticEnabled && styles.toggleTrackOn]}
                >
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: keyHapticAnim.interpolate({
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
          </View>

          {/* UI Sounds Toggle */}
          <View style={[styles.rowCard, styles.middleSettingCard]}>
            <View style={styles.rowInner}>
              <GraphicEqIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>UI Sounds</Text>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleUiSounds}
                  style={[styles.toggleTrack, uiSoundsEnabled && styles.toggleTrackOn]}
                >
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: uiSoundsAnim.interpolate({
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
          </View>

          {/* Symbol long-press on letter keys */}
          <View style={[styles.rowCard, styles.middleSettingCard]}>
            <View style={styles.rowInner}>
              <SymbolToggleIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Extended Characters</Text>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleLetterSymbolAlternates}
                  style={[
                    styles.toggleTrack,
                    letterSymbolAlternatesEnabled && styles.toggleTrackOn,
                  ]}>
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: symbolAlternatesAnim.interpolate({
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
          </View>

          {/* Number Row Toggle — last card, more rounded bottom */}
          <View style={[styles.rowCard, styles.lastSettingCard]}>
            <View style={styles.rowInner}>
              <NumberRowIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Number Row</Text>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleNumberRow}
                  style={[styles.toggleTrack, numberRowEnabled && styles.toggleTrackOn]}
                >
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: numberRowAnim.interpolate({
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
          </View>
        </View>

        {/* Developer Eye + Console grouped (tighter, shared rounding) */}
        <View style={styles.mainSettingsStack}>
          {/* Developer Eye */}
          <View style={[styles.rowCard, styles.firstSettingCard]}>
            <View style={styles.rowInner}>
              <DevIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Developer Eye</Text>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleDeveloperEye}
                  style={[styles.toggleTrack, developerEyeEnabled && styles.toggleTrackOn]}
                >
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: developerEyeAnim.interpolate({
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
          </View>

          {/* Console (no sublabel) */}
          <Pressable
            style={[styles.rowCard, styles.lastSettingCard]}
            onPress={() => {
              if (onOpenConsole) onOpenConsole();
            }}>
            <View style={styles.rowInner}>
              <DevIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Console</Text>
              <Text style={styles.rowValue}>
                {controllerSettings.enabled ? 'On' : 'Off'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Community Stack */}
        <View style={styles.stack}>
          {/* Discord Community */}
          <View style={styles.rowCard}>
            <Pressable style={styles.rowInner} onPress={handleDiscordPress}>
              <DiscordIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Discord Community</Text>
            </Pressable>
          </View>

          {/* Feedback */}
          <View style={styles.rowCard}>
            <Pressable style={styles.rowInner} onPress={handleFeedbackPress}>
              <FeedbackIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <Text style={styles.rowTitle}>Leave Feedback</Text>
            </Pressable>
          </View>
        </View>

        {/* App Version */}
        <View style={styles.stack}>
          <View style={[styles.rowCard, styles.rowCardStatic]}>
            <View style={styles.rowInner}>
              <Text style={styles.rowSubLabel}>App Version</Text>
              <Text style={styles.rowValue}>0.9.4</Text>
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
    gap: 10,
  },
  topRightActions: {
    position: 'absolute',
    right: 10,
    top: 6,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  topRightSettings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: C.card,
    zIndex: 10,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  stack: {
    gap: ROW_GAP,
    marginBottom: ROW_GAP,
  },
  mainSettingsStack: {
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
  middleSettingCard: {
    borderRadius: 10,
  },
  rowCardStatic: {
    paddingVertical: 8,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
  },
  rowTitle: {
    color: C.text,
    fontSize: 16,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  rowTextCol: {
    flex: 1,
    gap: 2,
  },
  rowHint: {
    color: C.sub,
    fontSize: 12,
    fontFamily: 'FragmentMono',
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
  toggleWrap: {
    marginLeft: 'auto',
  },

  // Custom toggle matching KeyboardCustomization.tsx design
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
});
