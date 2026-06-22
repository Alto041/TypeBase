import {keyboardBridge} from '../keyboardBridge';

const STORAGE_KEY = 'typebase_recent_emojis';
const PERSIST_DEBOUNCE_MS = 600;
export const MAX_RECENT_EMOJIS = 40;

let recents: string[] = [];
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let recentsVersion = 0;

async function readRecentsFromStorage(): Promise<string[]> {
  try {
    const raw = await keyboardBridge.getRecentEmojis();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    try {
      const {default: AsyncStorage} = await import(
        '@react-native-async-storage/async-storage'
      );
      const legacy = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = legacy ? (JSON.parse(legacy) as unknown) : [];
      const migrated = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
      if (migrated.length > 0) {
        await keyboardBridge.setRecentEmojis(JSON.stringify(migrated));
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      return migrated;
    } catch {
      return [];
    }
  }
}

function schedulePersistRecents(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void keyboardBridge.setRecentEmojis(JSON.stringify(recents));
  }, PERSIST_DEBOUNCE_MS);
}

export async function ensureRecentEmojisLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    recents = await readRecentsFromStorage();
    recentsVersion += 1;
  })();

  return loadPromise;
}

export function resetRecentEmojisCache(): void {
  loadPromise = null;
}

export function getRecentEmojis(): readonly string[] {
  return recents;
}

export function getRecentEmojisVersion(): number {
  return recentsVersion;
}

/** In-memory update only; disk write is debounced. Returns null when order unchanged. */
export function touchRecentEmoji(emoji: string): readonly string[] | null {
  const trimmed = emoji.trim();
  if (!trimmed) {
    return null;
  }
  if (recents[0] === trimmed) {
    return null;
  }

  recents = [trimmed, ...recents.filter(item => item !== trimmed)].slice(
    0,
    MAX_RECENT_EMOJIS,
  );
  recentsVersion += 1;
  schedulePersistRecents();
  return recents;
}

export async function recordRecentEmoji(emoji: string): Promise<void> {
  await ensureRecentEmojisLoaded();
  touchRecentEmoji(emoji);
}
