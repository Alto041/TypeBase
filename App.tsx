import React, {useEffect, useState} from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
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

function SetupScreen() {
  const [pin, setPin] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.badge}>Android Custom Keyboard</Text>
        <Text style={styles.title}>TypeBase</Text>
        <Text style={styles.subtitle}>
          A React Native keyboard built with an Android InputMethodService and
          a native bridge for text input.
        </Text>

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
          onPress={() => Linking.openURL('https://github.com/SitePen/rn-input-extensions-blog')}>
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
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 24,
    gap: 20,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
  },
  step: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  fieldHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },
  secretInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1220',
    color: '#F8FAFC',
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
    backgroundColor: '#2563EB',
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
    borderColor: '#334155',
    backgroundColor: '#0B1220',
    color: '#F8FAFC',
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  pinInput: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1220',
    color: '#F8FAFC',
    paddingHorizontal: 16,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  pinStatus: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: '#64748B',
    fontSize: 13,
  },
});
