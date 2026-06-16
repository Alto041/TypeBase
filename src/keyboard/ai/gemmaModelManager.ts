import {DeviceEventEmitter} from 'react-native';
import {
  downloadGemmaModel,
  GEMMA_DOWNLOAD_PROGRESS_EVENT,
  isGemmaModelDownloaded,
  isGemmaModelLoaded,
  isGemmaNativeAvailable,
  loadGemmaModel,
} from './gemmaBridge';

export {GEMMA_DOWNLOAD_PROGRESS_EVENT};

let loadPromise: Promise<void> | null = null;

export function isOnDeviceAiSupported(): boolean {
  return isGemmaNativeAvailable();
}

export async function ensureGemmaModelDownloaded(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!isGemmaNativeAvailable()) {
    throw new Error('On-device AI is only available on Android.');
  }

  if (await isGemmaModelDownloaded()) {
    onProgress?.(1);
    return;
  }

  const subscription = onProgress
    ? DeviceEventEmitter.addListener(GEMMA_DOWNLOAD_PROGRESS_EVENT, onProgress)
    : null;

  try {
    await downloadGemmaModel();
    onProgress?.(1);
  } finally {
    subscription?.remove();
  }
}

export async function ensureGemmaModelLoaded(): Promise<void> {
  if (!isGemmaNativeAvailable()) {
    throw new Error('On-device AI is only available on Android.');
  }

  if (await isGemmaModelLoaded()) {
    return;
  }

  if (!(await isGemmaModelDownloaded())) {
    throw new Error('Download the on-device AI model in TypeBase settings first.');
  }

  if (!loadPromise) {
    loadPromise = loadGemmaModel().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

export function resetGemmaLoadState(): void {
  loadPromise = null;
}
