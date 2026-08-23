import {DeviceEventEmitter} from 'react-native';
import {
  downloadParakeetModels,
  isParakeetModelDownloaded,
  isParakeetNativeAvailable,
  PARAKEET_DOWNLOAD_PROGRESS_EVENT,
} from './parakeetBridge';

export {PARAKEET_DOWNLOAD_PROGRESS_EVENT};

export function isParakeetVoiceSupported(): boolean {
  return isParakeetNativeAvailable();
}

export async function ensureParakeetModelDownloaded(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!isParakeetNativeAvailable()) {
    throw new Error('On-device Parakeet voice is only available on Android.');
  }

  if (await isParakeetModelDownloaded()) {
    onProgress?.(1);
    return;
  }

  const subscription = onProgress
    ? DeviceEventEmitter.addListener(
        PARAKEET_DOWNLOAD_PROGRESS_EVENT,
        (event: {progress?: number}) => {
          if (typeof event?.progress === 'number') {
            onProgress(event.progress);
          }
        },
      )
    : null;

  try {
    await downloadParakeetModels();
    onProgress?.(1);
  } finally {
    subscription?.remove();
  }
}
