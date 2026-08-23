import {NativeModules, Platform} from 'react-native';

function formatNativeError(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error
  ) {
    const native = error as {code?: string; message?: string};
    if (native.code && native.message) {
      return `${native.code}: ${native.message}`;
    }
    if (native.message) {
      return native.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Parakeet voice request failed.';
}

type ParakeetNativeModule = {
  isModelDownloaded: () => Promise<boolean>;
  downloadModels: () => Promise<string>;
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const ParakeetModule: ParakeetNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.ParakeetVoiceModule : undefined;

export const PARAKEET_DOWNLOAD_PROGRESS_EVENT = 'ParakeetDownloadProgress';

export function isParakeetNativeAvailable(): boolean {
  return Boolean(ParakeetModule);
}

export async function isParakeetModelDownloaded(): Promise<boolean> {
  return (await ParakeetModule?.isModelDownloaded()) ?? false;
}

export async function downloadParakeetModels(): Promise<string> {
  if (!ParakeetModule) {
    throw new Error('On-device Parakeet voice is only available on Android.');
  }
  try {
    return await ParakeetModule.downloadModels();
  } catch (error) {
    throw new Error(formatNativeError(error));
  }
}

export async function startParakeetListening(): Promise<boolean> {
  if (!ParakeetModule) {
    throw new Error('On-device Parakeet voice is only available on Android.');
  }
  try {
    return await ParakeetModule.startListening();
  } catch (error) {
    throw new Error(formatNativeError(error));
  }
}

export async function stopParakeetListening(): Promise<boolean> {
  if (!ParakeetModule) {
    return false;
  }
  try {
    return await ParakeetModule.stopListening();
  } catch (error) {
    throw new Error(formatNativeError(error));
  }
}

export function getParakeetNativeModule(): ParakeetNativeModule | undefined {
  return ParakeetModule;
}
