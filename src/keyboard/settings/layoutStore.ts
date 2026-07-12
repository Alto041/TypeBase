import {DeviceEventEmitter} from 'react-native';
import {keyboardBridge} from '../keyboardBridge';
import {normalizeLetterLayoutId} from '../layouts/resolveLetterLayout';
import {ensureCustomLayoutsLoaded} from './customLayoutStore';
import {
  ensureBundledDefaultTapSound,
} from './tapSoundStore';
import {
  DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  type KeyboardLayoutSettings,
} from '../theme';
import {normalizeControllerSettings} from '../controller/controllerSettings';

export const KEYBOARD_LAYOUT_CHANGED_EVENT = 'keyboardLayoutChanged';

let cachedLayout: KeyboardLayoutSettings = {...DEFAULT_KEYBOARD_LAYOUT_SETTINGS};
let loadPromise: Promise<void> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLayout(raw: unknown): KeyboardLayoutSettings {
  const defaults = DEFAULT_KEYBOARD_LAYOUT_SETTINGS;
  if (!raw || typeof raw !== 'object') {
    return {...defaults};
  }

  const obj = raw as Record<string, unknown>;
  const readNumber = (
    key: 'keyHeight' | 'keyGap' | 'keyRowMargin' | 'keyRadius',
    min: number,
    max: number,
  ) => {
    const value = obj[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return defaults[key];
    }
    return clamp(Math.round(value), min, max);
  };

  return {
    keyHeight: readNumber('keyHeight', 40, 64),
    keyGap: readNumber('keyGap', 0, 12),
    keyRowMargin: readNumber('keyRowMargin', 0, 20),
    keyRadius: readNumber('keyRadius', 0, 12),
    enterKeyPreviewEnabled:
      typeof obj['enterKeyPreviewEnabled'] === 'boolean'
        ? obj['enterKeyPreviewEnabled']
        : defaults.enterKeyPreviewEnabled,
    developerEyeEnabled:
      typeof obj['developerEyeEnabled'] === 'boolean'
        ? obj['developerEyeEnabled']
        : defaults.developerEyeEnabled,
    letterSymbolAlternatesEnabled:
      typeof obj['letterSymbolAlternatesEnabled'] === 'boolean'
        ? obj['letterSymbolAlternatesEnabled']
        : defaults.letterSymbolAlternatesEnabled,
    numberRowEnabled:
      typeof obj['numberRowEnabled'] === 'boolean'
        ? obj['numberRowEnabled']
        : defaults.numberRowEnabled,
    keyboardHeightOffset:
      typeof obj['keyboardHeightOffset'] === 'number' && Number.isFinite(obj['keyboardHeightOffset'])
        ? clamp(Math.round(obj['keyboardHeightOffset']), -140, 220)
        : defaults.keyboardHeightOffset,
    letterLayoutId: normalizeLetterLayoutId(obj['letterLayoutId']),
    customTapSoundEnabled:
      typeof obj['customTapSoundEnabled'] === 'boolean'
        ? obj['customTapSoundEnabled']
        : defaults.customTapSoundEnabled,
    customTapSoundFile:
      typeof obj['customTapSoundFile'] === 'string' && obj['customTapSoundFile'].trim()
        ? obj['customTapSoundFile'].trim()
        : defaults.customTapSoundFile,
    keyHapticEnabled:
      typeof obj['keyHapticEnabled'] === 'boolean'
        ? obj['keyHapticEnabled']
        : defaults.keyHapticEnabled,
    autoCapitalizeEnabled:
      typeof obj['autoCapitalizeEnabled'] === 'boolean'
        ? obj['autoCapitalizeEnabled']
        : defaults.autoCapitalizeEnabled,
    customFontEnabled:
      typeof obj['customFontEnabled'] === 'boolean'
        ? obj['customFontEnabled']
        : defaults.customFontEnabled,
    customFontFile:
      typeof obj['customFontFile'] === 'string' && obj['customFontFile'].trim()
        ? obj['customFontFile'].trim()
        : defaults.customFontFile,
    controller: normalizeControllerSettings(obj['controller']),
  };
}

async function loadFromStorage(): Promise<void> {
  await ensureCustomLayoutsLoaded();
  try {
    const raw = await keyboardBridge.getKeyboardLayoutSettings();
    cachedLayout = normalizeLayout(JSON.parse(raw));
  } catch {
    cachedLayout = {...DEFAULT_KEYBOARD_LAYOUT_SETTINGS};
  }
  // Self-heal: earlier builds mistakenly installed a selected meme SFX as the
  // key tap sound. Those files are named `myinstants_*`. If one is still set,
  // restore the bundled default so the keyboard stops playing memes on tap.
  // Rewrite the persisted setting FIRST (that is the part that actually stops
  // the meme); copying the bundled asset is best-effort and can fail in dev.
  if (cachedLayout.customTapSoundFile?.startsWith('myinstants_')) {
    try {
      await setKeyboardLayoutSettings({
        ...cachedLayout,
        customTapSoundFile: DEFAULT_KEYBOARD_LAYOUT_SETTINGS.customTapSoundFile,
        customTapSoundEnabled:
          DEFAULT_KEYBOARD_LAYOUT_SETTINGS.customTapSoundEnabled,
      });
    } catch {
      // Ignore; the native guard also refuses to play `myinstants_*` files.
    }
  }
  try {
    await ensureBundledDefaultTapSound();
    keyboardBridge.syncCustomTapSound?.();
  } catch {
    // Tap sound install is optional; typing still works without it.
  }
}

export function resetLayoutCache(): void {
  loadPromise = null;
}

export async function ensureLayoutLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export function getKeyboardLayoutSettings(): KeyboardLayoutSettings {
  return cachedLayout;
}

export async function setKeyboardLayoutSettings(
  layout: KeyboardLayoutSettings,
): Promise<void> {
  cachedLayout = normalizeLayout(layout);
  try {
    await keyboardBridge.setKeyboardLayoutSettings(JSON.stringify(cachedLayout));
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(KEYBOARD_LAYOUT_CHANGED_EVENT, cachedLayout);
}

export async function updateKeyboardLayoutSetting<
  K extends keyof KeyboardLayoutSettings,
>(key: K, value: KeyboardLayoutSettings[K]): Promise<void> {
  await setKeyboardLayoutSettings({...cachedLayout, [key]: value});
}

export function parseLayoutEventPayload(
  payload: unknown,
): KeyboardLayoutSettings {
  if (typeof payload === 'string') {
    try {
      return normalizeLayout(JSON.parse(payload));
    } catch {
      return {...DEFAULT_KEYBOARD_LAYOUT_SETTINGS};
    }
  }
  return normalizeLayout(payload);
}
