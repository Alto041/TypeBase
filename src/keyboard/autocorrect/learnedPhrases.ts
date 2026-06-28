import {keyboardBridge} from '../keyboardBridge';

const phraseCounts = new Map<string, number>();
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isLearnablePhrase(phrase: string): boolean {
  const normalized = normalizePhrase(phrase);
  const words = normalized.split(' ');
  if (words.length < 2 || words.length > 4) {
    return false;
  }
  return words.every(word => word.length >= 2 && /^[\p{L}\p{M}]+$/u.test(word));
}

export function resetLearnedPhrasesCache(): void {
  loadGeneration += 1;
  phraseCounts.clear();
  loadPromise = null;
}

export async function ensureLearnedPhrasesLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  const generation = loadGeneration;
  loadPromise = (async () => {
    const counts = await keyboardBridge.getLearnedPhraseCounts();
    if (generation !== loadGeneration) {
      return;
    }
    phraseCounts.clear();
    for (const [phrase, count] of Object.entries(counts)) {
      if (count > 0) {
        phraseCounts.set(phrase, count);
      }
    }
  })();

  return loadPromise;
}

export async function reloadLearnedPhrasesFromStorage(): Promise<void> {
  resetLearnedPhrasesCache();
  await ensureLearnedPhrasesLoaded();
}

export function getLearnedPhraseCounts(): ReadonlyMap<string, number> {
  return phraseCounts;
}

export async function clearLearnedPhrasesStore(): Promise<void> {
  resetLearnedPhrasesCache();
  const cleared = await keyboardBridge.clearLearnedPhrases();
  if (!cleared) {
    throw new Error('Failed to clear learned phrases');
  }
  loadPromise = Promise.resolve();
}

export function recordLearnedPhrase(phrase: string): void {
  if (!isLearnablePhrase(phrase)) {
    return;
  }

  const normalized = normalizePhrase(phrase);
  const nextCount = (phraseCounts.get(normalized) ?? 0) + 1;
  phraseCounts.set(normalized, nextCount);
  keyboardBridge.recordLearnedPhrase(normalized);
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
  let best: {phrase: string; score: number; replaceLength: number} | null = null;

  for (const [phrase, uses] of phraseCounts.entries()) {
    if (uses <= 0) {
      continue;
    }

    const phraseWords = phrase.split(' ');
    if (phraseWords.length < 2 || phraseWords.length !== priorWords.length + 1) {
      continue;
    }

    if (phraseWords.slice(0, -1).join(' ') !== priorWords.join(' ')) {
      continue;
    }

    const targetWord = phraseWords[phraseWords.length - 1];
    if (targetWord === typedLower) {
      continue;
    }

    const maxEdits = typedLower.length <= 4 ? 1 : 2;
    const edits = levenshtein(typedLower, targetWord);
    if (edits > maxEdits) {
      continue;
    }

    const score = uses * 10 - edits * 25;
    const replaceLength = [...priorWords, typedWord].join(' ').length;

    if (!best || score > best.score) {
      best = {phrase, score, replaceLength};
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
  for (let length = 2; length <= Math.min(trailing.length, 4); length++) {
    recordLearnedPhrase(trailing.slice(-length).join(' '));
  }
}

export function getPhraseSuggestions(context: string, limit = 2): string[] {
  const trailing = extractTrailingWords(context, 3);
  if (trailing.length === 0) {
    return [];
  }

  const prefix = trailing.join(' ');
  const results: Array<{phrase: string; score: number}> = [];

  for (const [phrase, uses] of phraseCounts.entries()) {
    if (uses <= 0 || !phrase.startsWith(prefix) || phrase === prefix) {
      continue;
    }
    results.push({phrase, score: uses * 10 - phrase.length});
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.phrase);
}
