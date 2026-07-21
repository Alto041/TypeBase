import {keyboardBridge} from '../keyboardBridge';
import {addLearnedWord} from '../autocorrect/dictionaryManager';

const learnedCounts = new Map<string, number>();
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;

export function isLearnableWord(word: string): boolean {
  const normalized = word.trim().toLowerCase();
  // Letters only (no digits) — supports accented Latin, Cyrillic, Arabic, etc.
  // Apostrophes allowed for contractions the user confirmed (it's, don't).
  return (
    normalized.length >= 2 &&
    /^[\p{L}\p{M}']+$/u.test(normalized) &&
    !normalized.includes("''")
  );
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
  // Boost the live SymSpell instance(s) for the active (and cached) language(s).
  addLearnedWord(normalized);
}

/** Lower swipe score is better; small nudge for words the user has typed before. */
export function learnedSwipeBonus(uses: number): number {
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 0.08 + Math.log10(uses + 1) * 0.08, 0.45);
}

export function learnedRankBoost(uses: number): number {
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 80, 4000);
}
