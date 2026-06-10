import englishWords from '../gesture/data/englishWords.json';
import {getAutocorrectSettings} from './autocorrectStore';
import {getLearnedCounts} from '../suggestions/learnedDictionary';
import {applyCaseToWord} from '../suggestions/wordSuggestions';

const WORDS = englishWords as string[];
const STATIC_RANK = new Map<string, number>(
  WORDS.map((word, index) => [word, index]),
);
const STATIC_BY_FIRST = new Map<string, string[]>();

for (const word of WORDS) {
  if (word.length < 2 || !/^[a-z]+$/.test(word)) {
    continue;
  }
  const first = word[0];
  const bucket = STATIC_BY_FIRST.get(first);
  if (bucket) {
    bucket.push(word);
  } else {
    STATIC_BY_FIRST.set(first, [word]);
  }
}

const MIN_AUTO_CONFIDENCE = 0.72;
const COMMON_WORD_RANK = 3500;

export type AutocorrectCandidate = {
  correction: string;
  confidence: number;
};

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

function maxEditDistance(length: number): number {
  if (length <= 3) {
    return 1;
  }
  if (length <= 6) {
    return 1;
  }
  return 2;
}

function isProtectedWord(word: string, learnedUses: number): boolean {
  const rank = STATIC_RANK.get(word);
  if (rank != null && rank < COMMON_WORD_RANK) {
    return true;
  }
  return learnedUses >= 1;
}

function hasIntentionalCasing(word: string): boolean {
  if (word === word.toLowerCase() || word === word.toUpperCase()) {
    return false;
  }
  if (
    word[0] === word[0].toUpperCase() &&
    word.slice(1) === word.slice(1).toLowerCase()
  ) {
    return false;
  }
  return true;
}

function startsWithCapital(word: string): boolean {
  const first = word[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

/** Capitalized words that aren't common English — almost always names. */
function isProbablyProperNoun(word: string): boolean {
  if (!startsWithCapital(word)) {
    return false;
  }

  const lower = word.toLowerCase();
  const rank = STATIC_RANK.get(lower);
  const learnedUses = getLearnedCounts().get(lower) ?? 0;
  if (learnedUses >= 1) {
    return false;
  }

  return rank == null || rank >= COMMON_WORD_RANK;
}

function isAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 2) {
    return false;
  }

  const mismatches: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      mismatches.push(i);
    }
  }

  if (mismatches.length !== 2) {
    return false;
  }

  const [first, second] = mismatches;
  return (
    second === first + 1 && a[first] === b[second] && a[second] === b[first]
  );
}

/** Missing/extra letters at the end, or a simple letter swap (teh → the). */
function isPlausibleTypo(typed: string, candidate: string): boolean {
  if (candidate.startsWith(typed) || typed.startsWith(candidate)) {
    return true;
  }

  return isAdjacentTransposition(typed, candidate);
}

/** e.g. "arun" → "run" (drops the first letter). */
function isLikelyNameTrap(typedLower: string, candidate: string): boolean {
  if (typedLower.length > candidate.length && typedLower.slice(1) === candidate) {
    return true;
  }

  if (
    typedLower.length === candidate.length + 1 &&
    typedLower.slice(1) === candidate
  ) {
    return true;
  }

  return false;
}

function scoreCandidate(
  typed: string,
  candidate: string,
  edits: number,
  learnedUses: number,
  staticRank: number,
): number {
  return (
    edits * 100 -
    learnedUses * 18 -
    Math.max(0, 5000 - staticRank) * 0.02 -
    (candidate.startsWith(typed.slice(0, 2)) ? 6 : 0)
  );
}

function toConfidence(
  typed: string,
  candidate: string,
  edits: number,
  learnedUses: number,
  staticRank: number,
): number {
  let confidence = edits === 1 ? 0.8 : 0.58;
  if (learnedUses >= 2) {
    confidence += Math.min(learnedUses * 0.05, 0.2);
  }
  if (staticRank < 1200) {
    confidence += 0.07;
  }
  if (candidate.length > typed.length && candidate.startsWith(typed)) {
    confidence += 0.08;
  }
  if (typed.length <= 3 && edits > 1) {
    confidence -= 0.25;
  }
  if (edits === 2 && learnedUses === 0 && staticRank > 8000) {
    confidence -= 0.12;
  }
  return Math.min(Math.max(confidence, 0), 0.98);
}

