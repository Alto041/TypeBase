import {DeviceEventEmitter} from 'react-native';
import {keyboardBridge} from '../keyboardBridge';
import {normalizeLetterLayoutId} from '../layouts/resolveLetterLayout';
import {ensureCustomLayoutsLoaded} from './customLayoutStore';
import {
  DEFAULT_TAP_SOUND_FILE,
  ensureAllBundledTapSounds,
} from './tapSoundStore';
import {
  isValidMyRowPin,
  MY_ROW_SLOT_COUNT,
  normalizeMyRowPin,
} from '../myRow/myRowStore';
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
    landscapeFloatingKeyboardEnabled: false,
    myRowEnabled:
      typeof obj['myRowEnabled'] === 'boolean'
        ? obj['myRowEnabled']
        : defaults.myRowEnabled,
    myRowPins: Array.isArray(obj['myRowPins'])
      ? obj['myRowPins']
          .filter((value): value is string => typeof value === 'string')
          .map(value => normalizeMyRowPin(value))
          .filter(value => isValidMyRowPin(value))
          .slice(0, MY_ROW_SLOT_COUNT)
      : [...defaults.myRowPins],
    myRowShiftNumbersEnabled:
      typeof obj['myRowShiftNumbersEnabled'] === 'boolean'
        ? obj['myRowShiftNumbersEnabled']
        : defaults.myRowShiftNumbersEnabled,
    essentialsEnabled:
      typeof obj['essentialsEnabled'] === 'boolean'
        ? obj['essentialsEnabled']
        : typeof obj['snippetsEnabled'] === 'boolean'
          ? obj['snippetsEnabled']
          : defaults.essentialsEnabled,
    essentialsMatchCaseEnabled:
      typeof obj['essentialsMatchCaseEnabled'] === 'boolean'
        ? obj['essentialsMatchCaseEnabled']
        : defaults.essentialsMatchCaseEnabled,
    keyboardHeightOffset:
      typeof obj['keyboardHeightOffset'] === 'number' && Number.isFinite(obj['keyboardHeightOffset'])
        ? clamp(Math.round(obj['keyboardHeightOffset']), -140, 220)
        : defaults.keyboardHeightOffset,
    bottomClearanceAdjust:
      typeof obj['bottomClearanceAdjust'] === 'number' &&
      Number.isFinite(obj['bottomClearanceAdjust'])
        ? clamp(Math.round(obj['bottomClearanceAdjust']), -24, 48)
        : defaults.bottomClearanceAdjust,
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
    keyHapticPulseMs:
      typeof obj['keyHapticPulseMs'] === 'number' &&
      Number.isFinite(obj['keyHapticPulseMs'])
        ? clamp(Math.round(obj['keyHapticPulseMs']), 6, 24)
        : defaults.keyHapticPulseMs,
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
    predictiveHitboxesEnabled:
      typeof obj['predictiveHitboxesEnabled'] === 'boolean'
        ? obj['predictiveHitboxesEnabled']
        : defaults.predictiveHitboxesEnabled,
    walkModeEnabled:
      typeof obj['walkModeEnabled'] === 'boolean'
        ? obj['walkModeEnabled']
        : defaults.walkModeEnabled,
    walkModeDebugCompare:
      typeof obj['walkModeDebugCompare'] === 'boolean'
        ? obj['walkModeDebugCompare']
        : defaults.walkModeDebugCompare,
    keyPreviewStyle:
      obj['keyPreviewStyle'] === 'popup' || obj['keyPreviewStyle'] === 'subtle'
        ? obj['keyPreviewStyle']
        : obj['keyPreviewStyle'] === 'doodle' || obj['keyPreviewStyle'] === 'none'
          ? 'doodle'
          : defaults.keyPreviewStyle,
  };
}

async function loadFromStorage(): Promise<void> {
  await ensureCustomLayoutsLoaded();
  let storedLayout: Record<string, unknown> | null = null;
  try {
    const raw = await keyboardBridge.getKeyboardLayoutSettings();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    storedLayout = parsed;
    cachedLayout = normalizeLayout(parsed);
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
  const needsDefaultTapMigration =
    cachedLayout.customTapSoundEnabled &&
    (!storedLayout?.customTapSoundFile ||
      cachedLayout.customTapSoundFile === 'haptic.wav' ||
      cachedLayout.customTapSoundFile === '1.mp3' ||
      cachedLayout.customTapSoundFile === 'typebase_keytap_soft.mp3');
  // Migrate legacy defaults to the current bundled soft tap (WAV).
  if (needsDefaultTapMigration) {
    try {
      await setKeyboardLayoutSettings({
        ...cachedLayout,
        customTapSoundFile: DEFAULT_TAP_SOUND_FILE,
        customTapSoundEnabled: true,
      });
      cachedLayout = {
        ...cachedLayout,
        customTapSoundFile: DEFAULT_TAP_SOUND_FILE,
      };
    } catch {
      // Keep the in-memory settings; the bundled asset install below is best-effort.
    }
  }
  try {
    await ensureAllBundledTapSounds(needsDefaultTapMigration);
    keyboardBridge.syncCustomTapSound?.();
  } catch {
    // Tap sound install is optional; typing still works without it.
  }
  if (storedLayout?.landscapeFloatingKeyboardEnabled === true) {
    try {
      await setKeyboardLayoutSettings({
        ...cachedLayout,
        landscapeFloatingKeyboardEnabled: false,
      });
    } catch {
      cachedLayout = {...cachedLayout, landscapeFloatingKeyboardEnabled: false};
    }
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
