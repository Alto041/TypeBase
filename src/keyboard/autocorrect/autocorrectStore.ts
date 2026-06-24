import {keyboardBridge} from '../keyboardBridge';
import {
  DEFAULT_AUTOCORRECT_SETTINGS,
  type AutocorrectSettings,
} from './types';

let cached: AutocorrectSettings = {...DEFAULT_AUTOCORRECT_SETTINGS};
let loadPromise: Promise<void> | null = null;

function normalizeSettings(raw: Partial<AutocorrectSettings>): AutocorrectSettings {
  return {
    enabled: raw.enabled ?? DEFAULT_AUTOCORRECT_SETTINGS.enabled,
    autoApplyOnSpace:
      raw.autoApplyOnSpace ?? DEFAULT_AUTOCORRECT_SETTINGS.autoApplyOnSpace,
    aiAutoCorrectEnabled:
      raw.aiAutoCorrectEnabled ??
      DEFAULT_AUTOCORRECT_SETTINGS.aiAutoCorrectEnabled,
  };
}

async function persistSettings(): Promise<void> {
  try {
    await keyboardBridge.setAutocorrectSettings(JSON.stringify(cached));
  } catch {
    // Keep in-memory settings when native persistence is unavailable.
  }
}

export function resetAutocorrectCache(): void {
  loadPromise = null;
}

export async function ensureAutocorrectLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const raw = await keyboardBridge.getAutocorrectSettings();
      cached = normalizeSettings(JSON.parse(raw) as Partial<AutocorrectSettings>);
    } catch {
      cached = {...DEFAULT_AUTOCORRECT_SETTINGS};
    }
  })();

  try {
    await loadPromise;
  } catch {
    cached = {...DEFAULT_AUTOCORRECT_SETTINGS};
    loadPromise = null;
  }
}

export async function reloadAutocorrectFromStorage(): Promise<void> {
  resetAutocorrectCache();
  await ensureAutocorrectLoaded();
}

export function getAutocorrectSettings(): AutocorrectSettings {
  return {...cached};
}

export async function setAutocorrectEnabled(enabled: boolean): Promise<void> {
  cached = {...cached, enabled};
  await persistSettings();
}

export async function setAutoApplyOnSpace(autoApplyOnSpace: boolean): Promise<void> {
  cached = {...cached, autoApplyOnSpace};
  await persistSettings();
}

export async function setAiAutoCorrectEnabled(
  aiAutoCorrectEnabled: boolean,
): Promise<void> {
  cached = {...cached, aiAutoCorrectEnabled};
  await persistSettings();
}
