import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
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

import BackIcon from './assets/back.svg';
import CloudIcon from './assets/cloud.svg';
import DeviceIcon from './assets/device.svg';
import KeyIcon from './assets/key.svg';
import DownloadIcon from './assets/download.svg';

import {
  type AiProvider,
  ensureAiProviderLoaded,
  getAiProvider,
  setAiProvider,
} from './src/keyboard/settings/aiProviderStore';
import {
  type ApiKeys,
  ensureApiKeysLoaded,
  getApiKeys,
  setApiKeys,
} from './src/keyboard/settings/apiKeysStore';
import {isGemmaModelDownloaded} from './src/keyboard/ai/gemmaBridge';
import {
  ensureGemmaModelDownloaded,
  isOnDeviceAiSupported,
} from './src/keyboard/ai/gemmaModelManager';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  green: '#2CC642',
  blue: '#3B82F6',
} as const;

const CARD_R = 14;
const ROW_GAP = 8;
const TEXT_KERNING = -0.7;

export function AiConfigScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [apiKeys, setApiKeysState] = useState<ApiKeys>({
    geminiApiKey: '',
    speechmaticsApiKey: '',
  });
  const [isOnDeviceSupported, setIsOnDeviceSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isModelDownloaded, setIsModelDownloaded] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      await ensureAiProviderLoaded();
      await ensureApiKeysLoaded();

      setProvider(getAiProvider());
      setApiKeysState(getApiKeys());
      setIsOnDeviceSupported(isOnDeviceAiSupported());

      if (isOnDeviceAiSupported()) {
        const downloaded = await isGemmaModelDownloaded();
        setIsModelDownloaded(downloaded);
      }

      setIsLoading(false);
    };

    loadData();
  }, []);

  const handleProviderChange = async (newProvider: AiProvider) => {
    void Haptics.selectionAsync().catch(() => {});
    setProvider(newProvider);
    await setAiProvider(newProvider);
  };

  const handleGeminiKeyChange = async (value: string) => {
    const newKeys = { ...apiKeys, geminiApiKey: value };
    setApiKeysState(newKeys);
    await setApiKeys({ geminiApiKey: value });
  };

  const handleSpeechmaticsKeyChange = async (value: string) => {
    const newKeys = { ...apiKeys, speechmaticsApiKey: value };
    setApiKeysState(newKeys);
    await setApiKeys({ speechmaticsApiKey: value });
  };

  const handleDownloadModel = async () => {
    void Haptics.selectionAsync().catch(() => {});
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      await ensureGemmaModelDownloaded((progress: number) => {
        setDownloadProgress(progress);
      });
      setIsModelDownloaded(true);
    } catch (error) {
      console.error('Failed to download model:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            onBack();
          }}
          style={styles.backButton}
          hitSlop={12}
        >
          <BackIcon width={24} height={24} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={C.text} size="small" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* AI Provider Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Provider</Text>

            {/* Cloud AI Option */}
            <Pressable
              onPress={() => handleProviderChange('gemini')}
              style={[
                styles.providerCard,
                provider === 'gemini' && styles.providerCardSelected,
              ]}
            >
              <View style={styles.providerIcon}>
                <CloudIcon width={24} height={24} />
              </View>
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>Cloud AI (Gemini)</Text>
                <Text style={styles.providerSubtitle}>
                  Google Gemini 2.5 Flash Lite
                </Text>
              </View>
              <View style={styles.radio}>
                {provider === 'gemini' && <View style={styles.radioSelected} />}
              </View>
            </Pressable>

            {/* On-Device AI Option */}
            <Pressable
              onPress={() => {
                if (isOnDeviceSupported) {
                  handleProviderChange('on_device');
                }
              }}
              style={[
                styles.providerCard,
                provider === 'on_device' && styles.providerCardSelected,
                !isOnDeviceSupported && styles.providerCardDisabled,
              ]}
            >
              <View style={styles.providerIcon}>
                <DeviceIcon width={24} height={24} />
              </View>
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>
                  On-Device AI (Gemma)
                  {!isOnDeviceSupported && ' - Not Available'}
                </Text>
                <Text style={styles.providerSubtitle}>
                  Gemma 3 1B - runs locally on your device
                </Text>
              </View>
              <View style={styles.radio}>
                {provider === 'on_device' && (
                  <View style={styles.radioSelected} />
                )}
              </View>
            </Pressable>
          </View>

          {/* Cloud AI Settings */}
          {provider === 'gemini' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gemini API Key</Text>
              <View style={styles.inputCard}>
                <View style={styles.inputIcon}>
                  <KeyIcon width={20} height={20} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your Google Gemini API key"
                  placeholderTextColor={C.sub}
                  value={apiKeys.geminiApiKey}
                  onChangeText={handleGeminiKeyChange}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.inputHint}>
                Required for cloud AI features like translate and rewrite
              </Text>
            </View>
          )}

          {/* On-Device Model Download */}
          {provider === 'on_device' && isOnDeviceSupported && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>On-Device Model</Text>
              <View style={styles.modelCard}>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelTitle}>Gemma 3 1B IT</Text>
                  <Text style={styles.modelSubtitle}>
                    ~550 MB • Required for on-device AI
                  </Text>
                </View>

                {isModelDownloaded ? (
                  <View style={styles.downloadedBadge}>
                    <Text style={styles.downloadedText}>Downloaded</Text>
                  </View>
                ) : isDownloading ? (
                  <View style={styles.downloadProgress}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.round(downloadProgress * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {Math.round(downloadProgress * 100)}%
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleDownloadModel}
                    style={styles.downloadButton}
                  >
                    <DownloadIcon width={18} height={18} />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Speechmatics API Key */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Speech-to-Text API Key</Text>
            <View style={styles.inputCard}>
              <View style={styles.inputIcon}>
                <KeyIcon width={20} height={20} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Enter your Speechmatics API key"
                placeholderTextColor={C.sub}
                value={apiKeys.speechmaticsApiKey}
                onChangeText={handleSpeechmaticsKeyChange}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Text style={styles.inputHint}>
              Required for voice typing functionality
            </Text>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoText}>
              Your API keys are stored securely on your device and are only used
              to communicate with the respective AI services.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  headerSpacer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: ROW_GAP * 3,
  },
  section: {
    gap: ROW_GAP,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: 4,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: CARD_R,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerCardSelected: {
    borderColor: C.text,
  },
  providerCardDisabled: {
    opacity: 0.5,
  },
  providerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  providerSubtitle: {
    fontSize: 13,
    color: C.sub,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.text,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  inputIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    padding: 0,
    minHeight: 24,
  },
  inputHint: {
    fontSize: 13,
    color: C.sub,
    marginLeft: 4,
    marginTop: 4,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: CARD_R,
    padding: 16,
    gap: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  modelSubtitle: {
    fontSize: 13,
    color: C.sub,
    marginTop: 2,
  },
  downloadedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  downloadedText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.green,
  },
  downloadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 120,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.green,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.sub,
    minWidth: 32,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.text,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.card,
  },
  infoSection: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    fontSize: 13,
    color: C.sub,
    lineHeight: 20,
  },
});
