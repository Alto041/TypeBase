import type {LearningSource} from '../personalTyping/types';
import {
  ensurePersonalTypingLoaded,
  getLearnedPhraseMap,
  observePhraseCommitted,
  observePhrasesCommitted,
  queryPhraseCorrectionCandidates,
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
  // Capture trailing 1-4 words made of unicode letters (for learned phrases across scripts).
  const match = text.match(/(?:^|\s)([\p{L}\p{M}']+(?:\s+[\p{L}\p{M}']+)*)$/u);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\s+/)
    .map(word => word.toLowerCase())
    .slice(-maxWords);
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const row = Array.from({length: b.length + 1}, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = temp;
    }
  }
  return row[b.length];
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

  const trailing = extractTrailingWords(context, 4);
  if (trailing.length < 2) {
    return null;
  }

  const typedLower = typedWord.toLowerCase();
  if (trailing[trailing.length - 1] !== typedLower) {
    return null;
  }

  const priorWords = trailing.slice(0, -1);
  const lead = priorWords.join(' ');
  let best: {phrase: string; score: number; replaceLength: number} | null = null;

  for (const item of queryPhraseCorrectionCandidates(lead, typedWord)) {
    const targetWord = item.lastWord;
    if (targetWord === typedLower) {
      continue;
    }

    const maxEdits = typedLower.length <= 4 ? 1 : 2;
    const edits = levenshtein(typedLower, targetWord);
    if (edits > maxEdits) {
      continue;
    }

    const score = item.weight - edits * 25;
    const replaceLength = [...priorWords, typedWord].join(' ').length;

    if (!best || score > best.score) {
      best = {phrase: item.phrase, score, replaceLength};
    }
  }

  if (!best || best.score < 8) {
    return null;
  }

  return {
    phrase: best.phrase,
    replaceLength: best.replaceLength,
  };
}

export function learnPhrasesFromContext(context: string): void {
  const trailing = extractTrailingWords(context, 4);
  const phrases: string[] = [];
  for (let length = 2; length <= Math.min(trailing.length, 4); length++) {
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
