import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

type VoiceRecorderModuleType = {
  hasMicPermission: () => Promise<boolean>;
  openAppForMicPermission: () => Promise<boolean>;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const {VoiceRecorderModule} = NativeModules as {
  VoiceRecorderModule?: VoiceRecorderModuleType;
};

const emitter =
  Platform.OS === 'android' && VoiceRecorderModule
    ? new NativeEventEmitter(VoiceRecorderModule)
    : null;

export const voiceRecorder = {
  hasMicPermission: (): Promise<boolean> => {
    if (VoiceRecorderModule?.hasMicPermission) {
      return VoiceRecorderModule.hasMicPermission();
    }
    return Promise.resolve(false);
  },
  openAppForMicPermission: (): Promise<boolean> => {
    if (VoiceRecorderModule?.openAppForMicPermission) {
      return VoiceRecorderModule.openAppForMicPermission();
    }
    return Promise.resolve(false);
  },
  start: (): Promise<boolean> => {
    if (VoiceRecorderModule?.startRecording) {
      return VoiceRecorderModule.startRecording();
    }
    return Promise.reject(new Error('Voice recorder not available'));
  },
  stop: (): Promise<boolean> => {
    if (VoiceRecorderModule?.stopRecording) {
      return VoiceRecorderModule.stopRecording();
    }
    return Promise.resolve(false);
  },
  subscribe: (onChunk: (base64: string) => void) => {
    const subscription = emitter?.addListener(
      'VoiceRecorderAudioChunk',
      (event: {data: string}) => {
        onChunk(event.data);
      },
    );
    return () => subscription?.remove();
  },
};
