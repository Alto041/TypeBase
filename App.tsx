import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {useFonts} from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AiConfigIcon from './assets/ai_config.svg';
import LanguageLayoutIcon from './assets/layout.svg';
import KeyboardPermIcon from './assets/keyboard_perm.svg';

import HomeIcon from './assets/home.svg';
import CustomizeIcon from './assets/customize.svg';
import ThemesIcon from './assets/themes.svg';
import SettingsIcon from './assets/settings.svg';

import { CustomizeScreen, ThemesScreen } from './KeyboardCustomization';
import { GeneralSettingsScreen } from './GeneralSettingsScreen';
import { keyboardBridge } from './src/keyboard/keyboardBridge';
import { AiConfigScreen } from './AiConfigScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { LanguageLayoutScreen } from './LanguageLayoutScreen';
import {
  ensurePlayLicensed,
  isPlayLicenseCached,
  type PlayLicenseStatus,
} from './src/licensing/playLicense';
import { LicenseGateScreen } from './src/licensing/LicenseGateScreen';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
} as const;

const CARD_R = 25;
const INNER_R = 5;
const HOME_ICON = 22;

const CONFIG_AI_W = 80;
const CONFIG_AI_H = 94;
const CONFIG_PERM_SIZE = 68;
const CONFIG_ICON_INSET = 16;

const TEXT_KERNING = -0.7;

const ONBOARDING_COMPLETE_KEY = 'typebase:onboardingComplete';

// Bottom nav (exact replica of BottomNavigation.tsx visuals)
const DOCK_WIDTH       = 308;
const PILL_RADIUS      = 22;
const PILL_HEIGHT      = 62;
const PILL_PADDING_H   = 18;
const CHIP_HEIGHT      = 74;
const CHIP_RADIUS      = 14;
const CHIP_WIDTH_INSET = 15;
const CHIP_V_MARGIN    = (PILL_HEIGHT - CHIP_HEIGHT) / 2;
const ICON_SIZE        = 22;
const GRADIENT_LIGHT   = '#F1F1F1';

const BOTTOM_NAV_BOTTOM_GAP = 8;
const BOTTOM_NAV_FADE_HEIGHT = 96;

const SLIDE_SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.7,
  useNativeDriver: true as const,
};

const SCALE_SPRING = {
  damping: 16,
  stiffness: 220,
  mass: 0.6,
  useNativeDriver: true as const,
};

import { playUiSound } from './lib/uiSounds';
import { hapticTap } from './lib/haptics';
import { useScreenTransition } from './lib/screenTransition';

type NavTab = 'home' | 'customize' | 'themes' | 'settings';
const NAV_TABS: NavTab[] = ['home', 'customize', 'themes', 'settings'];

function getLayoutMetrics(width: number) {
  const slotWidth = (width - PILL_PADDING_H * 2) / NAV_TABS.length;
  const chipWidth = slotWidth - CHIP_WIDTH_INSET;
  const chipBaseLeft = PILL_PADDING_H + (slotWidth - chipWidth) / 2;
  return { slotWidth, chipWidth, chipBaseLeft };
}

function getChipTranslateX(tab: NavTab, width: number): number {
  const { slotWidth } = getLayoutMetrics(width);
  return NAV_TABS.indexOf(tab) * slotWidth;
}

