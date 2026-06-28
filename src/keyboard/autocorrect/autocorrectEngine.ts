import englishWords from '../gesture/data/englishWords.json';
import {getExactDictionaryFix, isPreserveTypedWord} from './dictionaryFixes';
import {getAutocorrectSettings} from './autocorrectStore';
import {getLearnedCounts} from '../suggestions/learnedDictionary';
import {applyCaseToWord} from '../suggestions/wordSuggestions';
import {
  getActiveLanguage,
  getBaseWords,
  lookupCandidatesSync,
  lookupCompoundSync,
} from './dictionaryManager';

const WORDS = englishWords as string[];
const STATIC_RANK = new Map<string, number>(
  WORDS.map((word, index) => [word, index]),
);
const STATIC_BY_FIRST = new Map<string, string[]>();

// ============================================================
// SYMSPELL-ONLY TEST MODE (old candidate sources disabled)
// - collectCandidates now only returns learned + SymSpell results
// - findMissingSpaceCorrection (old split) is bypassed
// - getSimilar / getAutocorrectCandidate / suggestion bar all go through SymSpell
//
// Exact fixes, learned boosts (fed into SymSpell), scoring, confidence,
// plausibility checks, protections, etc. are still applied after.
//
// To revert: uncomment the blocks in collectCandidates + getAutocorrectCandidate
// and remove the _ prefixes + eslint-disable lines.
// ============================================================

