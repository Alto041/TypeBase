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
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {useFonts} from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AiConfigIcon from './assets/ai_config.svg';
import LanguageLayoutIcon from './assets/layout.svg';
import EssentialsIcon from './assets/plugins/essentials.svg';
import NumberRowIcon from './assets/123.svg';
import KeyboardPermIcon from './assets/keyboard_perm.svg';

import HomeIcon from './assets/home.svg';
import CustomizeIcon from './assets/customize.svg';
import ThemesIcon from './assets/themes.svg';
import SettingsIcon from './assets/settings.svg';
import ActionsIcon from './assets/actions.svg';
import AddIcon from './assets/add.svg';
import RemoveIcon from './assets/remove.svg';
import PremiumIcon from './assets/premium.svg';

import { CustomizeScreen, ThemesScreen } from './KeyboardCustomization';
import { GeneralSettingsScreen } from './GeneralSettingsScreen';
import { ConsoleSettingsScreen } from './ConsoleSettingsScreen';
import { EngineStatsScreen } from './EngineStatsScreen';
import { TapMapScreen } from './TapMapScreen';
import { TouchIntelligenceHitsScreen } from './TouchIntelligenceHitsScreen';
import { PersonalTypingScreen } from './PersonalTypingScreen';
import { EssentialsScreen } from './EssentialsScreen';
import { MyRowScreen } from './MyRowScreen';
import { keyboardBridge } from './src/keyboard/keyboardBridge';
import { AiConfigScreen } from './AiConfigScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { LanguageLayoutScreen } from './LanguageLayoutScreen';
import {
  consumePendingPremiumUpgrade,
} from './src/licensing/premium';
import {PremiumProvider, usePremium} from './src/licensing/PremiumContext';
import {PremiumUpgradeScreen} from './src/licensing/PremiumUpgradeScreen';
import {ensurePlayLicensed} from './src/licensing/playLicense';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
} as const;

const CARD_R = 25;
const INNER_R = 5;

const CONFIG_AI_W = 80;
const CONFIG_AI_H = 94;
const CONFIG_PERM_SIZE = 68;
const CONFIG_ICON_INSET = 16;

const TEXT_KERNING = -0.7;
const LAUNCHPAD_ROW_GAP = 8;
const LAUNCHPAD_ROW_ICON = 20;

function launchpadRowCardStyle(index: number, total: number) {
  if (total <= 1) {
    return [styles.lpRowCard, styles.lpFirstCard, styles.lpLastCard];
  }
  if (index === 0) {
    return [styles.lpRowCard, styles.lpFirstCard];
  }
  if (index === total - 1) {
    return [styles.lpRowCard, styles.lpLastCard];
  }
  return [styles.lpRowCard, styles.lpMiddleCard];
}

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
import { ensureUiSoundsLoaded } from './src/app/uiSoundsStore';
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