function BottomNavGradient({
  height,
  bottom,
  color,
  width,
}: {
  height: number;
  bottom: number;
  color: string;
  width: number;
}) {
  return (
    <View style={[styles.gradientShell, { height, bottom }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="bottomNavFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="0.35" stopColor={color} stopOpacity="0.18" />
            <Stop offset="0.65" stopColor={color} stopOpacity="0.42" />
            <Stop offset="1" stopColor={color} stopOpacity="0.62" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#bottomNavFade)" />
      </Svg>
    </View>
  );
}

function BottomNavigation({
  value,
  onChange,
}: {
  value: NavTab;
  onChange: (next: NavTab) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const navBottom = Math.max(insets.bottom + BOTTOM_NAV_BOTTOM_GAP, BOTTOM_NAV_BOTTOM_GAP);
  const gradientBottom = navBottom + PILL_HEIGHT + 8;
  const gradientColor = GRADIENT_LIGHT;

  const pillBg = '#E3E3E3';
  const chipBg = '#ffffff';

  const [selectedOption, setSelectedOption] = useState<NavTab>(value);
  const [pillWidth, setPillWidth] = useState(0);

  const chipTranslateX = useRef(new Animated.Value(0)).current;
  const chipScale = useRef(new Animated.Value(1)).current;

  const pillWidthRef = useRef(0);
  const selectedRef = useRef<NavTab>(value);
  selectedRef.current = selectedOption;

  const chipLayout = pillWidth > 0 ? getLayoutMetrics(pillWidth) : null;

  const animateChip = useCallback((tab: NavTab, width: number) => {
    Animated.parallel([
      Animated.spring(chipTranslateX, {
        ...SLIDE_SPRING,
        toValue: getChipTranslateX(tab, width),
      }),
      Animated.sequence([
        Animated.spring(chipScale, { ...SCALE_SPRING, toValue: 0.94 }),
        Animated.spring(chipScale, { ...SCALE_SPRING, toValue: 1 }),
      ]),
    ]).start();
  }, [chipScale, chipTranslateX]);

  // Sync from controlled prop (e.g. top buttons or back actions)
  useEffect(() => {
    if (value === selectedRef.current) return;
    setSelectedOption(value);
    selectedRef.current = value;
    if (pillWidthRef.current > 0) {
      animateChip(value, pillWidthRef.current);
    }
  }, [animateChip, value, chipTranslateX]);

  const handlePillLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w === pillWidthRef.current) return;
    pillWidthRef.current = w;
    setPillWidth(w);
    chipTranslateX.setValue(getChipTranslateX(selectedRef.current, w));
  };

  const handleSelect = (tab: NavTab) => {
    hapticTap();
    if (tab !== selectedRef.current) {
      playUiSound('navigation');
    }
    setSelectedOption(tab);
    selectedRef.current = tab;
    if (pillWidthRef.current > 0) animateChip(tab, pillWidthRef.current);
    onChange(tab);
  };

  const getIcon = (tab: NavTab) => {
    switch (tab) {
      case 'home':
        return <HomeIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'customize':
        return <CustomizeIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'themes':
        return <ThemesIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'settings':
        return <SettingsIcon width={ICON_SIZE} height={ICON_SIZE} />;
    }
  };

  return (
    <View style={styles.chromeRoot} pointerEvents="box-none">
      <BottomNavGradient
        height={BOTTOM_NAV_FADE_HEIGHT}
        bottom={gradientBottom}
        color={gradientColor}
        width={windowWidth}
      />
      <View style={[styles.container, { bottom: navBottom }]}>
        <View style={[styles.pill, { backgroundColor: pillBg }]} onLayout={handlePillLayout}>
          {chipLayout && (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.chip,
                  {
                    left: chipLayout.chipBaseLeft,
                    width: chipLayout.chipWidth,
                    backgroundColor: chipBg,
                    transform: [
                      { translateX: chipTranslateX },
                      { scale: chipScale },
                    ],
                  },
                ]}
              />

              {NAV_TABS.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={styles.slot}
                  onPress={() => handleSelect(tab)}
                  activeOpacity={0.65}
                  testID={`bottom-nav-${tab}`}
                >
                  {getIcon(tab)}
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

type LaunchpadCardProps = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  titleFontFamily?: string;
  radius?: number;
  onPress?: () => void;
  position?: 'top' | 'mid' | 'bottom' | 'solo';
};

function LaunchpadCard({
  icon,
  title,
  description,
  titleFontFamily,
  radius = CARD_R,
  onPress,
  position = 'solo',
}: LaunchpadCardProps) {
  const positionStyle =
    position === 'top'
      ? styles.stackItemTop
      : position === 'mid'
        ? styles.stackItemMid
        : position === 'bottom'
          ? styles.stackItemBottom
          : styles.stackItemSolo;

  const content = (
    <View style={styles.linkRow}>
      <View style={styles.launchpadIconWrap}>{icon}</View>
      <View style={styles.linkTextWrap}>
        <Text style={[styles.rowTitle, titleFontFamily ? {fontFamily: titleFontFamily} : null]}>
          {title}
        </Text>
        {description ? <Text style={styles.rowSub}>{description}</Text> : null}
      </View>
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={[
        styles.stackItem,
        positionStyle,
        {borderRadius: radius},
        styles.launchpadPressable,
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.stackItem, positionStyle, {borderRadius: radius}]}>
      {content}
    </View>
  );
}

function SetupScreen() {
  const [tab, setTab] = useState<NavTab>('home');
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [showLanguageLayout, setShowLanguageLayout] = useState(false);
  const { animatedStyle, transitionTo } = useScreenTransition();

  const changeTab = (next: NavTab) => {
    if (next === tab) {
      return;
    }
    transitionTo(() => setTab(next));
  };

  const openAiConfig = () => {
    transitionTo(() => setShowAiConfig(true));
  };

  const closeAiConfig = () => {
    transitionTo(() => setShowAiConfig(false));
  };

  const openLanguageLayout = () => {
    transitionTo(() => setShowLanguageLayout(true));
  };

  const closeLanguageLayout = () => {
    transitionTo(() => setShowLanguageLayout(false));
  };

  if (showAiConfig) {
    return (
      <View style={styles.setupRoot}>
        <AiConfigScreen onBack={closeAiConfig} />
      </View>
    );
  }

  if (showLanguageLayout) {
    return (
      <View style={styles.setupRoot}>
        <LanguageLayoutScreen onBack={closeLanguageLayout} />
      </View>
    );
  }

  const screenForTab = (): React.ReactNode => {
    if (tab === 'settings') {
      return (
        <GeneralSettingsScreen
          onBack={() => changeTab('home')}
        />
      );
    }
    if (tab === 'customize') {
      return <CustomizeScreen onBack={() => changeTab('home')} />;
    }
    if (tab === 'themes') {
      return <ThemesScreen onBack={() => changeTab('home')} />;
    }
    return (
      <LaunchpadScreen
        onOpenAiConfig={openAiConfig}
        onOpenLanguageLayout={openLanguageLayout}
      />
    );
  };

  return (
    <View style={styles.setupRoot}>
      <Animated.View style={[styles.setupScreen, animatedStyle]}>
        {screenForTab()}
      </Animated.View>
      <BottomNavigation value={tab} onChange={changeTab} />
    </View>
  );
}

function LaunchpadScreen({
  onOpenAiConfig,
  onOpenLanguageLayout,
}: {
  onOpenAiConfig: () => void;
  onOpenLanguageLayout: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Launchpad</Text>

        <View style={styles.testSection}>
          <View style={styles.testInputBox}>
            <TextInput
              style={styles.testInputField}
              placeholder="TEST KEYBOARD HERE"
              placeholderTextColor="#000000"
              multiline
            />
          </View>

          <View style={styles.configRow}>
            <Pressable
              onPress={onOpenAiConfig}
              style={[styles.configCard, styles.configCardLeft]}
            >
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                AI CONFIG
              </Text>
              <View style={styles.configIconBottomLeft}>
                <AiConfigIcon width={CONFIG_AI_W} height={CONFIG_AI_H} />
              </View>
            </Pressable>

            <Pressable
              onPress={() => keyboardBridge.openInputMethodSettings()}
              style={[styles.configCard, styles.configCardRight]}
            >
              <View style={styles.configIconTopRight}>
                <KeyboardPermIcon width={CONFIG_PERM_SIZE} height={CONFIG_PERM_SIZE} />
              </View>
              <View style={styles.configLabelBottomLeft}>
                <Text style={styles.configLabel}>KEYBOARD</Text>
                <Text style={styles.configLabel}>PERMS</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.stack}>
          <LaunchpadCard
            icon={<LanguageLayoutIcon width={HOME_ICON} height={HOME_ICON} color={C.text} />}
            title="Language & layout"
            titleFontFamily="FragmentMono"
            radius={18}
            onPress={onOpenLanguageLayout}
            position="solo"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [hydratingOnboarding, setHydratingOnboarding] = useState(true);
  const [licensePhase, setLicensePhase] = useState<
    'checking_cache' | 'activating' | PlayLicenseStatus
  >('checking_cache');
  const [fontsLoaded] = useFonts({
    FragmentMono: require('./assets/FragmentMono-Regular.ttf'),
    Geist: require('./assets/Geist-VariableFont_wght.ttf'),
    Inter: require('./assets/Inter_24pt-Regular.ttf'),
  });

  const runLicenseCheck = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setLicensePhase('licensed');
      return;
    }
    try {
      const cached = await isPlayLicenseCached();
      if (cached) {
        setLicensePhase('licensed');
        return;
      }
      setLicensePhase('activating');
      const result = await ensurePlayLicensed();
      setLicensePhase(result);
    } catch {
      setLicensePhase('needs_network');
    }
  }, []);

  useEffect(() => {
    void runLicenseCheck();
  }, [runLicenseCheck]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const v = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
        setOnboardingComplete(v === '1');
      } catch {
        // If storage fails for any reason, fall back to showing onboarding.
        setOnboardingComplete(false);
      } finally {
        setHydratingOnboarding(false);
      }
    };
    hydrate();
  }, []);

  if (licensePhase === 'checking_cache' || licensePhase === 'activating') {
    return (
      <SafeAreaProvider>
        <LicenseGateScreen
          status="needs_network"
          checking
        />
      </SafeAreaProvider>
    );
  }

  if (licensePhase === 'unlicensed' || licensePhase === 'needs_network') {
    return (
      <SafeAreaProvider>
        <LicenseGateScreen
          status={licensePhase}
          onRetry={() => {
            setLicensePhase('activating');
            void runLicenseCheck();
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {hydratingOnboarding ? (
        <View style={styles.safeArea} />
      ) : onboardingComplete ? (
        <SetupScreen />
      ) : (
        <OnboardingScreen
          fontsLoaded={fontsLoaded}
          onComplete={async () => {
            try {
              await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, '1');
            } finally {
              setOnboardingComplete(true);
            }
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  setupRoot: {
    flex: 1,
    backgroundColor: C.bg,
  },
  setupScreen: {
    flex: 1,
    backgroundColor: C.bg,
  },
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
    letterSpacing: TEXT_KERNING,
  },
  keyboardShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: CARD_R,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
  },
  keyboardShortcutSpaced: {
    marginBottom: 20,
  },
  keyboardShortcutIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardShortcutText: {
    flex: 1,
    gap: 2,
  },
  keyboardShortcutTitle: {
    fontSize: 17,
    color: C.text,
    fontWeight: '600',
  },
  keyboardShortcutSub: {
    fontSize: 13,
    color: C.sub,
    lineHeight: 18,
  },
  keyboardShortcutChevron: {
    fontSize: 28,
    color: C.sub,
    lineHeight: 28,
    marginTop: -2,
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
  topRightSettingsLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: TEXT_KERNING,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  cardTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  step: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  fieldHint: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 18,
  },
  secretInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  savedMessage: {
    color: '#4ADE80',
    fontSize: 13,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  debugInput: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    color: C.text,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  debugOutput: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#f8f8fa',
    color: C.text,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  debugMeta: {
    color: C.sub,
    fontSize: 13,
    textAlign: 'center',
  },
  debugError: {
    color: '#DC2626',
    fontSize: 13,
    lineHeight: 18,
  },
  pinInput: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    paddingHorizontal: 16,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  pinStatus: {
    color: C.sub,
    fontSize: 13,
    textAlign: 'center',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: C.sub,
    fontSize: 13,
  },
  themeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  themeToggleText: {
    flex: 1,
    gap: 4,
  },
  providerOption: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    backgroundColor: C.bg,
  },
  providerOptionSelected: {
    borderColor: C.text,
  },
  providerOptionDisabled: {
    opacity: 0.5,
  },
  providerOptionTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },

  // Reference-design card stack styles (HomeDockScreen.tsx)
  stack: {
    marginBottom: 12,
  },
  stackItem: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
  },
  stackItemTop: {
    borderTopLeftRadius: CARD_R,
    borderTopRightRadius: CARD_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
    paddingVertical: 4,
  },
  stackItemBottom: {
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: CARD_R,
    borderBottomRightRadius: CARD_R,
    paddingVertical: 4,
  },
  stackItemMid: {
    borderRadius: 0,
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
    paddingVertical: 4,
  },
  stackItemSolo: {
    borderRadius: CARD_R,
    paddingVertical: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  linkTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    color: C.text,
    fontWeight: '200',
    textTransform: 'uppercase',
  },
  rowSub: {
    fontSize: 13,
    color: C.sub,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 34,
  },
  launchpadIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchpadPressable: {
    // keep pressable layout identical to stack items
  },

  testSection: {
    gap: 8,
  },
  testInputBox: {
    backgroundColor: '#DDDCDC',
    borderRadius: 24,
    padding: 12,
    minHeight: 64,
  },
  testInputField: {
    fontFamily: 'FragmentMono',
    fontSize: 15,
    color: C.text,
    textAlign: 'center',
    textAlignVertical: 'center',
    minHeight: 40,
    letterSpacing: TEXT_KERNING,
  },

  configRow: {
    flexDirection: 'row',
    gap: 8,
  },
  configCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    position: 'relative',
  },
  configCardLeft: {
    flex: 1.65,
    height: 192,
  },
  configCardRight: {
    flex: 1,
    height: 192,
  },
  configLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    lineHeight: 18,
  },
  configLabelTopLeft: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  configLabelBottomLeft: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'column',
    gap: 0,
  },
  configIconBottomLeft: {
    position: 'absolute',
    bottom: CONFIG_ICON_INSET,
    left: CONFIG_ICON_INSET,
  },
  configIconTopRight: {
    position: 'absolute',
    top: CONFIG_ICON_INSET,
    right: CONFIG_ICON_INSET,
  },

  // Bottom navigation (exact replica visuals)
  chromeRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  gradientShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  container: {
    position: 'absolute',
    left: '50%',
    marginLeft: -DOCK_WIDTH / 2,
    width: DOCK_WIDTH,
    alignItems: 'center',
    zIndex: 1,
  },
  pill: {
    width: '100%',
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING_H,
    overflow: 'visible',
  },
  chip: {
    position: 'absolute',
    top: CHIP_V_MARGIN,
    height: CHIP_HEIGHT,
    borderRadius: CHIP_RADIUS,
    zIndex: 0,
  },
  slot: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
