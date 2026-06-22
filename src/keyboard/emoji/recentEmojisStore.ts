import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'typebase_recent_emojis';
export const MAX_RECENT_EMOJIS = 40;

let recents: string[] = [];
let loadPromise: Promise<void> | null = null;

export async function ensureRecentEmojisLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      recents = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      recents = [];
    }
  })();

  return loadPromise;
}

export function getRecentEmojis(): readonly string[] {
  return recents;
}

export async function recordRecentEmoji(emoji: string): Promise<void> {
  const trimmed = emoji.trim();
  if (!trimmed) {
    return;
  }

  await ensureRecentEmojisLoaded();
  recents = [trimmed, ...recents.filter(item => item !== trimmed)].slice(
    0,
    MAX_RECENT_EMOJIS,
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
}
