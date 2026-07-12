import {DeviceEventEmitter} from 'react-native';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyboardColorScheme, KeyboardDesign} from '../theme';

export const KEYBOARD_THEME_CHANGED_EVENT = 'keyboardThemeChanged';
export const KEYBOARD_DESIGN_CHANGED_EVENT = 'keyboardDesignChanged';
export const KEYBOARD_CUSTOM_THEME_CHANGED_EVENT =
  'keyboardCustomThemeChanged';

const DEFAULT_SCHEME: KeyboardColorScheme = 'light';
const DEFAULT_DESIGN: KeyboardDesign = 'typebase';

let cachedScheme: KeyboardColorScheme = DEFAULT_SCHEME;
let cachedDesign: KeyboardDesign = DEFAULT_DESIGN;
let cachedCustomThemeJson: string = '{}';
let loadPromise: Promise<void> | null = null;

function normalizeScheme(value: string | null | undefined): KeyboardColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

function normalizeDesign(value: string | null | undefined): KeyboardDesign {
  if (value === 'quivox') {
    return 'quivox';
  }
  if (value === 'macintosh') {
    return 'macintosh';
  }
  if (value === 'custom') {
    return 'custom';
  }
  return 'typebase';
}

async function loadFromStorage(): Promise<void> {
  try {
    const [schemeRaw, designRaw, customThemeRaw] = await Promise.all([
      keyboardBridge.getKeyboardColorScheme(),
      keyboardBridge.getKeyboardDesign(),
      keyboardBridge.getKeyboardCustomTheme(),
    ]);
    cachedScheme = normalizeScheme(schemeRaw);
    cachedDesign = normalizeDesign(designRaw);
    cachedCustomThemeJson = customThemeRaw ?? '{}';
  } catch {
    cachedScheme = DEFAULT_SCHEME;
    cachedDesign = DEFAULT_DESIGN;
    cachedCustomThemeJson = '{}';
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

export async function refreshKeyboardDesign(): Promise<KeyboardDesign> {
  await loadFromStorage();
  return getKeyboardDesign();
}

export function getKeyboardColorScheme(): KeyboardColorScheme {
  return cachedScheme;
}

export function getKeyboardDesign(): KeyboardDesign {
  return cachedDesign;
}

export function getKeyboardCustomTheme(): string {
  return cachedCustomThemeJson;
}

export async function setKeyboardColorScheme(
  scheme: KeyboardColorScheme,
): Promise<void> {
  cachedScheme = scheme;
  try {
    await keyboardBridge.setKeyboardColorScheme(scheme);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(KEYBOARD_THEME_CHANGED_EVENT, scheme);
}

export async function setKeyboardDesign(design: KeyboardDesign): Promise<void> {
  cachedDesign = design;
  try {
    await keyboardBridge.setKeyboardDesign(design);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(KEYBOARD_DESIGN_CHANGED_EVENT, design);
}

export async function setKeyboardCustomTheme(json: string): Promise<void> {
  cachedCustomThemeJson = json;
  try {
    await keyboardBridge.setKeyboardCustomTheme(json);
  } catch {
    // Keep in-memory value when native persistence is unavailable.
  }
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(KEYBOARD_CUSTOM_THEME_CHANGED_EVENT, json);
}
