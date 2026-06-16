import {keyboardBridge} from '../keyboardBridge';

export type AiProvider = 'gemini' | 'on_device';

const DEFAULT_PROVIDER: AiProvider = 'gemini';

let cachedProvider: AiProvider = DEFAULT_PROVIDER;
let loadPromise: Promise<void> | null = null;

function normalizeProvider(value: string | null | undefined): AiProvider {
  return value === 'on_device' ? 'on_device' : 'gemini';
}

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await keyboardBridge.getAiProvider();
    cachedProvider = normalizeProvider(raw);
  } catch {
    cachedProvider = DEFAULT_PROVIDER;
  }
}

export async function ensureAiProviderLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export function getAiProvider(): AiProvider {
  return cachedProvider;
}

export function isOnDeviceAiProvider(provider: AiProvider): boolean {
  return provider === 'on_device';
}

export async function setAiProvider(provider: AiProvider): Promise<void> {
  cachedProvider = provider;
  try {
    await keyboardBridge.setAiProvider(provider);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
}
