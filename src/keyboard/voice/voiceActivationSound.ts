import {NativeModules, Platform} from 'react-native';

type VoiceActivationSoundModuleType = {
  preload: () => Promise<boolean>;
  play: () => Promise<boolean>;
};

const {VoiceActivationSoundModule} = NativeModules as {
  VoiceActivationSoundModule?: VoiceActivationSoundModuleType;
};

export function preloadVoiceActivationSound(): void {
  if (Platform.OS !== 'android' || !VoiceActivationSoundModule?.preload) {
    return;
  }

  void VoiceActivationSoundModule.preload().catch(() => {});
}

/** Instant UI feedback when voice dictation is starting. Never throws. */
export function playVoiceActivationSound(): void {
  if (Platform.OS !== 'android' || !VoiceActivationSoundModule?.play) {
    return;
  }

  void VoiceActivationSoundModule.play().catch(() => {});
}
