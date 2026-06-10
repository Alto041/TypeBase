import englishWords from './data/englishWords.json';
import {
  getLearnedCounts,
  learnedRankBoost,
} from '../suggestions/learnedDictionary';

const WORDS = englishWords as string[];

const byFirstLetter = new Map<string, Array<{word: string; rank: number}>>();
const STATIC_RANK = new Map<string, number>();

for (let rank = 0; rank < WORDS.length; rank++) {
  const word = WORDS[rank].toLowerCase();
  if (word.length < 2 || word.length > 16 || !/^[a-z]+$/.test(word)) {
    continue;
  }
  STATIC_RANK.set(word, rank);
  const first = word[0];
  const bucket = byFirstLetter.get(first) ?? [];
  bucket.push({word, rank});
  byFirstLetter.set(first, bucket);
}

export function isPatternSubsequence(pattern: string, word: string): boolean {
  if (!pattern) {
    return true;
  }
  let patternIndex = 0;
  for (const char of word) {
    if (char === pattern[patternIndex]) {
      patternIndex += 1;
    }
    if (patternIndex === pattern.length) {
      return true;
    }
  }
  return false;
}

/** Allow up to `maxEdits` skipped/extra chars when matching pattern to word. */
/** Swipe trace is usually longer/noisier than the intended word. */
export function wordMatchesTrace(
  word: string,
  trace: string,
  maxEdits = 2,
): boolean {
  if (isPatternSubsequence(word, trace)) {
    return true;
  }
  return fuzzyMatchesPattern(word, trace, maxEdits);
}

export function traceEditBudget(trace: string): number {
  if (trace.length <= 3) {
    return 1;
  }
  if (trace.length <= 5) {
    return 2;
  }
  if (trace.length <= 8) {
    return 3;
  }
  return Math.min(7, Math.max(3, Math.floor(trace.length / 2)));
}

export function fuzzyMatchesPattern(
  pattern: string,
  word: string,
  maxEdits = 2,
): boolean {
  if (isPatternSubsequence(pattern, word)) {
    return true;
  }

  const rows = pattern.length + 1;
  const cols = word.length + 1;
  const dp: number[][] = Array.from({length: rows}, () =>
    Array.from({length: cols}, () => Infinity),
  );
  dp[0][0] = 0;

  for (let i = 0; i <= pattern.length; i++) {
    for (let j = 0; j <= word.length; j++) {
      if (i === 0 && j === 0) {
        continue;
      }
      if (i > 0) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 1][j] + 1);
      }
      if (j > 0) {
        dp[i][j] = Math.min(dp[i][j], dp[i][j - 1] + 1);
      }
      if (i > 0 && j > 0) {
        const cost = pattern[i - 1] === word[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i][j], dp[i - 1][j - 1] + cost);
      }
    }
  }

  return dp[pattern.length][word.length] <= maxEdits;
}

export function getSwipeCandidates(
  pattern: string,
  maxCandidates = 420,
): Array<{word: string; rank: number}> {
  const normalized = pattern.toLowerCase();
  const first = normalized[0];
  if (!first || !/^[a-z]$/.test(first)) {
    return [];
  }

  const maxEdits = traceEditBudget(normalized);
  const seen = new Set<string>();
  const results: Array<{word: string; rank: number}> = [];

  const push = (word: string, rank: number) => {
    if (seen.has(word)) {
      return false;
    }
    if (word.length < 2 || word.length > 16) {
      return false;
    }
    if (!wordMatchesTrace(word, normalized, maxEdits)) {
      return false;
    }
    seen.add(word);
    results.push({word, rank});
    return true;
  };

  const learned = getLearnedCounts();
  const learnedByCount = [...learned.entries()]
    .filter(([word, count]) => count > 0 && word[0] === first)
    .sort((a, b) => b[1] - a[1]);

  for (const [word, count] of learnedByCount) {
    const staticRank = STATIC_RANK.get(word);
    const rank =
      staticRank != null
        ? Math.max(0, staticRank - learnedRankBoost(count))
        : Math.max(0, 2500 - learnedRankBoost(count));
    if (push(word, rank) && results.length >= maxCandidates) {
      return results;
    }
  }

  for (let rank = 0; rank < WORDS.length; rank++) {
    const word = WORDS[rank].toLowerCase();
    if (word[0] !== first) {
      continue;
    }
    if (push(word, rank) && results.length >= maxCandidates) {
      return results;
    }
  }

  return results;
}

export function isKnownWord(word: string): boolean {
  return STATIC_RANK.has(word.toLowerCase());
}

export function isValidSwipeCommit(word: string): boolean {
  if (!word || !/^[a-zA-Z]+$/.test(word)) {
    return false;
  }

  const lower = word.toLowerCase();
  if (lower.length < 2 || lower.length > 16) {
    return false;
  }

  if (isKnownWord(lower)) {
    return true;
  }

  return (getLearnedCounts().get(lower) ?? 0) > 0;
}

export function getWordsByFirstLetter(
  letter: string,
  maxWords = 400,
): Array<{word: string; rank: number}> {
  const normalized = letter.toLowerCase();
  if (!/^[a-z]$/.test(normalized)) {
    return [];
  }
  return (byFirstLetter.get(normalized) ?? []).slice(0, maxWords);
}
