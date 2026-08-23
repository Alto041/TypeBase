import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {getParakeetNativeModule} from './parakeetBridge';

type VoiceRecorderModuleType = {
  hasMicPermission: () => Promise<boolean>;
  openAppForMicPermission: () => Promise<boolean>;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  isAndroidSpeechRecognitionAvailable: () => Promise<boolean>;
  startAndroidSpeechRecognition: () => Promise<boolean>;
  stopAndroidSpeechRecognition: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const {VoiceRecorderModule} = NativeModules as {
  VoiceRecorderModule?: VoiceRecorderModuleType;
};

const parakeetModule = getParakeetNativeModule();

const emitter =
  Platform.OS === 'android' && VoiceRecorderModule
    ? new NativeEventEmitter(VoiceRecorderModule)
    : null;

const parakeetEmitter =
  Platform.OS === 'android' && parakeetModule
    ? new NativeEventEmitter(parakeetModule)
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
  isAndroidSttAvailable: (): Promise<boolean> => {
    if (VoiceRecorderModule?.isAndroidSpeechRecognitionAvailable) {
      return VoiceRecorderModule.isAndroidSpeechRecognitionAvailable();
    }
    return Promise.resolve(false);
  },
  startAndroidStt: (): Promise<boolean> => {
    if (VoiceRecorderModule?.startAndroidSpeechRecognition) {
      return VoiceRecorderModule.startAndroidSpeechRecognition();
    }
    return Promise.reject(new Error('Android speech recognition not available'));
  },
  stopAndroidStt: (): Promise<boolean> => {
    if (VoiceRecorderModule?.stopAndroidSpeechRecognition) {
      return VoiceRecorderModule.stopAndroidSpeechRecognition();
    }
    return Promise.resolve(false);
  },
  isParakeetSttAvailable: (): Promise<boolean> => {
    if (parakeetModule?.isModelDownloaded) {
      return parakeetModule.isModelDownloaded();
    }
    return Promise.resolve(false);
  },
  startParakeetStt: (): Promise<boolean> => {
    if (parakeetModule?.startListening) {
      return parakeetModule.startListening();
    }
    return Promise.reject(new Error('Parakeet speech recognition not available'));
  },
  stopParakeetStt: (): Promise<boolean> => {
    if (parakeetModule?.stopListening) {
      return parakeetModule.stopListening();
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
  subscribeAndroidStt: (handlers: {
    onReady?: () => void;
    onPartial?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (message: string, code?: number) => void;
  }) => {
    const subscriptions = [
      emitter?.addListener('VoiceRecorderAndroidSttReady', () => {
        handlers.onReady?.();
      }),
      emitter?.addListener(
        'VoiceRecorderAndroidSttPartial',
        (event: {text?: string}) => {
          if (event.text) {
            handlers.onPartial?.(event.text);
          }
        },
      ),
      emitter?.addListener(
        'VoiceRecorderAndroidSttFinal',
        (event: {text?: string}) => {
          if (event.text) {
            handlers.onFinal?.(event.text);
          }
        },
      ),
      emitter?.addListener(
        'VoiceRecorderAndroidSttError',
        (event: {message?: string; code?: number}) => {
          handlers.onError?.(
            event.message ?? 'Android speech recognition error',
            event.code,
          );
        },
      ),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription?.remove();
      }
    };
  },
  subscribeParakeetStt: (handlers: {
    onReady?: () => void;
    onPartial?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (message: string) => void;
  }) => {
    const subscriptions = [
      parakeetEmitter?.addListener('ParakeetSttReady', () => {
        handlers.onReady?.();
      }),
      parakeetEmitter?.addListener(
        'ParakeetSttPartial',
        (event: {text?: string}) => {
          if (event.text) {
            handlers.onPartial?.(event.text);
          }
        },
      ),
      parakeetEmitter?.addListener(
        'ParakeetSttFinal',
        (event: {text?: string}) => {
          if (event.text) {
            handlers.onFinal?.(event.text);
          }
        },
      ),
      parakeetEmitter?.addListener(
        'ParakeetSttError',
        (event: {message?: string}) => {
          handlers.onError?.(
            event.message ?? 'Parakeet speech recognition error',
          );
        },
      ),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription?.remove();
      }
    };
  },
};