function SetupScreen() {
  const [tab, setTab] = useState<NavTab>('home');
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [showLanguageLayout, setShowLanguageLayout] = useState(false);
  const [showConsoleSettings, setShowConsoleSettings] = useState(false);
  const [showEngineStats, setShowEngineStats] = useState(false);
  const [showTapMap, setShowTapMap] = useState(false);
  const [showTouchHits, setShowTouchHits] = useState(false);
  const [showPersonalTyping, setShowPersonalTyping] = useState(false);
  const [showEssentials, setShowEssentials] = useState(false);
  const [showMyRow, setShowMyRow] = useState(false);
  const [showPremiumUpgrade, setShowPremiumUpgrade] = useState(false);
  const { animatedStyle, transitionTo } = useScreenTransition();

  const changeTab = (next: NavTab) => {
    if (next === tab) {
      return;
    }
    transitionTo(() => {
      setTab(next);
      setShowConsoleSettings(false);
      setShowEngineStats(false);
      setShowTapMap(false);
      setShowTouchHits(false);
      setShowPersonalTyping(false);
      setShowEssentials(false);
      setShowMyRow(false);
    });
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

  const openConsoleSettings = () => {
    transitionTo(() => setShowConsoleSettings(true));
  };

  const closeConsoleSettings = () => {
    transitionTo(() => setShowConsoleSettings(false));
  };

  const openEngineStats = () => {
    transitionTo(() => setShowEngineStats(true));
  };

  const closeEngineStats = () => {
    transitionTo(() => setShowEngineStats(false));
  };

  const openTapMap = () => {
    transitionTo(() => setShowTapMap(true));
  };

  const closeTapMap = () => {
    transitionTo(() => setShowTapMap(false));
  };

  const openTouchHits = () => {
    transitionTo(() => setShowTouchHits(true));
  };

  const closeTouchHits = () => {
    transitionTo(() => setShowTouchHits(false));
  };

  const openPersonalTyping = () => {
    transitionTo(() => setShowPersonalTyping(true));
  };

  const closePersonalTyping = () => {
    transitionTo(() => setShowPersonalTyping(false));
  };

  const openEssentials = () => {
    transitionTo(() => setShowEssentials(true));
  };

  const closeEssentials = () => {
    transitionTo(() => setShowEssentials(false));
  };

  const openMyRow = () => {
    transitionTo(() => setShowMyRow(true));
  };

  const closeMyRow = () => {
    transitionTo(() => setShowMyRow(false));
  };

  const openPremiumUpgrade = () => {
    transitionTo(() => setShowPremiumUpgrade(true));
  };

  const closePremiumUpgrade = () => {
    transitionTo(() => setShowPremiumUpgrade(false));
  };

  useEffect(() => {
    const checkPendingPremium = async () => {
      const pending = await consumePendingPremiumUpgrade();
      if (pending) {
        openPremiumUpgrade();
      }
    };
    void checkPendingPremium();
  }, []);

  if (showPremiumUpgrade) {
    return (
      <View style={styles.setupRoot}>
        <PremiumUpgradeScreen onBack={closePremiumUpgrade} />
      </View>
    );
  }

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

  if (showConsoleSettings) {
    return (
      <View style={styles.setupRoot}>
        <ConsoleSettingsScreen onBack={closeConsoleSettings} />
      </View>
    );
  }

  if (showEngineStats) {
    return (
      <View style={styles.setupRoot}>
        <EngineStatsScreen onBack={closeEngineStats} />
      </View>
    );
  }

  if (showTapMap) {
    return (
      <View style={styles.setupRoot}>
        <TapMapScreen onBack={closeTapMap} />
      </View>
    );
  }

  if (showTouchHits) {
    return (
      <View style={styles.setupRoot}>
        <TouchIntelligenceHitsScreen onBack={closeTouchHits} />
      </View>
    );
  }

  if (showEssentials) {
    return (
      <View style={styles.setupRoot}>
        <EssentialsScreen onBack={closeEssentials} onOpenPremium={openPremiumUpgrade} />
      </View>
    );
  }

  if (showMyRow) {
    return (
      <View style={styles.setupRoot}>
        <MyRowScreen onBack={closeMyRow} onOpenPremium={openPremiumUpgrade} />
      </View>
    );
  }

  if (showPersonalTyping) {
    return (
      <View style={styles.setupRoot}>
        <PersonalTypingScreen onBack={closePersonalTyping} />
      </View>
    );
  }

  const screenForTab = (): React.ReactNode => {
    if (tab === 'settings') {
      return (
        <GeneralSettingsScreen
          onBack={() => changeTab('home')}
          onOpenConsole={openConsoleSettings}
          onOpenEngineStats={openEngineStats}
          onOpenTapMap={openTapMap}
          onOpenTouchHits={openTouchHits}
          onOpenPersonalTyping={openPersonalTyping}
          onOpenPremium={openPremiumUpgrade}
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
        onOpenEssentials={openEssentials}
        onOpenMyRow={openMyRow}
        onOpenPremium={openPremiumUpgrade}
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

const QUICK_ACTIONS_ADD_SIZE = 14;
const QUICK_ACTIONS_REMOVE_SIZE = 12;

function QuickActionsToggleIcon({expanded}: {expanded: boolean}) {
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  const addStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{scale: 0.9 + (1 - progress.value) * 0.1}],
  }));

  const removeStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{scale: 0.9 + progress.value * 0.1}],
  }));

  return (
    <View style={styles.quickActionsToggle}>
      <Reanimated.View style={[styles.quickActionsToggleIcon, addStyle]}>
        <AddIcon
          width={QUICK_ACTIONS_ADD_SIZE}
          height={QUICK_ACTIONS_ADD_SIZE}
          color={C.sub}
          fill={C.sub}
        />
      </Reanimated.View>
      <Reanimated.View style={[styles.quickActionsToggleIcon, removeStyle]}>
        <RemoveIcon
          width={QUICK_ACTIONS_REMOVE_SIZE}
          height={QUICK_ACTIONS_REMOVE_SIZE}
          color={C.sub}
          fill={C.sub}
        />
      </Reanimated.View>
    </View>
  );
}

