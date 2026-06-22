import {keyboardBridge} from '../keyboardBridge';

const learnedCounts = new Map<string, number>();
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;

export function isLearnableWord(word: string): boolean {
  const normalized = word.trim().toLowerCase();
  return normalized.length >= 2 && /^[a-z]+$/.test(normalized);
}

export function normalizeLearnedWord(word: string): string {
  return word.trim().toLowerCase();
}

export function resetLearnedDictionaryCache(): void {
  loadGeneration += 1;
  learnedCounts.clear();
  loadPromise = null;
}

export async function ensureLearnedDictionaryLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  const generation = loadGeneration;
  loadPromise = (async () => {
    const counts = await keyboardBridge.getLearnedWordCounts();
    if (generation !== loadGeneration) {
      return;
    }
    learnedCounts.clear();
    for (const [word, count] of Object.entries(counts)) {
      if (count > 0) {
        learnedCounts.set(word, count);
      }
    }
  })();

  return loadPromise;
}

export async function reloadLearnedDictionaryFromStorage(): Promise<void> {
  resetLearnedDictionaryCache();
  await ensureLearnedDictionaryLoaded();
}

export function getLearnedCounts(): ReadonlyMap<string, number> {
  return learnedCounts;
}

export async function clearLearnedDictionary(): Promise<void> {
  resetLearnedDictionaryCache();
  const cleared = await keyboardBridge.clearLearnedWords();
  if (!cleared) {
    throw new Error('Failed to clear learned words');
  }
  loadPromise = Promise.resolve();
}

export function recordLearnedWord(word: string): void {
  if (!isLearnableWord(word)) {
    return;
  }

  const normalized = normalizeLearnedWord(word);
  const nextCount = (learnedCounts.get(normalized) ?? 0) + 1;
  learnedCounts.set(normalized, nextCount);
  keyboardBridge.recordLearnedWord(normalized);
}

/** Lower swipe score is better; scales with how often the user typed the word. */
export function learnedSwipeBonus(uses: number): number {
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 0.24 + Math.log10(uses + 1) * 0.2, 1.35);
}

export function learnedRankBoost(uses: number): number {
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 80, 4000);
}
