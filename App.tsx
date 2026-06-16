import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {useFonts} from 'expo-font';
import {
  ensureApiKeysLoaded,
  getApiKeys,
  setApiKeys,
} from './src/keyboard/settings/apiKeysStore';
import {
  ensureAiProviderLoaded,
  getAiProvider,
  setAiProvider,
  type AiProvider,
} from './src/keyboard/settings/aiProviderStore';
import {
  ensureGemmaModelDownloaded,
  isOnDeviceAiSupported,
} from './src/keyboard/ai/gemmaModelManager';
import {
  GEMMA_DOWNLOAD_PROGRESS_EVENT,
  isGemmaModelDownloaded,
} from './src/keyboard/ai/gemmaBridge';
import {runAiDebugPrompt} from './src/keyboard/ai/aiDebugService';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
import ClipboardIcon from './assets/plugins/clipboard.svg';
import TranslateIcon from './assets/plugins/translate.svg';
import EssentialsIcon from './assets/plugins/essentials.svg';
import CalculatorIcon from './assets/plugins/calculator.svg';
import AutocorrectIcon from './assets/plugins/autocorrect.svg';
import GestureIcon from './assets/gesture.svg';
import EmojiIcon from './assets/emoji.svg';
import ArtificialIcon from './assets/Artificial.svg';
import VoiceIcon from './assets/graphic_eq.svg';
import LinkIcon from './assets/Link.svg';
import SymbolsIcon from './assets/symbols.svg';
import ItemsIcon from './assets/items.svg';
import BackIcon from './assets/back.svg';
import AiConfigIcon from './assets/ai_config.svg';
import KeyboardPermIcon from './assets/keyboard_perm.svg';

import HomeIcon from './assets/home.svg';
import CustomizeIcon from './assets/customize.svg';
import ThemesIcon from './assets/themes.svg';
import SettingsIcon from './assets/settings.svg';

import { CustomizeScreen, ThemesScreen } from './KeyboardCustomization';

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
const GRADIENT_DARK    = '#0f0f10';

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

// Local stubs (no external haptics/sounds modules in this demo)
const hapticTap = () => {};
const playUiSound = (_name?: string) => {};

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
      chipTranslateX.setValue(getChipTranslateX(value, pillWidthRef.current));
    }
  }, [value, chipTranslateX]);

  const handlePillLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w === pillWidthRef.current) return;
    pillWidthRef.current = w;
    setPillWidth(w);
    chipTranslateX.setValue(getChipTranslateX(selectedRef.current, w));
  };

  const handleSelect = (tab: NavTab) => {
    void hapticTap();
    if (tab !== selectedRef.current) void playUiSound('navigation');
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
  description: string;
  onPress?: () => void;
  position?: 'top' | 'mid' | 'bottom' | 'solo';
};

function LaunchpadCard({
  icon,
  title,
  description,
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
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{description}</Text>
      </View>
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={[styles.stackItem, positionStyle, styles.launchpadPressable]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.stackItem, positionStyle]}>{content}</View>
  );
}

function AiProviderCard() {
  const [provider, setProviderState] = useState<AiProvider>('gemini');
  const [loading, setLoading] = useState(true);
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const onDeviceSupported = isOnDeviceAiSupported();

  useEffect(() => {
    void ensureAiProviderLoaded().then(async () => {
      setProviderState(getAiProvider());
      if (onDeviceSupported) {
        setModelDownloaded(await isGemmaModelDownloaded());
      }
      setLoading(false);
    });
  }, [onDeviceSupported]);

  const handleProviderChange = async (next: AiProvider) => {
    if (next === 'on_device' && !onDeviceSupported) {
      return;
    }
    setProviderState(next);
    await setAiProvider(next);
    setStatusMessage(
      next === 'on_device'
        ? 'On-device AI selected. Download the model if you have not already.'
        : 'Cloud Gemini selected.',
    );
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDownloadModel = async () => {
    setDownloadProgress(0);
    setStatusMessage(null);
    const subscription = DeviceEventEmitter.addListener(
      GEMMA_DOWNLOAD_PROGRESS_EVENT,
      (progress: number) => {
        setDownloadProgress(progress);
      },
    );
    try {
      await ensureGemmaModelDownloaded(progress => {
        setDownloadProgress(progress);
      });
      setModelDownloaded(true);
      setStatusMessage('On-device model downloaded.');
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Model download failed.',
      );
    } finally {
      subscription.remove();
      setDownloadProgress(null);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>AI provider</Text>
      <Text style={styles.hint}>
        Choose cloud Gemini or on-device Gemma 3 for Translate, Rewrite, and
        voice cleanup. On-device runs locally on Android after you download the
        model (~550 MB).
      </Text>

      <Pressable
        style={[
          styles.providerOption,
          provider === 'gemini' && styles.providerOptionSelected,
        ]}
        onPress={() => {
          void handleProviderChange('gemini');
        }}
        disabled={loading}>
        <Text style={styles.providerOptionTitle}>Cloud (Gemini)</Text>
        <Text style={styles.fieldHint}>
          Uses your Google Gemini API key. Requires internet.
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.providerOption,
          provider === 'on_device' && styles.providerOptionSelected,
          !onDeviceSupported && styles.providerOptionDisabled,
        ]}
        onPress={() => {
          void handleProviderChange('on_device');
        }}
        disabled={loading || !onDeviceSupported}>
        <Text style={styles.providerOptionTitle}>On-device (Gemma 3)</Text>
        <Text style={styles.fieldHint}>
          {onDeviceSupported
            ? modelDownloaded
              ? 'Model downloaded. Runs offline after first load.'
              : 'Download required before use.'
            : 'Only available on Android.'}
        </Text>
      </Pressable>

      {provider === 'on_device' && onDeviceSupported ? (
        <>
          {downloadProgress !== null ? (
            <Text style={styles.fieldHint}>
              Downloading… {Math.round(downloadProgress * 100)}%
            </Text>
          ) : null}
          {!modelDownloaded ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                void handleDownloadModel();
              }}
              disabled={downloadProgress !== null}>
              <Text style={styles.primaryButtonText}>Download model</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {statusMessage ? (
        <Text style={styles.savedMessage}>{statusMessage}</Text>
      ) : null}
    </View>
  );
}

