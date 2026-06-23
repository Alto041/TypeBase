import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {
  type AiProvider,
  ensureAiProviderLoaded,
  getAiProvider,
  setAiProvider,
} from '../settings/aiProviderStore';
import {
  type ApiKeys,
  ensureApiKeysLoaded,
  getApiKeys,
  setApiKeys,
} from '../settings/apiKeysStore';
import {
  ensureVoiceSttProviderLoaded,
  getVoiceSttProvider,
  setVoiceSttProvider,
  type VoiceSttProvider,
} from '../settings/voiceSttProviderStore';
import {
  ensureGemmaModelDownloaded,
  isOnDeviceAiSupported,
} from './gemmaModelManager';

type ProviderOption = {
  id: AiProvider;
  title: string;
  subtitle: string;
};

type VoiceProviderOption = {
  id: VoiceSttProvider;
  title: string;
  subtitle: string;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'gemini',
    title: 'Cloud AI (Gemini)',
    subtitle: 'Google Gemini 2.5 Flash Lite',
  },
  {
    id: 'on_device',
    title: 'On-Device AI (Gemma)',
    subtitle: 'Gemma 3 1B - runs locally on your device',
  },
];

const VOICE_PROVIDER_OPTIONS: VoiceProviderOption[] = [
  {
    id: 'speechmatics',
    title: 'Speechmatics',
    subtitle: 'Cloud transcription with live partials',
  },
  {
    id: 'android',
    title: 'Android STT',
    subtitle: 'Uses the device speech recognizer; supports offline when available',
  },
];