function collectCandidates(typed: string): Array<{
  word: string;
  edits: number;
  learnedUses: number;
  staticRank: number;
}> {
  const learned = getLearnedCounts();
  const maxEdits = maxEditDistance(typed.length);
  const lengthMin = Math.max(1, typed.length - maxEdits);
  const lengthMax = typed.length + maxEdits;
  const results: Array<{
    word: string;
    edits: number;
    learnedUses: number;
    staticRank: number;
  }> = [];
  const seen = new Set<string>();

  const consider = (word: string, learnedUses: number, staticRank: number) => {
    if (seen.has(word) || word === typed) {
      return;
    }
    if (word.length < lengthMin || word.length > lengthMax) {
      return;
    }
    const edits = levenshtein(typed, word);
    if (edits > maxEdits) {
      return;
    }
    seen.add(word);
    results.push({word, edits, learnedUses, staticRank});
  };

  for (const [word, uses] of learned.entries()) {
    if (uses > 0) {
      consider(word, uses, STATIC_RANK.get(word) ?? 60_000);
    }
  }

  const bucket = STATIC_BY_FIRST.get(typed[0]) ?? [];
  for (const word of bucket) {
    consider(word, learned.get(word) ?? 0, STATIC_RANK.get(word) ?? 60_000);
  }

  if (typed.length >= 2) {
    const altBucket = STATIC_BY_FIRST.get(typed[1]);
    if (altBucket) {
      for (const word of altBucket) {
        consider(word, learned.get(word) ?? 0, STATIC_RANK.get(word) ?? 60_000);
      }
    }
  }

  return results;
}

export function getAutocorrectCandidate(
  typedWord: string,
): AutocorrectCandidate | null {
  const typed = typedWord.trim();
  if (typed.length < 2 || !/^[a-zA-Z]+$/.test(typed)) {
    return null;
  }
  if (hasIntentionalCasing(typed)) {
    return null;
  }
  if (isProbablyProperNoun(typed)) {
    return null;
  }

  const lower = typed.toLowerCase();
  const learned = getLearnedCounts();
  const learnedUses = learned.get(lower) ?? 0;

  if (isProtectedWord(lower, learnedUses)) {
    return null;
  }

  const candidates = collectCandidates(lower);
  if (candidates.length === 0) {
    return null;
  }

  let best: {
    word: string;
    edits: number;
    learnedUses: number;
    staticRank: number;
    score: number;
  } | null = null;

  for (const candidate of candidates) {
    const score = scoreCandidate(
      lower,
      candidate.word,
      candidate.edits,
      candidate.learnedUses,
      candidate.staticRank,
    );
    if (!best || score < best.score) {
      best = {...candidate, score};
    }
  }

  if (!best || isLikelyNameTrap(lower, best.word)) {
    return null;
  }

  const learnedCorrection = best.learnedUses >= 2;
  if (!learnedCorrection && !isPlausibleTypo(lower, best.word)) {
    return null;
  }

  const confidence = toConfidence(
    lower,
    best.word,
    best.edits,
    best.learnedUses,
    best.staticRank,
  );
  if (confidence < MIN_AUTO_CONFIDENCE) {
    return null;
  }

  return {
    correction: applyCaseToWord(best.word, typed),
    confidence,
  };
}

export function getAutocorrectPreview(typedWord: string): string | null {
  return getAutocorrectCandidate(typedWord)?.correction ?? null;
}

export function shouldAutoApply(
  candidate: AutocorrectCandidate | null,
  typedWord: string,
): boolean {
  if (!getAutocorrectSettings().autoApplyOnSpace) {
    return false;
  }

  if (!candidate || candidate.confidence < MIN_AUTO_CONFIDENCE) {
    return false;
  }

  if (isProbablyProperNoun(typedWord)) {
    return false;
  }

  if (
    startsWithCapital(typedWord) &&
    candidate.correction.toLowerCase() !== typedWord.toLowerCase()
  ) {
    return false;
  }

  return true;
}
