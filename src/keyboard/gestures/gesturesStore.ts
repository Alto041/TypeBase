import {keyboardBridge} from '../keyboardBridge';
import {
  DEFAULT_GESTURE_SETTINGS,
  DEFAULT_LAUNCHER_APP_PACKAGE,
  type GestureSettingKey,
  type GestureSettings,
} from './types';

type PersistedGestureData = Partial<GestureSettings> & {
  launcherAppPackage?: string;
  commaLauncherArmed?: boolean;
  commaHoldOpenApp?: boolean;
};

let cached: GestureSettings = {...DEFAULT_GESTURE_SETTINGS};
let cachedLauncherPackage = DEFAULT_LAUNCHER_APP_PACKAGE;
let cachedCommaLauncherArmed = false;
let loadPromise: Promise<void> | null = null;

function normalizeSettings(raw: PersistedGestureData): GestureSettings {
  return {
    swipeTyping: raw.swipeTyping ?? DEFAULT_GESTURE_SETTINGS.swipeTyping,
    spaceCursorSwipe:
      raw.spaceCursorSwipe ?? DEFAULT_GESTURE_SETTINGS.spaceCursorSwipe,
    backspaceWordSwipe:
      raw.backspaceWordSwipe ?? DEFAULT_GESTURE_SETTINGS.backspaceWordSwipe,
    backspaceSentenceHold:
      raw.backspaceSentenceHold ??
      DEFAULT_GESTURE_SETTINGS.backspaceSentenceHold,
    commaLauncher:
      raw.commaLauncher ??
      raw.commaHoldOpenApp ??
      DEFAULT_GESTURE_SETTINGS.commaLauncher,
    undoRedo: raw.undoRedo ?? DEFAULT_GESTURE_SETTINGS.undoRedo,
    trackpadMode: raw.trackpadMode ?? DEFAULT_GESTURE_SETTINGS.trackpadMode,
  };
}

function buildPersistPayload(): string {
  return JSON.stringify({
    ...cached,
    launcherAppPackage: cachedLauncherPackage,
  });
}

async function persistSettings(): Promise<void> {
  try {
    await keyboardBridge.setGestureSettings(buildPersistPayload());
  } catch {
    // Keep in-memory settings even if native persistence is unavailable.
  }
}

export function resetGesturesCache(): void {
  loadPromise = null;
}

export async function ensureGesturesLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const raw = await keyboardBridge.getGestureSettings();
      try {
        const parsed = JSON.parse(raw) as PersistedGestureData;
        cached = normalizeSettings(parsed);
        cachedLauncherPackage =
          parsed.launcherAppPackage?.trim() || DEFAULT_LAUNCHER_APP_PACKAGE;
      } catch {
        cached = {...DEFAULT_GESTURE_SETTINGS};
        cachedLauncherPackage = DEFAULT_LAUNCHER_APP_PACKAGE;
      }

      try {
        let armed = await keyboardBridge.getCommaLauncherArmed();
        if (!armed) {
          const legacyArmed = parsedCommaLauncherArmedFallback(raw);
          if (legacyArmed) {
            armed = true;
            await keyboardBridge.setCommaLauncherArmed(true);
          }
        }
        cachedCommaLauncherArmed = armed;
      } catch {
        cachedCommaLauncherArmed = parsedCommaLauncherArmedFallback(raw);
      }
    } catch {
      cached = {...DEFAULT_GESTURE_SETTINGS};
      cachedLauncherPackage = DEFAULT_LAUNCHER_APP_PACKAGE;
      cachedCommaLauncherArmed = false;
    }
  })();

  try {
    await loadPromise;
  } catch {
    cached = {...DEFAULT_GESTURE_SETTINGS};
    cachedLauncherPackage = DEFAULT_LAUNCHER_APP_PACKAGE;
    cachedCommaLauncherArmed = false;
    loadPromise = null;
  }
}

function parsedCommaLauncherArmedFallback(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as PersistedGestureData;
    return parsed.commaLauncherArmed === true;
  } catch {
    return false;
  }
}

export async function reloadGesturesFromStorage(): Promise<void> {
  resetGesturesCache();
  await ensureGesturesLoaded();
}

export function getGestureSettings(): GestureSettings {
  return {...cached};
}

export function getLauncherAppPackage(): string {
  return cachedLauncherPackage;
}

export function getCommaLauncherArmed(): boolean {
  return cachedCommaLauncherArmed;
}

export async function setGestureSetting(
  key: GestureSettingKey,
  enabled: boolean,
): Promise<void> {
  cached = {...cached, [key]: enabled};
  await persistSettings();
}

export async function setLauncherAppPackage(packageName: string): Promise<void> {
  const next = packageName.trim();
  if (!next) {
    return;
  }
  cachedLauncherPackage = next;
  await persistSettings();
}

export async function setCommaLauncherArmed(armed: boolean): Promise<void> {
  cachedCommaLauncherArmed = armed;
  try {
    await keyboardBridge.setCommaLauncherArmed(armed);
  } catch {
    // Keep in-memory armed state even if native persistence is unavailable.
  }
}
