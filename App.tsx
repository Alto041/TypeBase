import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
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
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
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
import {
  ensureThemeLoaded,
  getKeyboardColorScheme,
  getKeyboardDesign,
  getKeyboardCustomTheme,
  setKeyboardColorScheme,
  setKeyboardDesign,
  setKeyboardCustomTheme,
} from './src/keyboard/settings/themeStore';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  setKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {DEFAULT_KEYBOARD_LAYOUT_SETTINGS} from './src/keyboard/theme';
import type {KeyboardLayoutSettings} from './src/keyboard/theme';

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

function LayoutStepperRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));

  return (
    <View style={styles.layoutStepperRow}>
      <View style={styles.layoutStepperText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepperButton, disabled && styles.stepperButtonDisabled]}
          onPress={decrease}
          disabled={disabled || value <= min}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value} dp</Text>
        <Pressable
          style={[styles.stepperButton, disabled && styles.stepperButtonDisabled]}
          onPress={increase}
          disabled={disabled || value >= max}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function KeyboardLayoutCard() {
  const [layout, setLayout] = useState<KeyboardLayoutSettings>(
    DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureLayoutLoaded().then(() => {
      setLayout(getKeyboardLayoutSettings());
      setLoading(false);
    });
  }, []);

  const update = (key: keyof KeyboardLayoutSettings, value: number) => {
    setLayout(current => ({...current, [key]: value}));
    void updateKeyboardLayoutSetting(key, value);
  };

  const handleReset = () => {
    setLayout(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
    void setKeyboardLayoutSettings(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Keyboard layout</Text>
      <Text style={styles.hint}>
        Tune key size and spacing. Changes apply to the TypeBase keyboard
        immediately.
      </Text>

      <LayoutStepperRow
        label="Key height"
        hint="How tall each letter key is."
        value={layout.keyHeight}
        min={40}
        max={64}
        step={2}
        disabled={loading}
        onChange={value => update('keyHeight', value)}
      />

      <View style={styles.themeDivider} />

      <LayoutStepperRow
        label="Key gap"
        hint="Horizontal space between keys on a row."
        value={layout.keyGap}
        min={0}
        max={12}
        step={1}
        disabled={loading}
        onChange={value => update('keyGap', value)}
      />

      <View style={styles.themeDivider} />

      <LayoutStepperRow
        label="Row gap"
        hint="Vertical space between keyboard rows."
        value={layout.keyRowMargin}
        min={0}
        max={20}
        step={1}
        disabled={loading}
        onChange={value => update('keyRowMargin', value)}
      />

      <Pressable
        style={styles.linkButton}
        onPress={handleReset}
        disabled={loading}>
        <Text style={styles.linkText}>Reset layout to defaults</Text>
      </Pressable>
    </View>
  );
}

function KeyboardThemeCard() {
  const [isDark, setIsDark] = useState(false);
  const [isQuivox, setIsQuivox] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customThemeJson, setCustomThemeJson] = useState(
    `{
  "container": "#000000",
  "pluginCard": "#07070D",
  "pluginCardSecondary": "#0D0D16",
  "borderSubtle": "#1A1A26",
  "suggestionDivider": "#2A2A3A",

  "letterKey": "#1A1A22",
  "letterKeyPressed": "#252533",
  "modifierKey": "#00C2A8",
  "modifierKeyPressed": "#009A86",
  "spaceKey": "#FFB020",
  "spaceKeyPressed": "#E79A0E",
  "enter": "#FF2D55",
  "enterPressed": "#C81F41",

  "label": "#E9EEF6",
  "spaceLabel": "#111827",
  "icon": "#E9EEF6",
  "iconMuted": "#A9B4C2",
  "iconOnEnter": "#FFFFFF",

  "essentialsAccent": "#FFB020",
  "swipeTrail": "#FFB020",
  "launcherKey": "#00C2A8",

  "chipSelectedBackground": "#00C2A8",
  "chipSelectedText": "#FFFFFF",

  "keyRipple": "rgba(255, 255, 255, 0.18)"
}`,
  );

  useEffect(() => {
    void ensureThemeLoaded().then(() => {
      setIsDark(getKeyboardColorScheme() === 'dark');
      setIsQuivox(getKeyboardDesign() === 'quivox');
      setIsCustom(getKeyboardDesign() === 'custom');
      setCustomThemeJson(getKeyboardCustomTheme());
      setLoading(false);
    });
  }, []);

  const handleDarkToggle = (enabled: boolean) => {
    setIsDark(enabled);
    void setKeyboardColorScheme(enabled ? 'dark' : 'light');
  };

  const handleQuivoxToggle = (enabled: boolean) => {
    setIsQuivox(enabled);
    if (enabled) {
      setIsCustom(false);
      void setKeyboardDesign('quivox');
      return;
    }
    if (isCustom) {
      // If custom is enabled, turning Quivox off should not change it.
      return;
    }
    void setKeyboardDesign('typebase');
  };

  const handleCustomToggle = (enabled: boolean) => {
    setIsCustom(enabled);
    if (enabled) {
      setIsQuivox(false);
      void setKeyboardDesign('custom');
    } else {
      void setKeyboardDesign('typebase');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Dark keyboard</Text>
          <Text style={styles.hint}>
            Switch the TypeBase keyboard between light and dark.
          </Text>
        </View>
        <Switch
          value={isDark}
          onValueChange={handleDarkToggle}
          disabled={loading}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      <View style={styles.themeDivider} />

      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Quivox Design</Text>
          <Text style={styles.hint}>
            Use the Quivox keyboard look — lilac keys, blue modifiers, gold space.
          </Text>
        </View>
        <Switch
          value={isQuivox}
          onValueChange={handleQuivoxToggle}
          disabled={loading || isCustom}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      <View style={styles.themeDivider} />

      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Custom Theme JSON</Text>
          <Text style={styles.hint}>
            Paste a theme palette JSON (colors + keys) and apply it.
          </Text>
        </View>
        <Switch
          value={isCustom}
          onValueChange={handleCustomToggle}
          disabled={loading}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      {isCustom ? (
        <View style={{gap: 8}}>
          <Text style={styles.fieldLabel}>Theme JSON</Text>
          <TextInput
            style={styles.input}
            value={customThemeJson}
            onChangeText={setCustomThemeJson}
            multiline
            editable={!loading}
          />
          <Pressable
            style={[
              styles.primaryButton,
              {backgroundColor: '#2563EB', marginTop: 0},
            ]}
            onPress={() => {
              try {
                // Ensure it's valid JSON before sending to native.
                JSON.parse(customThemeJson);
                void setKeyboardCustomTheme(customThemeJson);
                void setKeyboardDesign('custom');
              } catch {
                // No native-side error UI right now; we rely on this local guard.
              }
            }}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>Apply custom theme</Text>
          </Pressable>
          <Pressable
            style={[styles.linkButton, {paddingVertical: 0}]}
            onPress={() => {
              setCustomThemeJson(`{
  "container": "#000000",
  "pluginCard": "#07070D",
  "pluginCardSecondary": "#0D0D16",
  "borderSubtle": "#1A1A26",
  "suggestionDivider": "#2A2A3A",
  "letterKey": "#1A1A22",
  "letterKeyPressed": "#252533",
  "modifierKey": "#00C2A8",
  "modifierKeyPressed": "#009A86",
  "spaceKey": "#FFB020",
  "spaceKeyPressed": "#E79A0E",
  "enter": "#FF2D55",
  "enterPressed": "#C81F41",
  "label": "#E9EEF6",
  "spaceLabel": "#111827",
  "icon": "#E9EEF6",
  "iconMuted": "#A9B4C2",
  "iconOnEnter": "#FFFFFF",
  "essentialsAccent": "#FFB020",
  "swipeTrail": "#FFB020",
  "launcherKey": "#00C2A8",
  "chipSelectedBackground": "#00C2A8",
  "chipSelectedText": "#FFFFFF",
  "keyRipple": "rgba(255, 255, 255, 0.18)"
}`);
            }}
          >
            <Text style={{color: '#64748B', fontSize: 13}}>
              Reset template
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SetupScreen() {
  const [route, setRoute] = useState<'launchpad' | 'settings' | 'keyboard'>(
    'launchpad',
  );

  if (route === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setRoute('launchpad')}
        onOpenKeyboard={() => setRoute('keyboard')}
      />
    );
  }
  if (route === 'keyboard') {
    return <KeyboardSettingsScreen onBack={() => setRoute('launchpad')} />;
  }
  return (
    <LaunchpadScreen
      onOpenSettings={() => setRoute('settings')}
      onOpenKeyboard={() => setRoute('keyboard')}
    />
  );
}

function KeyboardSettingsScreen({onBack}: {onBack: () => void}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onBack}>
          <BackIcon width={18} height={18} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Keyboard</Text>

        <KeyboardLayoutCard />

        <KeyboardThemeCard />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Try it here</Text>
          <Text style={styles.hint}>
            Changes apply live. Tap below and use TypeBase Keyboard to feel the
            new layout.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Tap here to test your keyboard..."
            placeholderTextColor="#64748B"
            multiline
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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

        <Pressable
          style={styles.keyboardShortcut}
          onPress={onOpenKeyboard}>
          <View style={styles.keyboardShortcutIcon}>
            <SymbolsIcon width={HOME_ICON} height={HOME_ICON} color={C.text} />
          </View>
          <View style={styles.keyboardShortcutText}>
            <Text style={styles.keyboardShortcutTitle}>Customize keyboard</Text>
            <Text style={styles.keyboardShortcutSub}>
              Key height, gaps, themes, and more
            </Text>
          </View>
          <Text style={styles.keyboardShortcutChevron}>›</Text>
        </Pressable>

        <Pressable
          style={[styles.keyboardShortcut, styles.keyboardShortcutSpaced]}
          onPress={onOpenSettings}>
          <View style={styles.keyboardShortcutIcon}>
            <ItemsIcon width={HOME_ICON} height={HOME_ICON} color={C.text} />
          </View>
          <View style={styles.keyboardShortcutText}>
            <Text style={styles.keyboardShortcutTitle}>Settings</Text>
            <Text style={styles.keyboardShortcutSub}>
              AI provider, API keys, and keyboard setup
            </Text>
          </View>
          <Text style={styles.keyboardShortcutChevron}>›</Text>
        </Pressable>

        <View style={styles.stack}>
          <LaunchpadCard
            position="top"
            icon={<ClipboardIcon width={HOME_ICON} height={HOME_ICON} />}
            title="CLIPBOARD"
            description="Swipe clipboard history and quick picks."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<TranslateIcon width={HOME_ICON} height={HOME_ICON} />}
            title="TRANSLATE"
            description="Instant translate suggestions and quick replace."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<ArtificialIcon width={HOME_ICON} height={HOME_ICON} />}
            title="REWRITE"
            description="AI rewrite tools for punctuation and phrasing."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<EssentialsIcon width={HOME_ICON} height={HOME_ICON} />}
            title="ESSENTIALS"
            description="Custom keywords, snippets, and fast insert."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<CalculatorIcon width={HOME_ICON} height={HOME_ICON} />}
            title="CALCULATOR"
            description="A built-in keypad for numbers and math."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<AutocorrectIcon width={HOME_ICON} height={HOME_ICON} />}
            title="AUTOCORRECT"
            description="Smarter suggestions with learn-on-device."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<GestureIcon width={HOME_ICON} height={HOME_ICON} />}
            title="GESTURES"
            description="Swipe typing + special long-press keys."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<EmojiIcon width={HOME_ICON} height={HOME_ICON} />}
            title="EMOJI"
            description="Emoji panel with categories and fast insertion."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="mid"
            icon={<VoiceIcon width={HOME_ICON} height={HOME_ICON} />}
            title="VOICE"
            description="Speech-to-text with live preview."
          />
          <View style={styles.divider} />
          <LaunchpadCard
            position="bottom"
            icon={<LinkIcon width={HOME_ICON} height={HOME_ICON} />}
            title="THEMES"
            description="Paste a theme JSON and instantly apply it."
            onPress={onOpenKeyboard}
          />
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
    paddingTop: 104,
    paddingBottom: 24,
    gap: 20,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 20,
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
  themeDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 4,
  },
  layoutStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  layoutStepperText: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    color: C.text,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  stepperValue: {
    minWidth: 52,
    textAlign: 'center',
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
});
