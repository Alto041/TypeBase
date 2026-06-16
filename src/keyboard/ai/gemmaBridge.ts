import {NativeModules, Platform} from 'react-native';

function formatNativeError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
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
  return 'On-device AI request failed.';
}

type GemmaNativeModule = {
  isModelDownloaded: () => Promise<boolean>;
  getModelPath: () => Promise<string>;
  downloadModel: () => Promise<string>;
  cancelModelDownload: () => void;
  loadModel: () => Promise<string>;
  isModelLoaded: () => Promise<boolean>;
  unloadModel: () => void;
  generateResponse: (prompt: string) => Promise<string>;
};

const GemmaModule: GemmaNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.GemmaModule : undefined;

export const GEMMA_MODEL_URL =
  'https://pub-8e31d16ca4f04d94b8e3e5f258fcbc2b.r2.dev/gemma3-1B-it-int4.task';

export const GEMMA_DOWNLOAD_PROGRESS_EVENT = 'gemmaDownloadProgress';

export function isGemmaNativeAvailable(): boolean {
  return Boolean(GemmaModule);
}

export async function isGemmaModelDownloaded(): Promise<boolean> {
  return (await GemmaModule?.isModelDownloaded()) ?? false;
}

export async function downloadGemmaModel(): Promise<string> {
  if (!GemmaModule) {
    throw new Error('On-device AI is only available on Android.');
  }
  return GemmaModule.downloadModel();
}

export function cancelGemmaModelDownload(): void {
  GemmaModule?.cancelModelDownload();
}

export async function loadGemmaModel(): Promise<void> {
  if (!GemmaModule) {
    throw new Error('On-device AI is only available on Android.');
  }
  try {
    await GemmaModule.loadModel();
  } catch (error) {
    throw new Error(formatNativeError(error));
  }
}

export async function isGemmaModelLoaded(): Promise<boolean> {
  return (await GemmaModule?.isModelLoaded()) ?? false;
}

export async function askGemma(prompt: string): Promise<string> {
  if (!GemmaModule) {
    throw new Error('On-device AI is only available on Android.');
  }
  try {
    return await GemmaModule.generateResponse(prompt);
  } catch (error) {
    throw new Error(formatNativeError(error));
  }
}

export function unloadGemmaModel(): void {
  GemmaModule?.unloadModel();
}
