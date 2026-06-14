import React, {useEffect, useState} from 'react';
import {
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
        Translate, Rewrite, and voice typing use your own Google Gemini and
        Speechmatics keys. Keys are stored locally on this device.
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
  const [route, setRoute] = useState<'launchpad' | 'settings'>('launchpad');

  if (route === 'settings') {
    return <SettingsScreen onBack={() => setRoute('launchpad')} />;
  }
  return <LaunchpadScreen onOpenSettings={() => setRoute('settings')} />;
}

function LaunchpadScreen({onOpenSettings}: {onOpenSettings: () => void}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onOpenSettings}>
          <ItemsIcon width={18} height={18} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Launchpad</Text>

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
            icon={
              <ArtificialIcon
                width={HOME_ICON}
                height={HOME_ICON}
                color="#000000"
              />
            }
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
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen({onBack}: {onBack: () => void}) {
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

        <ApiKeysCard />

        <KeyboardThemeCard />

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
  topRightActions: {
    position: 'absolute',
    right: 10,
    top: 6,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  topRightSettings: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    zIndex: 10,
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