function AiDebugCard() {
  const [prompt, setPrompt] = useState(
    'Say hello in one short sentence and include the word TypeBase.',
  );
  const [wrapGemma, setWrapGemma] = useState(true);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [output, setOutput] = useState('');
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void ensureAiProviderLoaded().then(() => {
      const current = getAiProvider();
      setProvider(current);
      setWrapGemma(current === 'on_device');
    });
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setOutput('');
    setMeta(null);
    setStatus('Starting…');
    try {
      const result = await runAiDebugPrompt(prompt, {
        wrapGemma,
        onStatus: setStatus,
      });
      setOutput(result.output);
      setProvider(result.provider);
      setMeta(
        `${result.provider === 'on_device' ? 'On-device Gemma' : 'Cloud Gemini'} · ${result.elapsedMs} ms`,
      );
      setStatus(null);
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : 'AI request failed.';
      setError(message);
      setStatus(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>AI debug</Text>
      <Text style={styles.hint}>
        Send a test prompt through the currently selected AI provider. Uses{' '}
        {provider === 'on_device' ? 'on-device Gemma' : 'cloud Gemini'}.
      </Text>

      <Text style={styles.fieldLabel}>Prompt</Text>
      <TextInput
        style={styles.debugInput}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Enter a prompt..."
        placeholderTextColor="#64748B"
        multiline
        editable={!running}
      />

      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.fieldLabel}>Gemma instruct wrap</Text>
          <Text style={styles.fieldHint}>
            Wraps prompt with &lt;start_of_turn&gt; tags for on-device Gemma.
          </Text>
        </View>
        <Switch
          value={wrapGemma}
          onValueChange={setWrapGemma}
          disabled={running}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      <Pressable
        style={[styles.primaryButton, running && styles.primaryButtonDisabled]}
        onPress={() => {
          void handleRun();
        }}
        disabled={running || !prompt.trim()}>
        {running ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Run prompt</Text>
        )}
      </Pressable>

      {status ? <Text style={styles.debugMeta}>{status}</Text> : null}
      {meta ? <Text style={styles.debugMeta}>{meta}</Text> : null}
      {error ? <Text style={styles.debugError}>{error}</Text> : null}

      {output ? (
        <>
          <Text style={styles.fieldLabel}>Response</Text>
          <TextInput
            style={styles.debugOutput}
            value={output}
            multiline
            editable={false}
          />
        </>
      ) : null}
    </View>
  );
}

function ApiKeysCard() {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [speechmaticsApiKey, setSpeechmaticsApiKey] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureApiKeysLoaded().then(() => {
      const keys = getApiKeys();
      setGeminiApiKey(keys.geminiApiKey);
      setSpeechmaticsApiKey(keys.speechmaticsApiKey);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await setApiKeys({geminiApiKey, speechmaticsApiKey});
    setSavedMessage('API keys saved on this device.');
    setTimeout(() => setSavedMessage(null), 2500);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>API keys</Text>
      <Text style={styles.hint}>
        When using cloud Gemini, Translate, Rewrite, and voice cleanup need your
        Google Gemini key. Speechmatics is still used for voice transcription.
        Keys are stored locally on this device.
      </Text>

      <Text style={styles.fieldLabel}>Google Gemini API key</Text>
      <Text style={styles.fieldHint}>
        Used for Translate and Rewrite. Get one at aistudio.google.com/apikey
      </Text>
      <TextInput
        style={styles.secretInput}
        placeholder="AIza..."
        placeholderTextColor="#64748B"
        value={geminiApiKey}
        onChangeText={setGeminiApiKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!loading}
      />

      <Text style={styles.fieldLabel}>Speechmatics API key</Text>
      <Text style={styles.fieldHint}>
        Used for voice typing. Get one at portal.speechmatics.com
      </Text>
      <TextInput
        style={styles.secretInput}
        placeholder="Your Speechmatics key"
        placeholderTextColor="#64748B"
        value={speechmaticsApiKey}
        onChangeText={setSpeechmaticsApiKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!loading}
      />

      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          void handleSave();
        }}
        disabled={loading}>
        <Text style={styles.primaryButtonText}>Save API keys</Text>
      </Pressable>

      {savedMessage ? (
        <Text style={styles.savedMessage}>{savedMessage}</Text>
      ) : null}
    </View>
  );
}

