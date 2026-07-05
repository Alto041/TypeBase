import {
  getBaseWords,
  hasDictionaryWord,
  lookupSwipeCandidatesSync,
  symSpellRank,
} from '../autocorrect/dictionaryManager';
import {
  getLearnedCounts,
  learnedRankBoost,
} from '../suggestions/learnedDictionary';

/** Collapse consecutive duplicate letters in a crossed-key trace. */
export function collapseTracePattern(trace: string): string {
  let previous = '';
  let sequence = '';
  for (const char of trace) {
    if (char !== previous) {
      sequence += char;
      previous = char;
    }
  }
  return sequence;
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

export function wordKeySequence(word: string): string {
  return collapseTracePattern(word.toLowerCase());
}

/** Words we may insert after a swipe — never the raw crossed-key trail. */
export function isCommitableSwipeWord(word: string): boolean {
  const lower = word.trim().toLowerCase();
  if (lower.length < 2 || lower.length > 16 || !/^[a-z]+$/.test(lower)) {
    return false;
  }
  return hasDictionaryWord(lower) || (getLearnedCounts().get(lower) ?? 0) > 0;
}

/** Whether the word's key path follows the finger's crossed-key trace in order. */
export function wordAlignsWithTrace(word: string, trace: string): boolean {
  const collapsed = collapseTracePattern(trace.toLowerCase());
  const wordKeys = wordKeySequence(word);
  if (!collapsed || wordKeys.length < 1) {
    return false;
  }

  // The noisy key trail itself is not a word (e.g. jkokijnbhg).
  if (wordKeys === collapsed || word.toLowerCase() === collapsed) {
    return hasDictionaryWord(word);
  }

  // Real words are shorter than the keys the finger crossed.
  if (wordKeys.length > collapsed.length) {
    return false;
  }

  if (isPatternSubsequence(wordKeys, collapsed)) {
    return true;
  }

  if (
    isPatternSubsequence(collapsed, wordKeys) &&
    Math.abs(wordKeys.length - collapsed.length) <= 1
  ) {
    return true;
  }

  const fuzzyBudget = Math.min(
    3,
    Math.max(1, Math.floor(collapsed.length / 4)),
  );
  return fuzzyMatchesPattern(wordKeys, collapsed, fuzzyBudget);
}

export function wordMatchesTrace(
  word: string,
  trace: string,
  _maxEdits = 2,
): boolean {
  return wordAlignsWithTrace(word, trace);
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

/**
 * Swipe candidates come from SymSpell (same dictionary as autocorrect) plus
 * learned words. Dictionary source: src/keyboard/gesture/data/englishWords.txt
 * synced via `npm run sync:words` — do not edit Android assets by hand.
 */
function getSwipeCandidatesJs(
  pattern: string,
  maxCandidates = 280,
): Array<{word: string; rank: number}> {
  const normalized = pattern.toLowerCase();
  const first = normalized[0];
  if (!first || !/^[a-z]$/.test(first)) {
    return [];
  }

  const collapsed = collapseTracePattern(normalized);
  const seen = new Map<string, number>();

  const tryAdd = (word: string, rank: number) => {
    if (word.length < 2 || word.length > 16 || word[0] !== first) {
      return;
    }
    if (!isCommitableSwipeWord(word)) {
      return;
    }
    if (!wordAlignsWithTrace(word, normalized)) {
      return;
    }
    const existing = seen.get(word);
    if (existing == null || rank < existing) {
      seen.set(word, rank);
    }
  };

  const lookupPatterns =
    collapsed === normalized ? [normalized] : [collapsed, normalized];

  for (const lookupPattern of lookupPatterns) {
    const maxEd = Math.min(3, traceEditBudget(lookupPattern.length));
    const symMatches = lookupSwipeCandidatesSync(
      lookupPattern,
      maxEd,
      maxCandidates,
    );
    for (const match of symMatches) {
      tryAdd(match.word, symSpellRank(match.word, match.edits));
    }
  }

  const learned = getLearnedCounts();
  for (const [word, count] of learned.entries()) {
    if (count <= 0 || word[0] !== first) {
      continue;
    }
    tryAdd(word, Math.max(0, 2500 - learnedRankBoost(count)));
  }

  return [...seen.entries()]
    .map(([word, rank]) => ({word, rank}))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxCandidates);
}

export function getSwipeCandidatesSync(
  pattern: string,
  maxCandidates = 280,
): Array<{word: string; rank: number}> {
  return getSwipeCandidatesJs(pattern, maxCandidates);
}

export async function getSwipeCandidates(
  pattern: string,
  maxCandidates = 280,
): Promise<Array<{word: string; rank: number}>> {
  return getSwipeCandidatesSync(pattern, maxCandidates);
}

export function isKnownWord(word: string): boolean {
  return hasDictionaryWord(word);
}

export function isValidSwipeCommit(word: string): boolean {
  return isCommitableSwipeWord(word);
}

export function getWordsByFirstLetter(
  letter: string,
  maxWords = 400,
): Array<{word: string; rank: number}> {
  const normalized = letter.toLowerCase();
  if (!/^[a-z]$/.test(normalized)) {
    return [];
  }

  return getBaseWords()
    .map((word, rank) => ({word: word.toLowerCase(), rank}))
    .filter(({word}) => word[0] === normalized && word.length >= 2 && word.length <= 16)
    .slice(0, maxWords);
}
