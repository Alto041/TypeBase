import {NativeModules, Platform} from 'react-native';

import {isUiSoundsEnabled} from '../src/app/uiSoundsStore';

type VoiceActivationSoundModuleType = {
  playNavigation?: () => Promise<boolean>;
};

const {VoiceActivationSoundModule} = NativeModules as {
  VoiceActivationSoundModule?: VoiceActivationSoundModuleType;
};

export type UiSoundName = 'navigation' | 'turnOn' | 'turnOff' | 'noPrem';

/** Plays a short UI sound. Never throws. */
export function playUiSound(name: UiSoundName): void {
  if (!isUiSoundsEnabled() || Platform.OS !== 'android') {
    return;
  }

  switch (name) {
    case 'navigation':
      if (VoiceActivationSoundModule?.playNavigation) {
        void VoiceActivationSoundModule.playNavigation().catch(() => {});
      }
      break;
    default:
      break;
  }
}