for (const word of WORDS) {
  if (word.length < 2 || !/^[\p{L}\p{M}]+$/u.test(word)) {
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

const MIN_AUTO_CONFIDENCE = 0.39;
const COMMON_WORD_RANK = 3500;

/** For non-English languages we are a bit more conservative on pure fuzzy auto-apply
 * unless the user has already learned the word or we have a very strong exact fix.
 */
function getEffectiveMinAutoConfidence(learnedUses: number, fromExactFix: boolean): number {
  const lang = getActiveLanguage();
  if (lang === 'en') return MIN_AUTO_CONFIDENCE;
  if (learnedUses >= 1 || fromExactFix) return MIN_AUTO_CONFIDENCE;
  // Italian (and future dedicated dicts) still allow good 1-edit cases,
  // but we avoid borderline auto-corrects for words the user may have intended.
  return 0.55;
}
// TEMP: these are only used by the disabled old broad-scan logic
// const FREQUENT_WORD_SCAN_LIMIT = 1000;
// const FREQUENT_FALLBACK_LIMIT = 2000;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _MISSING_SPACE_MIN_LENGTH = 6; // only used by disabled old split logic
const MISSING_SPACE_STRONG_RANK = 5_000;

/** Very common 1–2 letter words allowed in a split (blocks junk like "th", "ng"). */
const SHORT_SEGMENT_WORDS = new Set<string>(['a', 'i']);
for (const word of WORDS.slice(0, 250)) {
  if (word.length <= 2) {
    SHORT_SEGMENT_WORDS.add(word);
  }
}

function isValidSegmentPart(word: string): boolean {
  if (word !== 'a' && word !== 'i' && !STATIC_RANK.has(word)) {
    return false;
  }

  const rank = STATIC_RANK.get(word) ?? 99_999;
  if (rank > MISSING_SPACE_STRONG_RANK) {
    return false;
  }

  if (word.length <= 2) {
    return SHORT_SEGMENT_WORDS.has(word);
  }

  return true;
}

/** Still typing a longer dictionary word (e.g. "somethin" → "something"). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _isLikelyIncompleteWord(typed: string): boolean {
  const bucket = STATIC_BY_FIRST.get(typed[0]) ?? [];
  for (const word of bucket) {
    if (word.length > typed.length && word.startsWith(typed)) {
      const rank = STATIC_RANK.get(word) ?? 99_999;
      if (rank < 15_000) {
        return true;
      }
    }
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _findTwoWordSplit(typed: string): string | null {
  let best: {left: string; right: string; score: number} | null = null;

  for (let splitAt = 2; splitAt <= typed.length - 2; splitAt += 1) {
    const left = typed.slice(0, splitAt);
    const right = typed.slice(splitAt);
    if (!isValidSegmentPart(left) || !isValidSegmentPart(right)) {
      continue;
    }

    const score =
      (STATIC_RANK.get(left) ?? 99_999) + (STATIC_RANK.get(right) ?? 99_999);
    if (!best || score < best.score) {
      best = {left, right, score};
    }
  }

  if (!best) {
    return null;
  }

  if (
    best.left === 'i' &&
    best.right.length >= 5 &&
    typed.length >= 6
  ) {
    return null;
  }

  return `${best.left} ${best.right}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _findThreeWordSplit(typed: string): string | null {
  let best: {parts: string[]; score: number} | null = null;

  for (let first = 2; first <= typed.length - 4; first += 1) {
    for (let second = first + 2; second <= typed.length - 2; second += 1) {
      const parts = [
        typed.slice(0, first),
        typed.slice(first, second),
        typed.slice(second),
      ];
      if (!parts.every(isValidSegmentPart)) {
        continue;
      }

      const score = parts.reduce(
        (total, part) => total + (STATIC_RANK.get(part) ?? 99_999),
        0,
      );
      if (!best || score < best.score) {
        best = {parts, score};
      }
    }
  }

  return best ? best.parts.join(' ') : null;
}

/* TEMP FOR SYMSPELL TEST – old missing-space logic disabled
function _findMissingSpaceCorrection(
  typed: string,
  learnedUses: number,
): string | null {
  if (learnedUses >= 1 || typed.length < MISSING_SPACE_MIN_LENGTH) {
    return null;
  }

  if (STATIC_RANK.has(typed)) {
    return null;
  }

  if (isLikelyIncompleteWord(typed)) {
    return null;
  }

  const twoWord = findTwoWordSplit(typed);
  if (twoWord) {
    return twoWord;
  }

  if (typed.length >= 9) {
    return findThreeWordSplit(typed);
  }

  return null;
}
*/

type CollectOptions = {
  skipFrequentScan?: boolean;
};

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
  if (length <= 8) {
    return 2;
  }
  return 2;
}

/** Adjacent letter swaps (teh → the, waht → what) count as 1-edit typos. */
function collectTranspositionNeighbors(typed: string): string[] {
  const neighbors: string[] = [];
  for (let index = 0; index < typed.length - 1; index += 1) {
    if (typed[index] === typed[index + 1]) {
      continue;
    }
    const chars = typed.split('');
    const swapped = chars
      .map((char, charIndex) => {
        if (charIndex === index) {
          return chars[index + 1];
        }
        if (charIndex === index + 1) {
          return chars[index];
        }
        return char;
      })
      .join('');
    if (STATIC_RANK.has(swapped)) {
      neighbors.push(swapped);
    }
  }
  return neighbors;
}

/**
 * True when a capitalized token is much more likely a sentence-start typo than a name
 * (e.g. Ypu → you, Teh → the).
 */
function findCloseCommonWord(lower: string): string | null {
  if (lower.length < 2) {
    return null;
  }

  const maxEdits = lower.length <= 4 ? 1 : 2;
  const lengthMin = Math.max(1, lower.length - maxEdits);
  const lengthMax = lower.length + maxEdits;
  type BestMatch = {word: string; edits: number; rank: number};
  const state: {best: BestMatch | null} = {best: null};

  const consider = (word: string) => {
    if (word === lower) {
      return;
    }
    if (word.length < lengthMin || word.length > lengthMax) {
      return;
    }
    const rank = STATIC_RANK.get(word) ?? 99_999;
    if (rank >= COMMON_WORD_RANK) {
      return;
    }
    const edits = levenshtein(lower, word);
    if (edits > maxEdits) {
      return;
    }
    if (isLikelyNameTrap(lower, word)) {
      return;
    }
    if (
      !state.best ||
      edits < state.best.edits ||
      (edits === state.best.edits && rank < state.best.rank)
    ) {
      state.best = {word, edits, rank};
    }
  };

  for (const word of STATIC_BY_FIRST.get(lower[0]) ?? []) {
    consider(word);
  }

  for (const swapped of collectTranspositionNeighbors(lower)) {
    consider(swapped);
  }

  const scanLimit = lower.length <= 6 ? Math.min(1200, WORDS.length) : 0;
  for (let index = 0; index < scanLimit; index += 1) {
    consider(WORDS[index]);
  }

  return state.best?.word ?? null;
}

function isProtectedWord(word: string, learnedUses: number): boolean {
  const lang = getActiveLanguage();
  if (lang === 'en') {
    const rank = STATIC_RANK.get(word);
    if (rank != null && rank < COMMON_WORD_RANK) return true;
  } else {
    // Protect words that are common in the active language's dictionary.
    const base = getBaseWords(lang);
    const idx = base.indexOf(word);
    if (idx >= 0 && idx < 4500) return true;
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

  if (rank != null && rank < COMMON_WORD_RANK) {
    return false;
  }

  // Sentence-start caps are common; don't treat obvious typos as names (Ypu → you).
  if (findCloseCommonWord(lower)) {
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

/** Missing/extra letters at the end, swap, or a close 2-edit match on longer words. */
function isPlausibleTypo(
  typed: string,
  candidate: string,
  edits: number,
  staticRank: number,
): boolean {
  if (edits <= 1) {
    return true;
  }

  if (candidate.startsWith(typed) || typed.startsWith(candidate)) {
    return true;
  }

  if (isAdjacentTransposition(typed, candidate)) {
    return true;
  }

  return (
    edits === 2 &&
    typed.length >= 5 &&
    staticRank < 7000 &&
    sharedPrefixLength(typed, candidate) >= 2
  );
}

function isDestructiveShortening(typed: string, correction: string): boolean {
  if (correction.length >= typed.length) {
    return false;
  }

  if (getExactDictionaryFix(typed)) {
    return false;
  }

  const typedRank = STATIC_RANK.get(typed);
  return typedRank != null && typedRank < 25_000;
}

function shouldRejectFuzzyCorrection(
  typed: string,
  correction: string,
  edits: number,
  learnedUses: number,
  staticRank: number,
): boolean {
  if (isDestructiveShortening(typed, correction)) {
    return true;
  }

  const lang = getActiveLanguage();
  const typedRank =
    lang === 'en'
      ? STATIC_RANK.get(typed)
      : getBaseWords(lang).indexOf(typed);

  // Explicit: in non-English, if the typed word is not in our dictionary at all,
  // reject fuzzy corrections (prevents "scusi" → closest listed word).
  if (lang !== 'en') {
    const idx = getBaseWords(lang).indexOf(typed);
    if (idx < 0 && learnedUses === 0) {
      return true;
    }
  }

  if (
    typedRank != null &&
    typedRank < 12_000 &&
    edits >= 2 &&
    learnedUses === 0
  ) {
    return true;
  }

  if (typedRank != null && typedRank < 8_000 && edits >= 1) {
    const correctionRank = staticRank;
    if (correctionRank > typedRank * 2) {
      return true;
    }
  }

  return false;
}

/** Both typed and correction are real dictionary words one edit apart (lol → lot). */
function isDictionaryOneEditSubstitution(
  typed: string,
  correction: string,
  edits: number,
): boolean {
  if (edits !== 1 || isAdjacentTransposition(typed, correction)) {
    return false;
  }
  if (getExactDictionaryFix(typed)) {
    return false;
  }

  return (
    STATIC_RANK.has(typed) &&
    STATIC_RANK.has(correction) &&
    typed !== correction
  );
}

function shouldBlockAutoCorrection(
  typed: string,
  correction: string,
  edits: number,
): boolean {
  if (isPreserveTypedWord(typed)) {
    return true;
  }

  return isDictionaryOneEditSubstitution(typed, correction, edits);
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
    (candidate.startsWith(typed.slice(0, 2)) ? 6 : 0) -
    (isAdjacentTransposition(typed, candidate) ? 10 : 0)
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

function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) {
      break;
    }
    count += 1;
  }
  return count;
}

function isLikelyTypoMatch(typed: string, candidate: string, edits: number): boolean {
  if (edits === 0) {
    return true;
  }
  if (edits === 1) {
    return true;
  }
  return (
    typed.length >= 3 &&
    sharedPrefixLength(typed, candidate) >= Math.min(2, typed.length - 1)
  );
}

function collectCandidates(
  typed: string,
  editBudget = maxEditDistance(typed.length),
  _options?: CollectOptions, // unused while legacy scan paths are disabled for SymSpell test
): Array<{
  word: string;
  edits: number;
  learnedUses: number;
  staticRank: number;
}> {
  const learned = getLearnedCounts();
  const maxEdits = editBudget;
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

  // Primary (and only for this test) fuzzy source: SymSpell.
  const symCands = lookupCandidatesSync(typed, maxEdits, 80);
  for (const sc of symCands) {
    const lu = learned.get(sc.word) ?? 0;
    const sr = STATIC_RANK.get(sc.word) ?? (sc.count != null ? Math.max(1, 160_000 - Math.floor(sc.count / 3)) : 65_000);
    consider(sc.word, lu, sr);
  }

  // ============================================================
  // TEMP FOR SYMSPELL TESTING: old candidate sources DISABLED
  // - collectTranspositionNeighbors
  // - STATIC_BY_FIRST bucket walks
  // - broad / frequent scan over WORDS
  // Only learned words + SymSpell results are considered.
  // Re-enable the block below when you want the hybrid back.
  // ============================================================
  /*
  for (const swapped of collectTranspositionNeighbors(typed)) {
    if (!seen.has(swapped)) {
      seen.add(swapped);
      results.push({
        word: swapped,
        edits: 1,
        learnedUses: learned.get(swapped) ?? 0,
        staticRank: STATIC_RANK.get(swapped) ?? 60_000,
      });
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

  if (typed.length >= 3) {
    const thirdBucket = STATIC_BY_FIRST.get(typed[2]);
    if (thirdBucket) {
      for (const word of thirdBucket) {
        consider(word, learned.get(word) ?? 0, STATIC_RANK.get(word) ?? 60_000);
      }
    }
  }

  if (!options?.skipFrequentScan) {
    const needsBroadScan =
      results.length < 2 ||
      (!STATIC_RANK.has(typed) && typed.length <= 6);

    if (needsBroadScan && typed.length >= 3) {
      const scanLimit = typed.length <= 5 ? 1200 : FREQUENT_WORD_SCAN_LIMIT;
      for (let i = 0; i < Math.min(scanLimit, WORDS.length); i++) {
        const word = WORDS[i];
        consider(word, learned.get(word) ?? 0, i);
      }
    }

    if (results.length === 0 && typed.length >= 4) {
      for (let i = 0; i < Math.min(FREQUENT_FALLBACK_LIMIT, WORDS.length); i++) {
        const word = WORDS[i];
        consider(word, learned.get(word) ?? 0, i);
      }
    }
  }
  */

  return results;
}

export type SimilarWordSuggestion = {
  word: string;
  edits: number;
};

/** Looser matching for the suggestion bar while typing (not used for auto-replace on space). */
export function getSimilarWordSuggestions(
  typedWord: string,
  limit = 3,
  exclude: ReadonlySet<string> = new Set(),
  options?: CollectOptions,
): SimilarWordSuggestion[] {
  const typed = typedWord.trim().toLowerCase();
  if (typed.length < 2 || !/^[\p{L}\p{M}]+$/u.test(typed)) {
    return [];
  }
  getActiveLanguage(); // ensures SymSpell for current layout is considered (via dictionaryManager)

  const editBudget = typed.length <= 4 ? 2 : typed.length <= 7 ? 2 : 2;
  const candidates = collectCandidates(typed, editBudget, options).filter(candidate => {
    if (exclude.has(candidate.word) || isLikelyNameTrap(typed, candidate.word)) {
      return false;
    }
    if (
      shouldRejectFuzzyCorrection(
        typed,
        candidate.word,
        candidate.edits,
        candidate.learnedUses,
        candidate.staticRank,
      )
    ) {
      return false;
    }
    return isLikelyTypoMatch(typed, candidate.word, candidate.edits);
  });

  candidates.sort((left, right) => {
    const leftScore = scoreCandidate(
      typed,
      left.word,
      left.edits,
      left.learnedUses,
      left.staticRank,
    );
    const rightScore = scoreCandidate(
      typed,
      right.word,
      right.edits,
      right.learnedUses,
      right.staticRank,
    );
    return leftScore - rightScore;
  });

  return candidates.slice(0, limit).map(candidate => ({
    word: candidate.word,
    edits: candidate.edits,
  }));
}

export function getTypoSuggestionPreview(
  typedWord: string,
  fast = false,
): string | null {
  const typed = typedWord.trim();
  if (typed.length < 2 || !/^[\p{L}\p{M}]+$/u.test(typed)) {
    return null;
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed) || isProbablyProperNoun(typed)) {
    return null;
  }

  const lower = typed.toLowerCase();
  const learnedUses = getLearnedCounts().get(lower) ?? 0;
  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    return applyCaseToWord(exactFix.correction, typed);
  }

  if (isProtectedWord(lower, learnedUses)) {
    return null;
  }

  // For non-English (e.g. Italian), do not offer fuzzy "corrections" for words
  // that are not present in the language dictionary. This prevents perfectly
  // valid but unlisted words ("scusi", "nessun problema", ...) from being
  // mangled to the closest seeded word. Exact fixes + learned words still work.
  const lang = getActiveLanguage();
  if (lang !== 'en' && !getBaseWords(lang).includes(lower) && learnedUses === 0) {
    return null;
  }

  const [best] = getSimilarWordSuggestions(lower, 1, new Set([lower]), {
    skipFrequentScan: fast,
  });
  if (!best) {
    return null;
  }

  return applyCaseToWord(best.word, typed);
}