function getTileStyle(index: number, total: number): ViewStyle {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (total === 1) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  if (isFirst) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
    };
  }

  if (isLast) {
    return {
      borderTopLeftRadius: PLUGIN_INNER_RADIUS,
      borderTopRightRadius: PLUGIN_INNER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  return {
    borderTopLeftRadius: PLUGIN_INNER_RADIUS,
    borderTopRightRadius: PLUGIN_INNER_RADIUS,
    borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
    borderBottomRightRadius: PLUGIN_INNER_RADIUS,
  };
}

function ProviderSelector({
  selectedProvider,
  onSelect,
  isOnDeviceSupported,
}: {
  selectedProvider: AiProvider;
  onSelect: (provider: AiProvider) => void;
  isOnDeviceSupported: boolean;
}) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AI Provider</Text>
      {PROVIDER_OPTIONS.map((option, index) => {
        const isSelected = selectedProvider === option.id;
        const isDisabled = option.id === 'on_device' && !isOnDeviceSupported;

        return (
          <Pressable
            key={option.id}
            onPress={() => {
              if (!isDisabled) {
                triggerKeyHaptic();
                onSelect(option.id);
              }
            }}
            style={[
              styles.providerRow,
              getTileStyle(index, PROVIDER_OPTIONS.length),
              isSelected && styles.providerRowSelected,
              isDisabled && styles.providerRowDisabled,
            ]}>
            <View style={styles.providerInfo}>
              <Text
                style={[
                  styles.providerTitle,
                  isSelected && styles.providerTitleSelected,
                  isDisabled && styles.textDisabled,
                ]}>
                {option.title}
                {isDisabled && ' (Not Available)'}
              </Text>
              <Text
                style={[
                  styles.providerSubtitle,
                  isDisabled && styles.textDisabled,
                ]}>
                {option.subtitle}
              </Text>
            </View>
            {isSelected && <Text style={styles.selectedMark}>✓</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function VoiceProviderSelector({
  selectedProvider,
  onSelect,
}: {
  selectedProvider: VoiceSttProvider;
  onSelect: (provider: VoiceSttProvider) => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Voice Input Provider</Text>
      {VOICE_PROVIDER_OPTIONS.map((option, index) => {
        const isSelected = selectedProvider === option.id;

        return (
          <Pressable
            key={option.id}
            onPress={() => {
              triggerKeyHaptic();
              onSelect(option.id);
            }}
            style={[
              styles.providerRow,
              getTileStyle(index, VOICE_PROVIDER_OPTIONS.length),
              isSelected && styles.providerRowSelected,
            ]}>
            <View style={styles.providerInfo}>
              <Text
                style={[
                  styles.providerTitle,
                  isSelected && styles.providerTitleSelected,
                ]}>
                {option.title}
              </Text>
              <Text style={styles.providerSubtitle}>{option.subtitle}</Text>
            </View>
            {isSelected && <Text style={styles.selectedMark}>✓</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function ApiKeyInput({
  title,
  placeholder,
  value,
  onChange,
  secure = true,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
}) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.apiKeySection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View
        style={[
          styles.inputRow,
          isFocused && styles.inputRowFocused,
        ]}>
        <TextInput
          style={styles.apiKeyInput}
          placeholder={placeholder}
          placeholderTextColor={theme.spaceLabel}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>
    </View>
  );
}

function ModelDownloadSection({
  onDownload,
  downloadProgress,
  isDownloading,
  isDownloaded,
}: {
  onDownload: () => void;
  downloadProgress: number;
  isDownloading: boolean;
  isDownloaded: boolean;
}) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>On-Device Model</Text>
      <View style={[styles.modelRow, styles.modelRowSingle]}>
        <View style={styles.modelInfo}>
          <Text style={styles.modelTitle}>Gemma 3 1B IT</Text>
          <Text style={styles.modelSubtitle}>
            {isDownloaded
              ? 'Model downloaded and ready'
              : 'Required for on-device AI'}
          </Text>
        </View>
        {isDownloaded ? (
          <Text style={styles.downloadedBadge}>Downloaded</Text>
        ) : isDownloading ? (
          <View style={styles.downloadProgressContainer}>
            <View
              style={[
                styles.downloadProgressBar,
                {width: `${Math.round(downloadProgress * 100)}%`},
              ]}
            />
            <Text style={styles.downloadProgressText}>
              {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              triggerKeyHaptic();
              onDownload();
            }}
            style={styles.downloadButton}>
            <Text style={styles.downloadButtonText}>Download</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function AiConfigPanel() {
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createStyles);

  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [voiceProvider, setVoiceProviderState] =
    useState<VoiceSttProvider>('speechmatics');
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
      await ensureVoiceSttProviderLoaded();
      await ensureApiKeysLoaded();

      setProvider(getAiProvider());
      setVoiceProviderState(getVoiceSttProvider());
      setApiKeysState(getApiKeys());
      setIsOnDeviceSupported(isOnDeviceAiSupported());
      setIsLoading(false);
    };

    loadData();
  }, []);

  // Handle provider change
  const handleProviderChange = useCallback(async (newProvider: AiProvider) => {
    setProvider(newProvider);
    await setAiProvider(newProvider);
  }, []);

  const handleVoiceProviderChange = useCallback(
    async (newProvider: VoiceSttProvider) => {
      setVoiceProviderState(newProvider);
      await setVoiceSttProvider(newProvider);
    },
    [],
  );

  // Handle API key changes
  const handleGeminiKeyChange = useCallback(async (value: string) => {
    const newKeys = {...apiKeys, geminiApiKey: value};
    setApiKeysState(newKeys);
    await setApiKeys({geminiApiKey: value});
  }, [apiKeys]);

  const handleSpeechmaticsKeyChange = useCallback(async (value: string) => {
    const newKeys = {...apiKeys, speechmaticsApiKey: value};
    setApiKeysState(newKeys);
    await setApiKeys({speechmaticsApiKey: value});
  }, [apiKeys]);

  // Handle model download
  const handleDownloadModel = useCallback(async () => {
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
  }, []);

  if (isLoading) {
    return (
      <View style={[panelStyles.container, styles.loadingContainer]}>
        <ActivityIndicator color={useKeyboardTheme().label} size="small" />
      </View>
    );
  }

  return (
    <View style={panelStyles.container}>
      <PluginScrollView>
        {/* AI Provider Selector */}
        <ProviderSelector
          selectedProvider={provider}
          onSelect={handleProviderChange}
          isOnDeviceSupported={isOnDeviceSupported}
        />

        <VoiceProviderSelector
          selectedProvider={voiceProvider}
          onSelect={handleVoiceProviderChange}
        />

        {/* Cloud AI Settings */}
        {provider === 'gemini' && (
          <ApiKeyInput
            title="Gemini API Key"
            placeholder="Enter your Google Gemini API key"
            value={apiKeys.geminiApiKey}
            onChange={handleGeminiKeyChange}
          />
        )}

        {/* On-Device AI Settings */}
        {provider === 'on_device' && isOnDeviceSupported && (
          <ModelDownloadSection
            onDownload={handleDownloadModel}
            downloadProgress={downloadProgress}
            isDownloading={isDownloading}
            isDownloaded={isModelDownloaded}
          />
        )}

        {voiceProvider === 'speechmatics' && (
          <ApiKeyInput
            title="Speechmatics API Key"
            placeholder="Enter your Speechmatics API key for voice typing"
            value={apiKeys.speechmaticsApiKey}
            onChange={handleSpeechmaticsKeyChange}
          />
        )}
      </PluginScrollView>
    </View>
  );
}

const TOGGLE_ON_COLOR = '#2CC642';

function createStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    loadingContainer: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginHorizontal: 12,
      marginBottom: 8,
      marginTop: 8,
    },
    providerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 56,
    },
    providerRowSelected: {
      backgroundColor: theme.pluginCardSecondary,
    },
    providerRowDisabled: {
      opacity: 0.5,
    },
    providerInfo: {
      flex: 1,
    },
    providerTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    providerTitleSelected: {
      fontWeight: '700',
    },
    providerSubtitle: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      marginTop: 2,
    },
    selectedMark: {
      color: TOGGLE_ON_COLOR,
      fontSize: 16,
      fontWeight: '700',
      marginLeft: 8,
    },
    textDisabled: {
      color: theme.spaceLabel,
    },
    apiKeySection: {
      marginBottom: 16,
    },
    inputRow: {
      backgroundColor: theme.pluginCard,
      borderRadius: PLUGIN_OUTER_RADIUS,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginHorizontal: 0,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    inputRowFocused: {
      borderColor: theme.accent || TOGGLE_ON_COLOR,
    },
    apiKeyInput: {
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
      padding: 0,
      minHeight: 24,
    },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 56,
    },
    modelRowSingle: {
      borderRadius: PLUGIN_OUTER_RADIUS,
    },
    modelInfo: {
      flex: 1,
    },
    modelTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    modelSubtitle: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      marginTop: 2,
    },
    downloadButton: {
      backgroundColor: TOGGLE_ON_COLOR,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    downloadButtonText: {
      color: '#fff',
      fontSize: 14,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    downloadedBadge: {
      color: TOGGLE_ON_COLOR,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    downloadProgressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: 100,
    },
    downloadProgressBar: {
      flex: 1,
      height: 4,
      backgroundColor: TOGGLE_ON_COLOR,
      borderRadius: 2,
    },
    downloadProgressText: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      minWidth: 28,
    },
  });
}
