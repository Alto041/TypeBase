import AsyncStorage from '@react-native-async-storage/async-storage';
import {isChatSafeSticker} from './stickerPackFilter';
import type {StickerLySticker} from './stickers';

const STORAGE_KEY = 'typebase_recent_stickers';
const PERSIST_DEBOUNCE_MS = 600;

export const MAX_RECENT_STICKERS = 14;

type StoredRecentSticker = StickerLySticker & {lastUsedAt: number};

let recents: StoredRecentSticker[] = [];
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let recentsVersion = 0;

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function bumpVersion(): void {
  recentsVersion += 1;
  notifyListeners();
}

function parseStored(value: unknown): StoredRecentSticker[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: StoredRecentSticker[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Partial<StoredRecentSticker>;
    if (
      typeof row.id !== 'string' ||
      typeof row.previewUrl !== 'string' ||
      typeof row.insertUrl !== 'string' ||
      typeof row.lastUsedAt !== 'number'
    ) {
      continue;
    }
    parsed.push({
      id: row.id,
      packId: row.packId ?? '',
      packName: row.packName ?? '',
      label: row.label ?? '',
      previewUrl: row.previewUrl,
      insertUrl: row.insertUrl,
      isAnimated: row.isAnimated === true,
      lastUsedAt: row.lastUsedAt,
    });
  }
  return parsed;
}

async function readFromStorage(): Promise<StoredRecentSticker[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return parseStored(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
  }, PERSIST_DEBOUNCE_MS);
}

export async function ensureRecentStickersLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    recents = await readFromStorage();
    bumpVersion();
  })();
  return loadPromise;
}

export function subscribeRecentStickers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecentStickers(): readonly StickerLySticker[] {
  return recents.map(({lastUsedAt: _t, ...sticker}) => sticker);
}

export function getRecentStickersVersion(): number {
  return recentsVersion;
}

export function touchRecentSticker(sticker: StickerLySticker): void {
  if (!isChatSafeSticker(sticker)) {
    return;
  }
  const now = Date.now();
  const next: StoredRecentSticker = {...sticker, lastUsedAt: now};
  recents = [
    next,
    ...recents.filter(item => item.id !== sticker.id),
  ].slice(0, MAX_RECENT_STICKERS);
  bumpVersion();
  schedulePersist();
}

export async function recordRecentSticker(
  sticker: StickerLySticker,
): Promise<void> {
  await ensureRecentStickersLoaded();
  touchRecentSticker(sticker);
}
