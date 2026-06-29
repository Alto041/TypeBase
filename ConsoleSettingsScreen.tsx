import React, {useEffect, useRef, useState} from 'react';
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
import * as Haptics from 'expo-haptics';

import BackIcon from './assets/back.svg';
import DevIcon from './assets/dev.svg';

import {playSwitchOffSound, playSwitchOnSound} from './src/app/switchSound';

import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {
  CONTROLLER_ACTION_LABELS,
  CONTROLLER_BUTTON_LABELS,
  DEFAULT_CONTROLLER_SETTINGS,
  nextControllerButton,
  type ControllerAction,
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

export function ConsoleSettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [controllerSettings, setControllerSettings] =
    useState<ControllerSettings>(DEFAULT_CONTROLLER_SETTINGS);

  const controllerEnabledAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void ensureLayoutLoaded().then(() => {
      const layout = getKeyboardLayoutSettings();
      setControllerSettings(layout.controller);
      controllerEnabledAnim.setValue(layout.controller.enabled ? 1 : 0);
    });
  }, [controllerEnabledAnim]);

  // Handle Android back button/gesture to return to settings list
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => backHandler.remove();
  }, [onBack]);

  const animateToggle = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const persistControllerSettings = (next: ControllerSettings) => {
    setControllerSettings(next);
    void updateKeyboardLayoutSetting('controller', next);
  };

  const toggleControllerEnabled = async () => {
    const next = {
      ...controllerSettings,
      enabled: !controllerSettings.enabled,
    };
    persistControllerSettings(next);
    animateToggle(controllerEnabledAnim, next.enabled ? 1 : 0);
    if (next.enabled) playSwitchOnSound();
    else playSwitchOffSound();
    void Haptics.selectionAsync().catch(() => {});
  };

  const cycleControllerMapping = (action: ControllerAction) => {
    const next = {
      ...controllerSettings,
      mappings: {
        ...controllerSettings.mappings,
        [action]: nextControllerButton(controllerSettings.mappings[action]),
      },
    };
    persistControllerSettings(next);
    void Haptics.selectionAsync().catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Console</Text>
          <View style={styles.betaTag}>
            <Text style={styles.betaTagText}>BETA</Text>
          </View>
        </View>

        {/* Controller Stack */}
        <View style={styles.stack}>
          <View style={styles.rowCard}>
            <View style={styles.rowInner}>
              <DevIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Controller Input</Text>
                <Text style={styles.rowHint}>Gamepad navigation in landscape</Text>
              </View>
              <View style={styles.toggleWrap}>
                <Pressable
                  onPress={toggleControllerEnabled}
                  style={[
                    styles.toggleTrack,
                    controllerSettings.enabled && styles.toggleTrackOn,
                  ]}>
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      {
                        transform: [
                          {
                            translateX: controllerEnabledAnim.interpolate({
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

          {(
            [
              'selectKey',
              'clickKey',
              'toggleKeyboard',
              'submitText',
              'backspace',
              'enter',
            ] as ControllerAction[]
          ).map(action => (
            <View key={action} style={styles.rowCard}>
              <Pressable
                style={styles.rowInner}
                onPress={() => cycleControllerMapping(action)}>
                <Text style={styles.rowTitle}>
                  {CONTROLLER_ACTION_LABELS[action]}
                </Text>
                <Text style={styles.rowValue}>
                  {CONTROLLER_BUTTON_LABELS[controllerSettings.mappings[action]]}
                </Text>
              </Pressable>
            </View>
          ))}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: -8,
  },
  backButton: {
    padding: 4,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  betaTag: {
    backgroundColor: C.red,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  betaTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'FragmentMono',
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  stack: {
    gap: ROW_GAP,
    marginBottom: ROW_GAP,
  },
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 4,
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

  // Custom toggle matching GeneralSettingsScreen design
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
