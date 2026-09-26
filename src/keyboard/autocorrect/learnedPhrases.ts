import type {LearningSource} from '../personalTyping/types';
import {
  ensurePersonalTypingLoaded,
  findPersonalPhraseMultiWordFix,
  getLearnedPhraseMap,
  observePhraseCommitted,
  observePhrasesCommitted,
  queryPhrasesByPrefix,
  reloadPersonalTypingFromStorage,
  resetPersonalTypingCache,
} from '../personalTyping/personalTypingEngine';
import {
  isLearnablePhrase,
  normalizePhrase,
} from '../personalTyping/learnedText';

export {normalizePhrase, isLearnablePhrase};

export function resetLearnedPhrasesCache(): void {
  resetPersonalTypingCache();
}

export async function ensureLearnedPhrasesLoaded(): Promise<void> {
  await ensurePersonalTypingLoaded();
}

export async function reloadLearnedPhrasesFromStorage(): Promise<void> {
  await reloadPersonalTypingFromStorage();
}

export function getLearnedPhraseCounts(): ReadonlyMap<string, number> {
  return getLearnedPhraseMap();
}

export async function clearLearnedPhrasesStore(): Promise<void> {
  const {clearPersonalTypingProfile} = await import(
    '../personalTyping/personalTypingEngine'
  );
  await clearPersonalTypingProfile();
}

export function recordLearnedPhrase(
  phrase: string,
  source: LearningSource = 'typed',
): void {
  observePhraseCommitted(phrase, source);
}

export function extractTrailingWords(text: string, maxWords: number): string[] {
  // Capture trailing words made of unicode letters (for learned phrases across scripts).
  const match = text.match(/(?:^|\s)([\p{L}\p{M}']+(?:\s+[\p{L}\p{M}']+)*)$/u);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\s+/)
    .map(word => word.toLowerCase())
    .slice(-maxWords);
}

export type PhraseCorrection = {
  phrase: string;
  replaceLength: number;
};

export function getPhraseCorrection(
  context: string,
  typedWord: string,
): PhraseCorrection | null {
  if (!typedWord || typedWord.length < 2) {
    return null;
  }

  const fix = findPersonalPhraseMultiWordFix(context, typedWord, 8);
  if (!fix) {
    return null;
  }

  return {
    phrase: fix.phrase,
    replaceLength: fix.replaceLength,
  };
}

export function learnPhrasesFromContext(context: string): void {
  const trailing = extractTrailingWords(context, 6);
  const phrases: string[] = [];
  for (let length = 2; length <= Math.min(trailing.length, 5); length++) {
    phrases.push(trailing.slice(-length).join(' '));
  }
  if (phrases.length > 0) {
    observePhrasesCommitted(phrases, 'typed');
  }
}

export function getPhraseSuggestions(context: string, limit = 2): string[] {
  const trailing = extractTrailingWords(context, 3);
  if (trailing.length === 0) {
    return [];
  }

  const prefix = trailing.join(' ');
  return queryPhrasesByPrefix(prefix, limit);
}
