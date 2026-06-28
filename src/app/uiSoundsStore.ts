import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ui_sounds_enabled';

let cachedEnabled = true;
let loadPromise: Promise<void> | null = null;

export async function ensureUiSoundsLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw === '0') {
          cachedEnabled = false;
        } else if (raw === '1') {
          cachedEnabled = true;
        }
      } catch {
        cachedEnabled = true;
      }
    })();
  }
  await loadPromise;
}

export function isUiSoundsEnabled(): boolean {
  return cachedEnabled;
}

export async function getUiSoundsEnabled(): Promise<boolean> {
  await ensureUiSoundsLoaded();
  return cachedEnabled;
}

export async function setUiSoundsEnabled(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Keep in-memory value when persistence fails.
  }
}
