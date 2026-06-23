import {keyboardBridge} from '../keyboardBridge';

export type VoiceSttProvider = 'speechmatics' | 'android';

const DEFAULT_PROVIDER: VoiceSttProvider = 'speechmatics';

let cachedProvider: VoiceSttProvider = DEFAULT_PROVIDER;
let loadPromise: Promise<void> | null = null;

function normalizeProvider(value: string | null | undefined): VoiceSttProvider {
  return value === 'android' ? 'android' : 'speechmatics';
}

async function loadFromStorage(): Promise<void> {
  try {
    cachedProvider = normalizeProvider(await keyboardBridge.getVoiceSttProvider());
  } catch {
    cachedProvider = DEFAULT_PROVIDER;
  }
}

export async function ensureVoiceSttProviderLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export function getVoiceSttProvider(): VoiceSttProvider {
  return cachedProvider;
}

export async function setVoiceSttProvider(
  provider: VoiceSttProvider,
): Promise<void> {
  cachedProvider = provider;
  try {
    await keyboardBridge.setVoiceSttProvider(provider);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
}
