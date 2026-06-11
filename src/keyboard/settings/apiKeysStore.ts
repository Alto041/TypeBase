import {keyboardBridge} from '../keyboardBridge';

export type ApiKeys = {
  geminiApiKey: string;
  speechmaticsApiKey: string;
};

const EMPTY_KEYS: ApiKeys = {
  geminiApiKey: '',
  speechmaticsApiKey: '',
};

let cached: ApiKeys = {...EMPTY_KEYS};
let loadPromise: Promise<void> | null = null;

function normalizeKeys(raw: Partial<ApiKeys> | null | undefined): ApiKeys {
  return {
    geminiApiKey: raw?.geminiApiKey?.trim() ?? '',
    speechmaticsApiKey: raw?.speechmaticsApiKey?.trim() ?? '',
  };
}

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await keyboardBridge.getApiKeys();
    try {
      cached = normalizeKeys(JSON.parse(raw) as Partial<ApiKeys>);
    } catch {
      cached = {...EMPTY_KEYS};
    }
  } catch {
    cached = {...EMPTY_KEYS};
  }
}

export function resetApiKeysCache(): void {
  loadPromise = null;
}

export async function ensureApiKeysLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export async function refreshApiKeys(): Promise<ApiKeys> {
  await loadFromStorage();
  return getApiKeys();
}

export function getApiKeys(): ApiKeys {
  return {...cached};
}

export async function setApiKeys(keys: Partial<ApiKeys>): Promise<void> {
  cached = normalizeKeys({...cached, ...keys});
  try {
    await keyboardBridge.setApiKeys(JSON.stringify(cached));
  } catch {
    // Keep in-memory values even if native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
}

export async function requireGeminiApiKey(): Promise<string> {
  const {geminiApiKey} = await refreshApiKeys();
  if (!geminiApiKey) {
    throw new Error(
      'Add your Google Gemini API key in the TypeBase app settings.',
    );
  }
  return geminiApiKey;
}

export async function requireSpeechmaticsApiKey(): Promise<string> {
  const {speechmaticsApiKey} = await refreshApiKeys();
  if (!speechmaticsApiKey) {
    throw new Error(
      'Add your Speechmatics API key in the TypeBase app settings.',
    );
  }
  return speechmaticsApiKey;
}