function SetupScreen() {
  const [tab, setTab] = useState<NavTab>('home');

  const screenForTab = (): React.ReactNode => {
    if (tab === 'settings') {
      return (
        <SettingsScreen
          onBack={() => setTab('home')}
          onOpenKeyboard={() => setTab('customize')}
        />
      );
    }
    if (tab === 'customize') {
      return <CustomizeScreen onBack={() => setTab('home')} />;
    }
    if (tab === 'themes') {
      return <ThemesScreen onBack={() => setTab('home')} />;
    }
    return (
      <LaunchpadScreen
        onOpenSettings={() => setTab('settings')}
        onOpenKeyboard={() => setTab('customize')}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {screenForTab()}
      <BottomNavigation value={tab} onChange={setTab} />
    </View>
  );
}

function LaunchpadScreen({
  onOpenSettings,
  onOpenKeyboard,
}: {
  onOpenSettings: () => void;
  onOpenKeyboard: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onOpenSettings}>
          <ItemsIcon width={18} height={18} color={C.text} />
          <Text style={styles.topRightSettingsLabel}>Settings</Text>
        </Pressable>
      </View>
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
            <View style={[styles.configCard, styles.configCardLeft]}>
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                AI CONFIG
              </Text>
              <View style={styles.configIconBottomLeft}>
                <AiConfigIcon width={CONFIG_AI_W} height={CONFIG_AI_H} />
              </View>
            </View>

            <View style={[styles.configCard, styles.configCardRight]}>
              <View style={styles.configIconTopRight}>
                <KeyboardPermIcon width={CONFIG_PERM_SIZE} height={CONFIG_PERM_SIZE} />
              </View>
              <View style={styles.configLabelBottomLeft}>
                <Text style={styles.configLabel}>KEYBOARD</Text>
                <Text style={styles.configLabel}>PERMS</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen({
  onBack,
  onOpenKeyboard,
}: {
  onBack: () => void;
  onOpenKeyboard: () => void;
}) {
  const [pin, setPin] = useState('');
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onBack}>
          <BackIcon width={18} height={18} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enable the keyboard</Text>
          <Text style={styles.step}>1. Open Android keyboard settings</Text>
          <Text style={styles.step}>2. Enable "TypeBase Keyboard"</Text>
          <Text style={styles.step}>
            3. Switch to TypeBase when typing in any app
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => keyboardBridge.openInputMethodSettings()}>
            <Text style={styles.primaryButtonText}>Open Keyboard Settings</Text>
          </Pressable>
        </View>

        <AiProviderCard />

        <AiDebugCard />

        <ApiKeysCard />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Keyboard look & layout</Text>
          <Text style={styles.hint}>
            Tune key size, spacing, colors, and themes in the dedicated
            keyboard editor.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={onOpenKeyboard}>
            <Text style={styles.primaryButtonText}>Open keyboard editor</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Try it here</Text>
          <Text style={styles.hint}>
            After enabling TypeBase, tap below and choose TypeBase Keyboard from
            the input method picker.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Tap here to test your keyboard..."
            placeholderTextColor="#64748B"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PIN pad test</Text>
          <Text style={styles.hint}>
            Numeric fields should open the 4×4 number pad automatically. Tap ABC
            on the keyboard to switch back to letters.
          </Text>
          <TextInput
            style={styles.pinInput}
            placeholder="Enter PIN"
            placeholderTextColor="#64748B"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            autoComplete="off"
            textContentType="oneTimeCode"
          />
          <Text style={styles.pinStatus}>
            {pin.length === 0
              ? '0 / 6 digits'
              : `${pin.length} / 6 digits entered`}
          </Text>
        </View>

        <Pressable
          style={styles.linkButton}
          onPress={() =>
            Linking.openURL('https://github.com/SitePen/rn-input-extensions-blog')
          }>
          <Text style={styles.linkText}>
            Reference: SitePen RN Input Extensions
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    FragmentMono: require('./assets/FragmentMono-Regular.ttf'),
  });

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    void PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'TypeBase needs microphone access for voice typing.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      },
    );
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SetupScreen />
    </SafeAreaProvider>
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
