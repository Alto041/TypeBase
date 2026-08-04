import {NativeModules, Platform} from 'react-native';

type ZeroLatencySoundModuleType = {
  playZero?: () => Promise<boolean>;
};

const {VoiceActivationSoundModule} = NativeModules as {
  VoiceActivationSoundModule?: ZeroLatencySoundModuleType;
};

/** Plays zero.mp3 when the zero-latency title animation starts. Never throws. */
export function playZeroLatencySound(): void {
  if (Platform.OS !== 'android' || !VoiceActivationSoundModule?.playZero) {
    return;
  }

  void VoiceActivationSoundModule.playZero().catch(() => {});
}
