import {NativeModules, Platform} from 'react-native';

type VoiceActivationSoundModuleType = {
  playSwitch?: () => Promise<boolean>;
  playSwitchOff?: () => Promise<boolean>;
};

const {VoiceActivationSoundModule} = NativeModules as {
  VoiceActivationSoundModule?: VoiceActivationSoundModuleType;
};

/** Plays the AI provider toggle sound. Never throws. */
export function playSwitchOnSound(): void {
  if (Platform.OS !== 'android' || !VoiceActivationSoundModule?.playSwitch) {
    return;
  }

  void VoiceActivationSoundModule.playSwitch().catch(() => {});
}

/** Plays the AI provider toggle "off" sound. Never throws. */
export function playSwitchOffSound(): void {
  if (
    Platform.OS !== 'android' ||
    !VoiceActivationSoundModule?.playSwitchOff
  ) {
    return;
  }

  void VoiceActivationSoundModule.playSwitchOff().catch(() => {});
}
