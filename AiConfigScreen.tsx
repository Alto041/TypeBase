import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
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

import CloudIcon from './assets/cloud.svg';
import DeviceIcon from './assets/device.svg';
import SwitchIcon from './assets/switch.svg';
import EditIcon from './assets/edit.svg';
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
import {
  ensureVoiceSttProviderLoaded,
  getVoiceSttProvider,
  setVoiceSttProvider,
  type VoiceSttProvider,
} from './src/keyboard/settings/voiceSttProviderStore';
import {isGemmaModelDownloaded} from './src/keyboard/ai/gemmaBridge';
import {
  ensureGemmaModelDownloaded,
  isOnDeviceAiSupported,
} from './src/keyboard/ai/gemmaModelManager';
import {playSwitchOffSound, playSwitchOnSound} from './src/app/switchSound';

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
const CONFIG_CARD_R = 25;
const ROW_GAP = 8;
const ROW_ICON = 20;
const TEXT_KERNING = -0.7;

const CONFIG_ICON_INSET = 16;
const CONFIG_PROVIDER_ICON_SIZE = 28;
const CONFIG_SWITCH_W = 44;
const CONFIG_SWITCH_H = 56;

export function AiConfigScreen({
  onBack,
  title = 'AI Config',
  variant = 'standalone',
  onContinue,
}: {
  onBack?: () => void;
  title?: string;
  variant?: 'standalone' | 'wizard';
  onContinue?: () => void;
}) {
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

  const scrollViewRef = useRef<ScrollView | null>(null);
  const geminiApiKeyInputRef = useRef<TextInput | null>(null);
  const geminiApiKeyYRef = useRef(0);
  const voiceProviderAnim = useRef(new Animated.Value(0)).current;

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      await ensureAiProviderLoaded();
      await ensureVoiceSttProviderLoaded();
      await ensureApiKeysLoaded();

      setProvider(getAiProvider());
      const loadedVoiceProvider = getVoiceSttProvider();
      setVoiceProviderState(loadedVoiceProvider);
      voiceProviderAnim.setValue(loadedVoiceProvider === 'android' ? 1 : 0);
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

  // Handle Android back button/gesture
  useEffect(() => {
    if (variant === 'wizard' || !onBack) {
      return;
    }

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      },
    );

    return () => backHandler.remove();
  }, [onBack, variant]);

  const handleProviderChange = async (newProvider: AiProvider) => {
    void Haptics.selectionAsync().catch(() => {});
    playSwitchOnSound();
    setProvider(newProvider);
    await setAiProvider(newProvider);
  };

  const animateToggle = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const handleVoiceProviderChange = async (newProvider: VoiceSttProvider) => {
    void Haptics.selectionAsync().catch(() => {});
    if (newProvider === 'android') playSwitchOnSound();
    else playSwitchOffSound();
    setVoiceProviderState(newProvider);
    animateToggle(voiceProviderAnim, newProvider === 'android' ? 1 : 0);
    await setVoiceSttProvider(newProvider);
  };

  const toggleAndroidStt = async () => {
    await handleVoiceProviderChange(
      voiceProvider === 'android' ? 'speechmatics' : 'android',
    );
  };

  const handleEditGeminiApiKey = async () => {
    if (provider !== 'gemini') {
      await handleProviderChange('gemini');
    }

    // Wait for the gemini key section to mount and measure.
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(geminiApiKeyYRef.current - 24, 0),
        animated: true,
      });
      geminiApiKeyInputRef.current?.focus();
    }, 80);
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

  const isWizard = variant === 'wizard';
  const Root = isWizard ? View : SafeAreaView;

  return (
    <Root style={[styles.safeArea, isWizard && styles.safeAreaWizard]}>
      {!isWizard ? <StatusBar barStyle="dark-content" backgroundColor={C.bg} /> : null}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={C.text} size="small" />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollViewRef}
            style={isWizard ? styles.scrollViewWizard : undefined}
            contentContainerStyle={[
              styles.scrollContent,
              isWizard && styles.scrollContentWizard,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.topRow, isWizard && styles.topRowWizard]}>
              <Text style={[styles.pageTitle, isWizard && styles.pageTitleWizard]}>
                {title}
              </Text>
            </View>

          <View style={styles.configRow}>
            <View style={[styles.configCard, styles.configCardLeft]}>
              <View style={styles.configTitleBlock}>
                <Text style={styles.configLabel}>
                  {provider === 'on_device' ? 'ON DEVICE' : 'CLOUD AI'}
                </Text>
                <Text style={styles.configSubtitle}>
                  {provider === 'on_device' ? 'Gemma 3' : 'Gemini 2.5'}
                </Text>
              </View>
              <View style={styles.configProviderControls}>
                <Pressable
                  onPress={() => handleProviderChange('gemini')}
                  style={[
                    styles.configProviderIcon,
                    provider === 'gemini' && styles.configProviderIconSelected,
                  ]}
                  hitSlop={6}
                >
                  <CloudIcon
                    width={CONFIG_PROVIDER_ICON_SIZE}
                    height={CONFIG_PROVIDER_ICON_SIZE}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (isOnDeviceSupported) {
                      void handleProviderChange('on_device');
                    }
                  }}
                  style={[
                    styles.configProviderIcon,
                    styles.configProviderIconDevice,
                    provider === 'on_device' && styles.configProviderIconSelected,
                    !isOnDeviceSupported && styles.configProviderIconDisabled,
                  ]}
                  hitSlop={6}
                >
                  <DeviceIcon
                    width={CONFIG_PROVIDER_ICON_SIZE}
                    height={CONFIG_PROVIDER_ICON_SIZE}
                  />
                </Pressable>
                <View
                  style={[
                    styles.configSwitchWrap,
                    provider === 'on_device' && styles.configSwitchDevice,
                  ]}>
                  <SwitchIcon width={CONFIG_SWITCH_W} height={CONFIG_SWITCH_H} />
                </View>
              </View>
            </View>

            {provider === 'on_device' ? (
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => {});
                  if (!isOnDeviceSupported) return;
                  void handleDownloadModel();
                }}
                style={[
                  styles.configCard,
                  styles.configCardRight,
                  !isOnDeviceSupported && styles.configCardDisabled,
                ]}
                disabled={!isOnDeviceSupported}
              >
                <Text style={styles.configActionTitle}>DOWNLOAD</Text>
                <View style={styles.configActionIconCenter}>
                  <DownloadIcon width={26} height={26} />
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => {});
                  void handleEditGeminiApiKey();
                }}
                style={[styles.configCard, styles.configCardRight]}
              >
                <Text style={styles.configActionTitle}>API KEY</Text>
                <View style={styles.configActionIconCenter}>
                  <EditIcon width={26} height={26} />
                </View>
              </Pressable>
            )}
          </View>

          {/* Cloud AI Settings */}
          {provider === 'gemini' && (
            <View
              style={styles.section}
              onLayout={e => {
                geminiApiKeyYRef.current = e.nativeEvent.layout.y;
              }}>
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
                  ref={geminiApiKeyInputRef}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {!isWizard ? (
                <Text style={styles.inputHint}>Required for cloud AI</Text>
              ) : null}
            </View>
          )}

          {/* On-Device Model Download */}
          {provider === 'on_device' && isOnDeviceSupported && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>On-Device Model</Text>
              <View style={styles.modelCard}>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelTitle}>Gemma 3 1B IT</Text>
                  <Text style={styles.modelSubtitle}>~550 MB</Text>
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice Input Provider</Text>
            <View style={styles.rowCard}>
              <View style={styles.rowInner}>
                <DeviceIcon width={ROW_ICON} height={ROW_ICON} />
                <Text style={styles.rowTitle}>Android STT</Text>
                <View style={styles.toggleWrap}>
                  <Pressable
                    onPress={toggleAndroidStt}
                    style={[
                      styles.toggleTrack,
                      voiceProvider === 'android' && styles.toggleTrackOn,
                    ]}>
                    <Animated.View
                      style={[
                        styles.toggleThumb,
                        {
                          transform: [
                            {
                              translateX: voiceProviderAnim.interpolate({
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
            <Text style={styles.inputHint}>
              {voiceProvider === 'android'
                ? 'Device speech recognition'
                : 'Off: Speechmatics'}
            </Text>
          </View>

          {/* Speechmatics API Key */}
          {voiceProvider === 'speechmatics' ? (
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
            <Text style={styles.inputHint}>Voice typing key</Text>
          </View>
          ) : null}

          {/* Info Section */}
          {!isWizard ? (
            <View style={styles.infoSection}>
              <Text style={styles.infoText}>
                Keys stay on this device.
              </Text>
            </View>
          ) : null}
        </ScrollView>

          {isWizard && onContinue ? (
            <View style={styles.wizardBottom}>
              <Pressable style={styles.wizardContinueButton} onPress={onContinue}>
                <Text style={styles.wizardContinueLabel}>Continue</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Root>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  safeAreaWizard: {
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 110,
    gap: 10,
  },
  scrollContentWizard: {
    paddingTop: 102,
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 24,
  },
  scrollViewWizard: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topRowWizard: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 4,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: TEXT_KERNING,
    fontWeight: '600',
    fontFamily: 'Geist',
  },
  pageTitleWizard: {
    textAlign: 'left',
    fontSize: 55,
    lineHeight: 52,
    letterSpacing: TEXT_KERNING,
    marginBottom: 0,
  },
  configRow: {
    flexDirection: 'row',
    gap: 8,
  },
  configCard: {
    backgroundColor: C.card,
    borderRadius: CONFIG_CARD_R,
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
  configCardDisabled: {
    opacity: 0.45,
  },
  configLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    lineHeight: 18,
  },
  configTitleBlock: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  configSubtitle: {
    marginTop: 2,
    fontFamily: 'FragmentMono',
    fontSize: 13,
    fontWeight: '400',
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    lineHeight: 18,
  },
  configLabelBottomLeft: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'column',
    gap: 0,
  },
  configIconTopRight: {
    position: 'absolute',
    top: CONFIG_ICON_INSET,
    right: CONFIG_ICON_INSET,
  },
  configActionTitle: {
    position: 'absolute',
    top: 14,
    left: 14,
    fontFamily: 'FragmentMono',
    fontSize: 14,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    lineHeight: 18,
  },
  configActionIconCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{translateX: -13}, {translateY: -13}],
    alignItems: 'center',
    justifyContent: 'center',
  },
  configProviderControls: {
    position: 'absolute',
    bottom: CONFIG_ICON_INSET,
    right: CONFIG_ICON_INSET,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  configProviderIcon: {
    opacity: 0.3,
    paddingBottom: 12,
  },
  configProviderIconDevice: {
    paddingBottom: 72,
    marginLeft: 0,
    transform: [{translateX: -2}],
  },
  configProviderIconSelected: {
    opacity: 1,
  },
  configProviderIconDisabled: {
    opacity: 0.15,
  },
  configSwitchWrap: {
    marginLeft: -2,
    // Cloud selection: switch points strongly left
    transform: [{rotate: '-55deg'}],
  },
  configSwitchDevice: {
    // Device selection: switch points only slightly left
    transform: [{rotate: '5deg'}],
  },
  section: {
    gap: ROW_GAP,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.sub,
    textTransform: 'uppercase',
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    marginLeft: 4,
    marginBottom: 4,
  },
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    minHeight: 50,
    justifyContent: 'center',
  },
  rowInner: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  rowTitle: {
    marginLeft: 12,
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    color: C.text,
    letterSpacing: TEXT_KERNING,
    fontWeight: '500',
    fontFamily: 'FragmentMono',
  },
  toggleWrap: {
    width: 48,
    alignItems: 'flex-end',
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#dddddf',
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: C.green,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  providerSubtitle: {
    fontSize: 13,
    color: C.sub,
    marginTop: 2,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    padding: 0,
    minHeight: 24,
  },
  inputHint: {
    fontSize: 12,
    color: C.sub,
    marginLeft: 4,
    marginTop: 2,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  modelSubtitle: {
    fontSize: 13,
    color: C.sub,
    marginTop: 2,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
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
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  infoSection: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    fontSize: 12,
    color: C.sub,
    lineHeight: 17,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  wizardBottom: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  wizardContinueButton: {
    width: '100%',
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardContinueLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
    fontWeight: '600',
    fontFamily: 'FragmentMono',
  },
});