export function getAutocorrectCandidate(
  typedWord: string,
): AutocorrectCandidate | null {
  const typed = typedWord.trim();
  if (typed.length < 2 || !/^[\p{L}\p{M}]+$/u.test(typed)) {
    return null;
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed)) {
    return null;
  }
  if (isProbablyProperNoun(typed)) {
    return null;
  }

  const lower = typed.toLowerCase();
  const learned = getLearnedCounts();
  const learnedUses = learned.get(lower) ?? 0;

  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    return {
      correction: applyCaseToWord(exactFix.correction, typed),
      confidence: exactFix.confidence,
    };
  }

  // TEMP FOR SYMSPELL TESTING: disable the old findMissingSpaceCorrection
  // (it uses STATIC_RANK / old split logic). Let SymSpell's LookupCompound drive this.
  /*
  const missingSpace = _findMissingSpaceCorrection(lower, learnedUses);
  if (missingSpace) {
    return {
      correction: applyCaseToWord(missingSpace, typed),
      confidence: 0.9,
    };
  }
  */

  // SymSpell compound / segmentation – this is now the active path for testing.
  const compound = lookupCompoundSync(lower);
  if (compound && compound.term && compound.term.includes(' ') && compound.distance <= 2) {
    // For non-English, only accept compound splits if the original typed is known
    // or we have learned uses (keeps behavior conservative for incomplete dicts).
    const lang = getActiveLanguage();
    const known = lang === 'en' || getBaseWords(lang).includes(lower) || learnedUses > 0;
    if (known) {
      return {
        correction: applyCaseToWord(compound.term, typed),
        confidence: 0.88,
      };
    }
  }

  if (isProtectedWord(lower, learnedUses)) {
    return null;
  }

  // Non-English guard: if the word is unknown to this language's dictionary and
  // not learned + not an exact fix, do not fuzzy auto-correct it.
  // (SymSpell may still be used for suggestions, but auto-apply stays conservative.)
  const lang = getActiveLanguage();
  if (lang !== 'en' && !getBaseWords(lang).includes(lower) && learnedUses === 0) {
    return null;
  }

  const candidates = collectCandidates(lower, maxEditDistance(lower.length));
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

  if (
    shouldRejectFuzzyCorrection(
      lower,
      best.word,
      best.edits,
      best.learnedUses,
      best.staticRank,
    )
  ) {
    return null;
  }

  const learnedCorrection = best.learnedUses >= 2;
  if (
    !learnedCorrection &&
    !isPlausibleTypo(lower, best.word, best.edits, best.staticRank)
  ) {
    return null;
  }

  const confidence = toConfidence(
    lower,
    best.word,
    best.edits,
    best.learnedUses,
    best.staticRank,
  );
  const effMin = getEffectiveMinAutoConfidence(best.learnedUses, false);
  if (confidence < effMin) {
    return null;
  }

  if (shouldBlockAutoCorrection(lower, best.word, best.edits)) {
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

/** Bar chips: keep what you typed + optional correction (correction may be blocked from auto-apply). */
export function getSuggestionBarAutocorrect(
  typedWord: string,
  options?: {fast?: boolean},
): {
  keepTyped: string | null;
  correction: string | null;
} {
  const typed = typedWord.trim();
  if (typed.length < 2 || !/^[\p{L}\p{M}]+$/u.test(typed)) {
    return {keepTyped: null, correction: null};
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed) || isProbablyProperNoun(typed)) {
    return {keepTyped: null, correction: null};
  }

  const lower = typed.toLowerCase();
  const learnedUses = getLearnedCounts().get(lower) ?? 0;
  const offerKeepTyped = learnedUses === 0;

  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    const correction = applyCaseToWord(exactFix.correction, typed);
    if (correction.toLowerCase() === lower) {
      return {keepTyped: null, correction: null};
    }
    return {
      keepTyped: offerKeepTyped ? typed : null,
      correction,
    };
  }

  const fast = options?.fast ?? false;
  const softCorrection = getTypoSuggestionPreview(typed, fast);
  const correction =
    softCorrection ??
    (fast ? null : getAutocorrectCandidate(typed)?.correction ?? null);

  if (!correction || correction.toLowerCase() === lower) {
    if (isPreserveTypedWord(lower) && offerKeepTyped) {
      return {keepTyped: typed, correction: null};
    }
    return {keepTyped: null, correction: null};
  }

  return {
    keepTyped: offerKeepTyped ? typed : null,
    correction,
  };
}

export function shouldAutoApply(
  candidate: AutocorrectCandidate | null,
  typedWord: string,
): boolean {
  if (!getAutocorrectSettings().autoApplyOnSpace) {
    return false;
  }

  if (!candidate) return false;

  // Use language-aware threshold so Italian (and others) don't over-auto-correct.
  const effMin = getEffectiveMinAutoConfidence(
    /*learnedUses*/ 0, // we don't have it here; the candidate's confidence was already gated with learned info
    /*fromExactFix*/ candidate.confidence >= 0.88,
  );
  if (candidate.confidence < effMin) {
    return false;
  }

  if (isProbablyProperNoun(typedWord)) {
    return false;
  }

  return true;
}
