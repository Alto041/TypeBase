import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

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

import BackIcon from './assets/back.svg';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
} as const;

const CARD_R = 25;
const TEXT_KERNING = -0.7;

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

export function SettingsScreen({
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
    letterSpacing: TEXT_KERNING,
  },
  step: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: TEXT_KERNING,
  },
  hint: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: TEXT_KERNING,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: TEXT_KERNING,
  },
  fieldHint: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
  },
  savedMessage: {
    color: '#4ADE80',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  debugMeta: {
    color: C.sub,
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: TEXT_KERNING,
  },
  debugError: {
    color: '#DC2626',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: C.sub,
    fontSize: 13,
    letterSpacing: TEXT_KERNING,
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
    letterSpacing: TEXT_KERNING,
  },
});
