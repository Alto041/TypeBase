import {keyboardBridge} from '../keyboardBridge';

const STORAGE_KEY = 'typebase_recent_emojis';
const PERSIST_DEBOUNCE_MS = 600;
export const MAX_RECENT_EMOJIS = 9;
export const MIN_RECENT_EMOJI_USES = 2;

type EmojiUsage = {
  count: number;
  lastUsedAt: number;
};

type StoredEmojiUsage = Record<string, EmojiUsage>;

let usage: StoredEmojiUsage = {};
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let recentsVersion = 0;

async function readRecentsFromStorage(): Promise<StoredEmojiUsage> {
  try {
    const raw = await keyboardBridge.getRecentEmojis();
    const parsed = JSON.parse(raw) as unknown;
    return parseStoredUsage(parsed);
  } catch {
    try {
      const {default: AsyncStorage} = await import(
        '@react-native-async-storage/async-storage'
      );
      const legacy = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = legacy ? (JSON.parse(legacy) as unknown) : [];
      const migrated = parseStoredUsage(parsed);
      if (Object.keys(migrated).length > 0) {
        await keyboardBridge.setRecentEmojis(JSON.stringify(migrated));
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      return migrated;
    } catch {
      return [];
    }
  }
}

function parseStoredUsage(value: unknown): StoredEmojiUsage {
  if (Array.isArray(value)) {
    const migrated: StoredEmojiUsage = {};
    value.forEach((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        migrated[item] = {
          count: 1,
          lastUsedAt: Math.max(1, value.length - index),
        };
      }
    });
    return migrated;
  }

  if (!value || typeof value !== 'object') {
    return {};
  }

  const parsed: StoredEmojiUsage = {};
  for (const [emoji, entry] of Object.entries(value)) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as EmojiUsage).count === 'number' &&
      typeof (entry as EmojiUsage).lastUsedAt === 'number'
    ) {
      parsed[emoji] = {
        count: Math.max(0, Math.floor((entry as EmojiUsage).count)),
        lastUsedAt: (entry as EmojiUsage).lastUsedAt,
      };
    }
  }
  return parsed;
}

function getVisibleRecents(): string[] {
  return Object.entries(usage)
    .filter(([, entry]) => entry.count >= MIN_RECENT_EMOJI_USES)
    .sort(
      ([, left], [, right]) =>
        right.count - left.count || right.lastUsedAt - left.lastUsedAt,
    )
    .slice(0, MAX_RECENT_EMOJIS)
    .map(([emoji]) => emoji);
}

function schedulePersistRecents(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void keyboardBridge.setRecentEmojis(JSON.stringify(usage));
  }, PERSIST_DEBOUNCE_MS);
}

export async function ensureRecentEmojisLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    usage = await readRecentsFromStorage();
    recentsVersion += 1;
  })();

  return loadPromise;
}

export function resetRecentEmojisCache(): void {
  loadPromise = null;
}

export function getRecentEmojis(): readonly string[] {
  return getVisibleRecents();
}

export function getRecentEmojisVersion(): number {
  return recentsVersion;
}

/** Record a use; an emoji becomes recent after repeated use. */
export function touchRecentEmoji(emoji: string): readonly string[] | null {
  const trimmed = emoji.trim();
  if (!trimmed) {
    return null;
  }

  const previous = getVisibleRecents().join('\u0000');
  const current = usage[trimmed] ?? {count: 0, lastUsedAt: 0};
  usage[trimmed] = {
    count: current.count + 1,
    lastUsedAt: Date.now(),
  };
  const next = getVisibleRecents();
  recentsVersion += 1;
  schedulePersistRecents();
  return next.join('\u0000') === previous ? null : next;
}

export async function recordRecentEmoji(emoji: string): Promise<void> {
  await ensureRecentEmojisLoaded();
  touchRecentEmoji(emoji);
}
