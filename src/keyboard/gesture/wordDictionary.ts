import {
  getBaseWords,
  hasDictionaryWord,
  isEnglishSymSpellReady,
  lookupSwipeCandidatesSync,
} from '../autocorrect/dictionaryManager';
import {rankFromSymSpellFrequency} from '../autocorrect/englishFrequencyDictionary';
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

const MAX_SWIPE_WORD_LENGTH = 22;

type SwipeCandidate = {word: string; rank: number};

/** Words we may insert after a swipe — never the raw crossed-key trail. */
export function isCommitableSwipeWord(word: string): boolean {
  const lower = word.trim().toLowerCase();
  if (
    lower.length < 2 ||
    lower.length > MAX_SWIPE_WORD_LENGTH ||
    !/^[a-z]+$/.test(lower)
  ) {
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
    return isEnglishSymSpellReady()
      ? hasDictionaryWord(word)
      : (getLearnedCounts().get(word.toLowerCase()) ?? 0) > 0;
  }

  // Shortcuts can skip mid keys — allow a small length surplus for long words.
  if (wordKeys.length > collapsed.length) {
    const skipBudget = Math.min(
      3,
      Math.max(1, Math.floor(wordKeys.length / 5)),
    );
    if (wordKeys.length - collapsed.length > skipBudget) {
      return false;
    }
    return fuzzyMatchesPattern(collapsed, wordKeys, skipBudget + 1);
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

function quickTraceReject(word: string, collapsed: string): boolean {
  const wordKeys = wordKeySequence(word);
  if (isPatternSubsequence(wordKeys, collapsed)) {
    return false;
  }
  if (
    isPatternSubsequence(collapsed, wordKeys) &&
    Math.abs(wordKeys.length - collapsed.length) <= 2
  ) {
    return false;
  }
  return wordKeys.length > collapsed.length + 3;
}

/**
 * Swipe candidates come from SymSpell (same dictionary as autocorrect) plus
 * learned words. Dictionary source: SymSpell frequency_dictionary_en (~82k words).
 */
function getSwipeCandidatesJs(
  pattern: string,
  maxCandidates = 100,
): SwipeCandidate[] {
  const normalized = pattern.toLowerCase();
  const first = normalized[0];
  if (!first || !/^[a-z]$/.test(first)) {
    return [];
  }

  const collapsed = collapseTracePattern(normalized);
  const seen = new Map<string, number>();

  const tryAdd = (
    word: string,
    rank: number,
    options?: {fromSymSpell?: boolean},
  ) => {
    if (
      word.length < 2 ||
      word.length > MAX_SWIPE_WORD_LENGTH ||
      word[0] !== first
    ) {
      return;
    }
    if (quickTraceReject(word, collapsed)) {
      return;
    }
    if (!options?.fromSymSpell && !isCommitableSwipeWord(word)) {
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

  const preferMinLen =
    collapsed.length >= 12 ? 7 : collapsed.length >= 8 ? 5 : 2;

  if (isEnglishSymSpellReady()) {
    const lookupPatterns =
      collapsed === normalized ? [normalized] : [collapsed, normalized];

    for (const lookupPattern of lookupPatterns) {
      if (seen.size >= maxCandidates) {
        break;
      }
      const maxEd = Math.min(2, traceEditBudget(lookupPattern));
      const symMatches = lookupSwipeCandidatesSync(
        lookupPattern,
        maxEd,
        maxCandidates,
      );
      for (const match of symMatches) {
        tryAdd(
          match.word,
          rankFromSymSpellFrequency(match.word, match.count, match.edits),
          {fromSymSpell: true},
        );
        if (seen.size >= maxCandidates) {
          break;
        }
      }
    }
  }

  // Bilingual layouts only — English uses SymSpell + learned words.
  const baseWords = getBaseWords();
  if (baseWords.length > 0 && seen.size < maxCandidates) {
    let scanned = 0;
    for (let rank = 0; rank < baseWords.length; rank += 1) {
      if (seen.size >= maxCandidates || scanned >= maxCandidates * 3) {
        break;
      }
      const word = baseWords[rank]!.toLowerCase();
      scanned += 1;
      if (
        word[0] !== first ||
        word.length < preferMinLen ||
        word.length > MAX_SWIPE_WORD_LENGTH
      ) {
        continue;
      }
      tryAdd(word, rank);
    }
  }

  const learned = getLearnedCounts();
  for (const [word, count] of learned.entries()) {
    if (count <= 0 || word[0] !== first || seen.size >= maxCandidates) {
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
  maxCandidates = 100,
): SwipeCandidate[] {
  return getSwipeCandidatesJs(pattern, maxCandidates);
}

export async function getSwipeCandidates(
  pattern: string,
  maxCandidates = 100,
): Promise<SwipeCandidate[]> {
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
  maxWords = 120,
): SwipeCandidate[] {
  const normalized = letter.toLowerCase();
  if (!/^[a-z]$/.test(normalized)) {
    return [];
  }

  const baseWords = getBaseWords();
  if (!baseWords.length) {
    return [];
  }

  const out: SwipeCandidate[] = [];
  for (let rank = 0; rank < baseWords.length; rank += 1) {
    const word = baseWords[rank]!.toLowerCase();
    if (
      word[0] === normalized &&
      word.length >= 2 &&
      word.length <= MAX_SWIPE_WORD_LENGTH
    ) {
      out.push({word, rank});
      if (out.length >= maxWords) {
        break;
      }
    }
  }
  return out;
}