function LaunchpadScreen({
  onOpenAiConfig,
  onOpenLanguageLayout,
  onOpenEssentials,
  onOpenMyRow,
  onOpenPremium,
}: {
  onOpenAiConfig: () => void;
  onOpenLanguageLayout: () => void;
  onOpenEssentials: () => void;
  onOpenMyRow: () => void;
  onOpenPremium: () => void;
}) {
  const {isPremium, loading} = usePremium();
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false);

  const launchpadRows = [
    ...(!loading && isPremium
      ? [
          {
            key: 'premium',
            icon: (
              <PremiumIcon
                width={LAUNCHPAD_ROW_ICON}
                height={LAUNCHPAD_ROW_ICON}
                color={C.text}
              />
            ),
            title: 'Typebase Premium',
            showPremiumDot: true,
            onPress: onOpenPremium,
          },
        ]
      : []),
    {
      key: 'my-row',
      icon: (
        <NumberRowIcon
          width={LAUNCHPAD_ROW_ICON}
          height={LAUNCHPAD_ROW_ICON}
          color={C.text}
        />
      ),
      title: 'My Row',
      onPress: onOpenMyRow,
    },
    {
      key: 'snippets',
      icon: (
        <EssentialsIcon
          width={LAUNCHPAD_ROW_ICON}
          height={LAUNCHPAD_ROW_ICON}
          color={C.text}
        />
      ),
      title: 'Essentials',
      onPress: onOpenEssentials,
    },
    {
      key: 'language',
      icon: (
        <LanguageLayoutIcon
          width={LAUNCHPAD_ROW_ICON}
          height={LAUNCHPAD_ROW_ICON}
          color={C.text}
        />
      ),
      title: 'Language & layout',
      onPress: onOpenLanguageLayout,
    },
  ];

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
              onPress={() => {
                onOpenAiConfig();
              }}
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

        {!loading && !isPremium ? (
          <Pressable
            style={[styles.lpRowCard, styles.lpUnlockCard, {marginBottom: LAUNCHPAD_ROW_GAP}]}
            onPress={onOpenPremium}>
            <View style={styles.lpRowInner}>
              <Text style={styles.lpRowTitle}>Unlock TypeBase Premium</Text>
              <Text style={styles.lpRowValue}>→</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.lpMainStack}>
          {launchpadRows.map((row, index) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              style={launchpadRowCardStyle(index, launchpadRows.length)}>
              <View style={styles.lpRowInner}>
                {row.icon}
                <Text style={styles.lpRowTitle}>{row.title}</Text>
                {'showPremiumDot' in row && row.showPremiumDot ? (
                  <View style={styles.lpPremiumDot} accessibilityLabel="Premium active" />
                ) : 'trailing' in row && row.trailing ? (
                  <Text style={styles.lpRowValue}>{row.trailing}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={[styles.lpMainStack, {marginTop: LAUNCHPAD_ROW_GAP}]}>
          <View style={[styles.lpRowCard, styles.lpSoloCard]}>
            <Pressable
              onPress={() => setQuickActionsExpanded(current => !current)}
              style={styles.lpRowInner}>
              <ActionsIcon
                width={LAUNCHPAD_ROW_ICON}
                height={LAUNCHPAD_ROW_ICON}
                color={C.text}
                fill={C.text}
              />
              <Text style={styles.lpRowTitle}>Quick Actions</Text>
              <View style={styles.lpRowTrailing}>
                <QuickActionsToggleIcon expanded={quickActionsExpanded} />
              </View>
            </Pressable>
            {quickActionsExpanded ? (
              <View style={styles.quickActionsBody}>
                <View style={styles.quickActionRow}>
                  <Text style={styles.quickActionKey}>,</Text>
                  <Text style={styles.quickActionText}>Hold · Rewrite</Text>
                </View>
                <View style={styles.quickActionRow}>
                  <Text style={styles.quickActionKey}>.</Text>
                  <Text style={styles.quickActionText}>Hold · Clipboard</Text>
                </View>
                <View style={styles.quickActionRow}>
                  <Text style={styles.quickActionKey}>Shift</Text>
                  <Text style={styles.quickActionText}>A C V X</Text>
                </View>
                <View style={styles.quickActionRow}>
                  <Text style={styles.quickActionKey}>Space</Text>
                  <Text style={styles.quickActionText}>Long-press</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [hydratingOnboarding, setHydratingOnboarding] = useState(true);
  const [fontsLoaded] = useFonts({
    FragmentMono: require('./assets/FragmentMono-Regular.ttf'),
    Geist: require('./assets/Geist-VariableFont_wght.ttf'),
    Inter: require('./assets/Inter_24pt-Regular.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'android') {
      void ensurePlayLicensed().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      try {
        await ensureUiSoundsLoaded();
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

  return (
    <SafeAreaProvider>
      <PremiumProvider>
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
              } catch {
                // ignore
              }
              setOnboardingComplete(true);
            }}
          />
        )}
      </PremiumProvider>
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
  quickActionsBody: {
    marginTop: 4,
    paddingTop: 6,
    paddingHorizontal: 2,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  quickActionsToggle: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionsToggleIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  quickActionKey: {
    minWidth: 54,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#111111',
    color: '#FFFFFF',
    fontFamily: 'FragmentMono',
    fontSize: 13,
    textAlign: 'center',
  },
  quickActionText: {
    marginLeft: 10,
    flex: 1,
    color: C.text,
    fontSize: 13,
    fontFamily: 'FragmentMono',
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

  // Launchpad rows — match GeneralSettingsScreen card stack
  lpMainStack: {
    gap: 4,
    marginBottom: LAUNCHPAD_ROW_GAP,
  },
  lpRowCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  lpUnlockCard: {
    borderRadius: 20,
  },
  lpSoloCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  lpFirstCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  lpMiddleCard: {
    borderRadius: 10,
  },
  lpLastCard: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  lpRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
  },
  lpRowTitle: {
    color: C.text,
    fontSize: 16,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  lpRowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    marginLeft: 'auto',
    letterSpacing: TEXT_KERNING,
  },
  lpRowTrailing: {
    marginLeft: 'auto',
  },
  lpPremiumDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2CC642',
    marginLeft: 'auto',
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
