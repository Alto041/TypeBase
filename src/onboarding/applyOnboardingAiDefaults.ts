import {
  ensureAiProviderLoaded,
  getAiProvider,
  setAiProvider,
  type AiProvider,
} from '../keyboard/settings/aiProviderStore';
import {
  ensureApiKeysLoaded,
  getApiKeys,
} from '../keyboard/settings/apiKeysStore';
import {
  ensureVoiceSttProviderLoaded,
  getVoiceSttProvider,
  setVoiceSttProvider,
  type VoiceSttProvider,
} from '../keyboard/settings/voiceSttProviderStore';
import {isOnDeviceAiSupported} from '../keyboard/ai/gemmaModelManager';
import {isParakeetVoiceSupported} from '../keyboard/voice/parakeetModelManager';

/** Sensible first-run AI prefs when user skips a settings wizard during onboarding. */
export async function applyOnboardingAiDefaults(): Promise<void> {
  await ensureAiProviderLoaded();
  await ensureVoiceSttProviderLoaded();
  await ensureApiKeysLoaded();

  const keys = getApiKeys();
  const isFreshSetup = !keys.geminiApiKey && !keys.speechmaticsApiKey;
  if (!isFreshSetup) {
    return;
  }

  const onDeviceSupported = isOnDeviceAiSupported();
  let nextProvider: AiProvider = getAiProvider();
  let nextVoice: VoiceSttProvider = getVoiceSttProvider();

  if (onDeviceSupported) {
    nextProvider = 'on_device';
    nextVoice =
      isParakeetVoiceSupported() ? 'parakeet' : 'android';
  } else {
    nextProvider = 'gemini';
    nextVoice = 'android';
  }

  await setAiProvider(nextProvider);
  await setVoiceSttProvider(nextVoice);
}
