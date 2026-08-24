import type {LearningSource} from '../personalTyping/types';
import {addLearnedWord} from '../autocorrect/dictionaryManager';
import {
  ensurePersonalTypingLoaded,
  getLearnedWordMap,
  observeWordCommitted,
  reloadPersonalTypingFromStorage,
  resetPersonalTypingCache,
  learnedRankBoostFromPersonal,
  learnedSwipeBonusFromPersonal,
} from '../personalTyping/personalTypingEngine';
import {
  isLearnableWord,
  normalizeLearnedWord,
} from '../personalTyping/learnedText';

export {isLearnableWord, normalizeLearnedWord};

export function resetLearnedDictionaryCache(): void {
  resetPersonalTypingCache();
}

export async function ensureLearnedDictionaryLoaded(): Promise<void> {
  await ensurePersonalTypingLoaded();
}

export async function reloadLearnedDictionaryFromStorage(): Promise<void> {
  await reloadPersonalTypingFromStorage();
}

export function getLearnedCounts(): ReadonlyMap<string, number> {
  return getLearnedWordMap();
}

export async function clearLearnedDictionary(): Promise<void> {
  const {clearPersonalTypingProfile} = await import(
    '../personalTyping/personalTypingEngine'
  );
  await clearPersonalTypingProfile();
}

export function recordLearnedWord(
  word: string,
  source: LearningSource = 'typed',
): void {
  if (!isLearnableWord(word)) {
    return;
  }

  const normalized = normalizeLearnedWord(word);
  observeWordCommitted(normalized, source);
  addLearnedWord(normalized);
}

/** Lower swipe score is better; small nudge for words the user has typed before. */
export function learnedSwipeBonus(uses: number, word?: string): number {
  if (word) {
    return learnedSwipeBonusFromPersonal(word);
  }
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 0.08 + Math.log10(uses + 1) * 0.08, 0.45);
}

export function learnedRankBoost(uses: number, word?: string): number {
  if (word) {
    return learnedRankBoostFromPersonal(word);
  }
  if (uses <= 0) {
    return 0;
  }

  return Math.min(uses * 80, 4000);
}
