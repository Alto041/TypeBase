import {NativeModules, Platform} from 'react-native';

import {canUseFeature} from '../../licensing/entitlements';

type VoiceActivationSoundModuleType = {
  playTypeLift?: () => Promise<boolean>;
};

const {VoiceActivationSoundModule} = NativeModules as {
  VoiceActivationSoundModule?: VoiceActivationSoundModuleType;
};

/** Plays typelift.mp3 when TypeLift AI correction is applied. Premium only. */
export function playTypeLiftSound(): void {
  if (Platform.OS !== 'android' || !canUseFeature('autocorrect_full')) {
    return;
  }
  if (!VoiceActivationSoundModule?.playTypeLift) {
    return;
  }

  void VoiceActivationSoundModule.playTypeLift().catch(() => {});
}
