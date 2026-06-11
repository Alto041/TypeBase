import {DeviceEventEmitter} from 'react-native';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyboardColorScheme} from '../theme';

export const KEYBOARD_THEME_CHANGED_EVENT = 'keyboardThemeChanged';

const DEFAULT_SCHEME: KeyboardColorScheme = 'light';

let cached: KeyboardColorScheme = DEFAULT_SCHEME;
let loadPromise: Promise<void> | null = null;

function normalizeScheme(value: string | null | undefined): KeyboardColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await keyboardBridge.getKeyboardColorScheme();
    cached = normalizeScheme(raw);
  } catch {
    cached = DEFAULT_SCHEME;
  }
}

export function resetThemeCache(): void {
  loadPromise = null;
}

export async function ensureThemeLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export async function refreshKeyboardColorScheme(): Promise<KeyboardColorScheme> {
  await loadFromStorage();
  return getKeyboardColorScheme();
}

export function getKeyboardColorScheme(): KeyboardColorScheme {
  return cached;
}

export async function setKeyboardColorScheme(
  scheme: KeyboardColorScheme,
): Promise<void> {
  cached = scheme;
  try {
    await keyboardBridge.setKeyboardColorScheme(scheme);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(KEYBOARD_THEME_CHANGED_EVENT, scheme);
}
