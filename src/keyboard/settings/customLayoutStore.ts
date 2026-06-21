import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter, Platform} from 'react-native';

import {keyboardBridge} from '../keyboardBridge';
import type {KeyDefinition} from '../layouts/qwerty';
import {
  appendBottomRow,
  klcToStoredLetterRows,
  localeToLanguage,
} from '../layouts/klcToLetterRows';
import {parseKlc} from '../layouts/parseKlc';
import type {LetterLayoutFamily} from '../layouts/letterLayouts';

export const CUSTOM_LAYOUTS_CHANGED_EVENT = 'customLetterLayoutsChanged';

const ASYNC_STORAGE_KEY = 'typebase_custom_letter_layouts';

export type StoredCustomLayout = {
  id: string;
  label: string;
  language: string;
  family: string;
  localeName?: string;
  importedAt: number;
  letterRows: KeyDefinition[][];
};

let cachedLayouts: StoredCustomLayout[] = [];
let loadPromise: Promise<void> | null = null;

function createCustomLayoutId(): string {
  return `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeStoredLayout(raw: unknown): StoredCustomLayout | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.startsWith('custom:')) {
    return null;
  }
  if (typeof obj.label !== 'string' || !obj.label.trim()) {
    return null;
  }
  if (!Array.isArray(obj.letterRows) || obj.letterRows.length === 0) {
    return null;
  }
  return {
    id: obj.id,
    label: obj.label.trim(),
    language:
      typeof obj.language === 'string' && obj.language.trim()
        ? obj.language.trim()
        : 'Imported',
    family:
      typeof obj.family === 'string' && obj.family.trim()
        ? obj.family.trim()
        : 'KLC',
    localeName:
      typeof obj.localeName === 'string' ? obj.localeName : undefined,
    importedAt:
      typeof obj.importedAt === 'number' && Number.isFinite(obj.importedAt)
        ? obj.importedAt
        : Date.now(),
    letterRows: obj.letterRows as KeyDefinition[][],
  };
}

async function readPersistedJson(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const native = await keyboardBridge.getCustomLetterLayouts();
      if (native && native !== '[]') {
        return native;
      }
    } catch {
      // Fall through to AsyncStorage.
    }
  }
  try {
    return (await AsyncStorage.getItem(ASYNC_STORAGE_KEY)) ?? '[]';
  } catch {
    return '[]';
  }
}

async function writePersistedJson(json: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await keyboardBridge.setCustomLetterLayouts(json);
    } catch {
      // Keep AsyncStorage copy as backup.
    }
  }
  try {
    await AsyncStorage.setItem(ASYNC_STORAGE_KEY, json);
  } catch {
    // Ignore when storage is unavailable.
  }
}

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await readPersistedJson();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      cachedLayouts = [];
      return;
    }
    cachedLayouts = parsed
      .map(normalizeStoredLayout)
      .filter((entry): entry is StoredCustomLayout => entry !== null);
  } catch {
    cachedLayouts = [];
  }
}

export async function ensureCustomLayoutsLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadFromStorage();
  }
  await loadPromise;
}

export function resetCustomLayoutsCache(): void {
  loadPromise = null;
}

export type CustomLayoutMeta = {
  id: string;
  label: string;
  language: string;
  family: LetterLayoutFamily;
};

export function listCustomLayoutMeta(): CustomLayoutMeta[] {
  return cachedLayouts.map(layout => ({
    id: layout.id,
    label: layout.label,
    language: layout.language,
    family: 'KLC',
  }));
}

export function getCustomLayoutMeta(id: string): CustomLayoutMeta | null {
  const layout = cachedLayouts.find(entry => entry.id === id);
  if (!layout) {
    return null;
  }
  return {
    id: layout.id,
    label: layout.label,
    language: layout.language,
    family: 'KLC',
  };
}

export function hasCustomLayout(id: string): boolean {
  return cachedLayouts.some(entry => entry.id === id);
}

export function getCustomLayoutRows(id: string): KeyDefinition[][] | null {
  const layout = cachedLayouts.find(entry => entry.id === id);
  if (!layout) {
    return null;
  }
  return appendBottomRow(layout.letterRows);
}

export async function importKlcLayout(klcText: string): Promise<StoredCustomLayout> {
  const parsed = parseKlc(klcText);
  const letterRows = klcToStoredLetterRows(parsed);
  const layout: StoredCustomLayout = {
    id: createCustomLayoutId(),
    label: parsed.name,
    language: localeToLanguage(parsed.localeName),
    family: 'KLC',
    localeName: parsed.localeName,
    importedAt: Date.now(),
    letterRows,
  };

  cachedLayouts = [...cachedLayouts, layout];
  await writePersistedJson(JSON.stringify(cachedLayouts));
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(CUSTOM_LAYOUTS_CHANGED_EVENT, cachedLayouts);
  return layout;
}

export async function deleteCustomLayout(id: string): Promise<boolean> {
  const next = cachedLayouts.filter(entry => entry.id !== id);
  if (next.length === cachedLayouts.length) {
    return false;
  }
  cachedLayouts = next;
  await writePersistedJson(JSON.stringify(cachedLayouts));
  loadPromise = Promise.resolve();
  DeviceEventEmitter.emit(CUSTOM_LAYOUTS_CHANGED_EVENT, cachedLayouts);
  return true;
}

export function isSwipeTypingDisabledForLayout(id: string): boolean {
  if (id.startsWith('custom:')) {
    return true;
  }
  return id === 'ru-ru' || id === 'ar-sa';
}
