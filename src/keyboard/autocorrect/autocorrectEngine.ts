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
import {getHinglishPhraseCorrection, isHinglishHeadword} from './hinglishDictionary';

const WORDS = englishWords as string[];
const STATIC_RANK = new Map<string, number>(
  WORDS.map((word, index) => [word, index]),
);
const STATIC_BY_FIRST = new Map<string, string[]>();

/** Words missing from the ~10k list but needed for splits / fuzzy. */
const SUPPLEMENTAL_EN_WORDS: Array<[string, number]> = [
  ['bait', 4500],
  ['blooming', 7000],
  ['glowing', 6500],
  ['flowing', 6200],
  ['knowing', 2800],
  ['showing', 2100],
  ['growing', 2400],
  ['click', 1900],
  ['ratio', 5200],
  ['cope', 4800],
  ['seethe', 8000],
  ['meme', 3600],
  ['memes', 4000],
  ['vibe', 4200],
  ['vibes', 4300],
  ['cringe', 5100],
  // Common spoken forms missing from the ~10k list.
  ['anyways', 3200],
  ['gonna', 2500],
  ['wanna', 2600],
  ['gotta', 2700],
  ["it's", 90],
  ["don't", 50],
  ["can't", 120],
  ["won't", 200],
  ["i'm", 80],
  ["that's", 110],
  ["you're", 150],
  ["they're", 180],
];
for (const [word, rank] of SUPPLEMENTAL_EN_WORDS) {
  if (!STATIC_RANK.has(word)) {
    STATIC_RANK.set(word, rank);
  }
}

// ============================================================
// Candidate sources: learned + SymSpell + transposition neighbors +
// first-letter buckets. SymSpell-only mode was too weak (missed common
// typos) and too willing to promote weird deletes.
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
for (const [word] of SUPPLEMENTAL_EN_WORDS) {
  if (word.length < 2) {
    continue;
  }
  const first = word[0];
  const bucket = STATIC_BY_FIRST.get(first);
  if (bucket) {
    if (!bucket.includes(word)) {
      bucket.push(word);
    }
  } else {
    STATIC_BY_FIRST.set(first, [word]);
  }
}

const MIN_AUTO_CONFIDENCE = 0.42;
const COMMON_WORD_RANK = 3500;

/** For non-English languages we are a bit more conservative on pure fuzzy auto-apply
 * unless the user has already learned the word or we have a very strong exact fix.
 */
/** English + bilingual Latin layouts that should fuzzy-correct OOV typos. */
function isEnglishLikeLang(lang = getActiveLanguage()): boolean {
  return lang === 'en' || lang === 'hi-en' || lang === 'fr-en';
}

function getEffectiveMinAutoConfidence(learnedUses: number, fromExactFix: boolean): number {
  const lang = getActiveLanguage();
  if (isEnglishLikeLang(lang)) return MIN_AUTO_CONFIDENCE;
  if (learnedUses >= 1 || fromExactFix) return MIN_AUTO_CONFIDENCE;
  // Italian (and future dedicated dicts) still allow good 1-edit cases,
  // but we avoid borderline auto-corrects for words the user may have intended.
  return 0.55;
}
const MISSING_SPACE_MIN_LENGTH = 6;
const MISSING_SPACE_STRONG_RANK = 12_000;
const FREQUENT_WORD_SCAN_LIMIT = 1000;
const FREQUENT_FALLBACK_LIMIT = 2000;

/** Common phone-keyboard digit→letter slips (h3llo → hello). */
const LEET_DIGIT_TO_LETTER: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
};

/**
 * Accept letters, digits, and apostrophes; map leet digits to letters.
 * Returns null when the token still isn't a usable word after normalization.
 */
function normalizeAutocorrectToken(typed: string): string | null {
  const lower = typed.trim().toLowerCase();
  if (lower.length < 2 || !/^[\p{L}\p{M}0-9']+$/u.test(lower)) {
    return null;
  }
  const mapped = lower.replace(/[0134578]/g, ch => LEET_DIGIT_TO_LETTER[ch] ?? ch);
  if (!/^[\p{L}\p{M}']+$/u.test(mapped)) {
    return null;
  }
  return mapped;
}

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
function isLikelyIncompleteWord(typed: string): boolean {
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

function findTwoWordSplit(typed: string): string | null {
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

function findThreeWordSplit(typed: string): string | null {
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

function findMissingSpaceCorrection(
  typed: string,
  learnedUses: number,
): string | null {
  if (typed.length < MISSING_SPACE_MIN_LENGTH) {
    return null;
  }

  // Real dictionary words are never split — including Hinglish headwords like
  // "batana" (English STATIC_RANK alone would wrongly allow bat+ana).
  if (STATIC_RANK.has(typed) || isHinglishHeadword(typed)) {
    return null;
  }
  const lang = getActiveLanguage();
  if (lang !== 'en' && getBaseWords(lang).includes(typed)) {
    return null;
  }
  if (learnedUses >= 3) {
    return null;
  }

  if (isLikelyIncompleteWord(typed)) {
    return null;
  }

  // On Hinglish, don't invent English-only splits (bat|ana). Real multi-word
  // Hinglish fixes come from the underscore→space phrase map instead.
  if (lang === 'hi-en') {
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
  // Long words accumulate more typos; allow a third edit via first-letter scan.
  if (length <= 12) {
    return 2;
  }
  return 3;
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
    // Known dictionary word the user has typed before — leave it alone.
    if (rank != null && learnedUses >= 1) return true;
  } else if (lang === 'hi-en' || lang === 'fr-en') {
    // Protect common English + top preferred-language tokens (Hinglish / French).
    const enRank = STATIC_RANK.get(word);
    if (enRank != null && enRank < COMMON_WORD_RANK) return true;
    const base = getBaseWords(lang);
    const idx = base.indexOf(word);
    if (idx >= 0 && idx < 2_500) return true;
    if ((enRank != null || idx >= 0) && learnedUses >= 1) return true;
  } else {
    // Protect words that are common in the active language's dictionary.
    const base = getBaseWords(lang);
    const idx = base.indexOf(word);
    if (idx >= 0 && idx < 4500) return true;
    if (idx >= 0 && learnedUses >= 1) return true;
  }
  // OOV / typo learned once used to permanently disable autocorrect. Only
  // protect after the user has clearly insisted (keep chip / repeated use).
  return learnedUses >= 3;
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

  // ALL CAPS is shift-lock / emphasis, not a proper noun.
  if (word.length > 1 && word === word.toUpperCase()) {
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
    // Reject first-letter mutations unless adjacent transposition / very common word.
    if (
      typed[0] !== candidate[0] &&
      staticRank >= 1500 &&
      !isAdjacentTransposition(typed, candidate) &&
      !(
        typed.length >= 2 &&
        candidate.length >= 2 &&
        typed[0] === candidate[1] &&
        typed[1] === candidate[0]
      )
    ) {
      return false;
    }
    return true;
  }

  if (candidate.startsWith(typed) || typed.startsWith(candidate)) {
    return true;
  }

  if (isAdjacentTransposition(typed, candidate)) {
    return true;
  }

  const prefix = sharedPrefixLength(typed, candidate);
  // 2/3-edit mid-word typos on longer inputs (aneyays → anyways, etc.).
  const maxLenDelta = typed.length >= 10 ? 2 : 1;
  const minPrefix =
    typed.length >= 10 ? Math.min(3, typed.length - 2) : Math.min(2, typed.length - 2);
  if (edits === 2) {
    return (
      typed.length >= 5 &&
      staticRank < 12_000 &&
      typed[0] === candidate[0] &&
      Math.abs(typed.length - candidate.length) <= maxLenDelta &&
      prefix >= minPrefix
    );
  }
  if (edits === 3) {
    return (
      typed.length >= 10 &&
      staticRank < 8_000 &&
      typed[0] === candidate[0] &&
      Math.abs(typed.length - candidate.length) <= maxLenDelta &&
      prefix >= Math.min(3, typed.length - 3)
    );
  }
  return false;
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

function introducesDoubleLetterNotTyped(typed: string, candidate: string): boolean {
  for (let i = 1; i < candidate.length; i += 1) {
    if (candidate[i] === candidate[i - 1]) {
      const double = candidate.slice(i - 1, i + 1);
      if (!typed.includes(double)) {
        return true;
      }
    }
  }
  return false;
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
      : (() => {
          const idx = getBaseWords(lang).indexOf(typed);
          return idx >= 0 ? idx : undefined;
        })();

  // Explicit: in non-English dedicated dicts, if the typed word is not in our
  // dictionary at all, reject fuzzy corrections (prevents "scusi" → closest
  // listed word). Hinglish / Franglais are English-like: OOV typos still fuzzy-match.
  if (!isEnglishLikeLang(lang)) {
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

  if (introducesDoubleLetterNotTyped(typed, correction)) {
    return true;
  }

  // Prefer keeping the typed first letter (blowong → blowing, not xlowing),
  // but allow very common words (hte → the) and adjacent first-two swaps.
  if (
    learnedUses === 0 &&
    typed[0] !== correction[0] &&
    staticRank >= 1500 &&
    !isAdjacentTransposition(typed, correction)
  ) {
    return true;
  }

  // Extra characters near the start are usually worse (blowong → bblowing).
  if (
    learnedUses === 0 &&
    correction.length > typed.length &&
    sharedPrefixLength(typed, correction) < Math.min(3, typed.length - 1) &&
    edits >= 1 &&
    staticRank >= 2000
  ) {
    return true;
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
  const prefix = sharedPrefixLength(typed, candidate);
  return (
    edits * 100 -
    learnedUses * 18 -
    Math.max(0, 5000 - staticRank) * 0.02 -
    prefix * 8 -
    (candidate[0] === typed[0] ? 20 : -40) -
    (candidate.startsWith(typed.slice(0, Math.min(3, typed.length))) ? 12 : 0) -
    (isAdjacentTransposition(typed, candidate) ? 10 : 0) -
    // Prefer same-length / one-letter fixes over inserting junk.
    (Math.abs(candidate.length - typed.length) > 1 ? 15 : 0)
  );
}

function toConfidence(
  typed: string,
  candidate: string,
  edits: number,
  learnedUses: number,
  staticRank: number,
): number {
  let confidence = edits === 1 ? 0.82 : edits === 2 ? 0.58 : 0.48;
  if (learnedUses >= 2) {
    confidence += Math.min(learnedUses * 0.05, 0.2);
  }
  if (staticRank < 1200) {
    confidence += 0.07;
  } else if (staticRank < 4000 && edits <= 2) {
    confidence += 0.04;
  }
  if (candidate.length > typed.length && candidate.startsWith(typed)) {
    confidence += 0.08;
  }
  const prefix = sharedPrefixLength(typed, candidate);
  if (edits === 1 && prefix >= typed.length - 1) {
    // Classic fat-finger: blowong → blowing
    confidence += 0.1;
  }
  // Extra repeated letter (eeveryone → everyone, helllo → hello).
  if (
    edits === 1 &&
    typed.length === candidate.length + 1 &&
    typed[0] === candidate[0]
  ) {
    for (let i = 1; i < typed.length; i += 1) {
      if (typed[i] === typed[i - 1]) {
        const collapsed = typed.slice(0, i) + typed.slice(i + 1);
        if (collapsed === candidate) {
          confidence += 0.12;
          break;
        }
      }
    }
  }
  if (edits === 2 && typed[0] === candidate[0] && prefix >= 2) {
    confidence += 0.08;
  }
  if (edits === 3 && typed[0] === candidate[0] && prefix >= 3) {
    confidence += 0.1;
  }
  if (typed[0] !== candidate[0] && !isAdjacentTransposition(typed, candidate)) {
    confidence -= 0.35;
  }
  if (typed.length <= 3 && edits > 1) {
    confidence -= 0.25;
  }
  if (edits === 2 && learnedUses === 0 && staticRank > 8000) {
    confidence -= 0.12;
  }
  if (edits === 3 && learnedUses === 0 && staticRank > 5000) {
    confidence -= 0.1;
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
  if (edits === 2) {
    return (
      typed.length >= 3 &&
      sharedPrefixLength(typed, candidate) >= Math.min(2, typed.length - 1)
    );
  }
  return (
    edits === 3 &&
    typed.length >= 10 &&
    typed[0] === candidate[0] &&
    sharedPrefixLength(typed, candidate) >= 3
  );
}

function collectCandidates(
  typed: string,
  editBudget = maxEditDistance(typed.length),
  options?: CollectOptions,
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

  const symCands = lookupCandidatesSync(typed, maxEdits, 80);
  for (const sc of symCands) {
    const lu = learned.get(sc.word) ?? 0;
    const sr =
      STATIC_RANK.get(sc.word) ??
      (sc.count != null
        ? Math.max(1, 160_000 - Math.floor(sc.count / 3))
        : 65_000);
    consider(sc.word, lu, sr);
  }

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

  if (!options?.skipFrequentScan) {
    const needsBroadScan =
      results.length < 2 || (!STATIC_RANK.has(typed) && typed.length <= 12);

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

  const editBudget = maxEditDistance(typed.length);
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
  const normalized = normalizeAutocorrectToken(typed);
  if (!normalized) {
    return null;
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed)) {
    return null;
  }

  const lower = normalized;
  const learnedUses = getLearnedCounts().get(lower) ?? 0;
  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    return applyCaseToWord(exactFix.correction, typed);
  }

  if (isEnglishLikeLang()) {
    const collapsed = findRepeatedLetterCollapse(lower);
    if (collapsed && collapsed !== lower) {
      return applyCaseToWord(collapsed, typed);
    }
  }

  if (getActiveLanguage() === 'hi-en') {
    const phraseFix = getHinglishPhraseCorrection(lower);
    if (phraseFix && phraseFix !== lower) {
      return applyCaseToWord(phraseFix, typed);
    }
  }

  // Digit slips that land on a real word (h3llo → hello).
  const rawLower = typed.toLowerCase();
  if (lower !== rawLower && isInActiveDictionary(lower)) {
    return applyCaseToWord(lower, typed);
  }

  const missingSpace = findMissingSpaceCorrection(lower, learnedUses);
  if (missingSpace) {
    return applyCaseToWord(missingSpace, typed);
  }

  if (isProbablyProperNoun(typed) || isProtectedWord(lower, learnedUses)) {
    return null;
  }

  // For non-English (e.g. Italian), do not offer fuzzy "corrections" for words
  // that are not present in the language dictionary. This prevents perfectly
  // valid but unlisted words ("scusi", "nessun problema", ...) from being
  // mangled to the closest seeded word. Exact fixes + learned words still work.
  // Hinglish / Franglais stay English-like for OOV typos.
  const lang = getActiveLanguage();
  if (!isEnglishLikeLang(lang) && !getBaseWords(lang).includes(lower) && learnedUses === 0) {
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

/** Collapse one accidental double letter when that yields a real word (eeveryone → everyone). */
function findRepeatedLetterCollapse(typed: string): string | null {
  let best: {word: string; rank: number} | null = null;
  for (let i = 1; i < typed.length; i += 1) {
    if (typed[i] !== typed[i - 1]) {
      continue;
    }
    const collapsed = typed.slice(0, i) + typed.slice(i + 1);
    if (collapsed.length < 2) {
      continue;
    }
    const rank = STATIC_RANK.get(collapsed);
    if (rank == null) {
      continue;
    }
    if (!best || rank < best.rank) {
      best = {word: collapsed, rank};
    }
  }
  return best?.word ?? null;
}

export function getAutocorrectCandidate(
  typedWord: string,
): AutocorrectCandidate | null {
  const typed = typedWord.trim();
  const normalized = normalizeAutocorrectToken(typed);
  if (!normalized) {
    return null;
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed)) {
    return null;
  }

  const lower = normalized;
  const rawLower = typed.toLowerCase();
  const learned = getLearnedCounts();
  const learnedUses =
    learned.get(lower) ?? learned.get(rawLower) ?? 0;

  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    return {
      correction: applyCaseToWord(exactFix.correction, typed),
      confidence: exactFix.confidence,
    };
  }

  // Fast path: accidental double letter (eeveryone → everyone, helllo → hello).
  if (isEnglishLikeLang()) {
    const collapsed = findRepeatedLetterCollapse(lower);
    if (collapsed && collapsed !== lower) {
      return {
        correction: applyCaseToWord(collapsed, typed),
        confidence: 0.93,
      };
    }
  }

  // Hinglish: underscore phrases → spaced (aarahahai → aa raha hai).
  if (getActiveLanguage() === 'hi-en') {
    const phraseFix = getHinglishPhraseCorrection(lower);
    if (phraseFix && phraseFix !== lower) {
      return {
        correction: applyCaseToWord(phraseFix, typed),
        confidence: 0.93,
      };
    }
  }

  // Leet / digit slip that resolves to a dictionary word.
  if (lower !== rawLower && isInActiveDictionary(lower)) {
    return {
      correction: applyCaseToWord(lower, typed),
      confidence: 0.93,
    };
  }

  // Missing-space / run-on: run before the proper-noun guard. Sentence-start
  // auto-caps turn "haveyou" into "Haveyou", which used to look like a name
  // and skipped splits entirely.
  const missingSpace = findMissingSpaceCorrection(lower, learnedUses);
  if (missingSpace) {
    return {
      correction: applyCaseToWord(missingSpace, typed),
      confidence: 0.9,
    };
  }

  const compound = lookupCompoundSync(lower);
  if (
    compound &&
    compound.term &&
    compound.term.includes(' ') &&
    compound.distance <= 1 &&
    !isHinglishHeadword(lower)
  ) {
    const lang = getActiveLanguage();
    const known =
      isEnglishLikeLang(lang) ||
      getBaseWords(lang).includes(lower) ||
      learnedUses > 0;
    if (known) {
      return {
        correction: applyCaseToWord(compound.term, typed),
        confidence: 0.88,
      };
    }
  }

  if (isProbablyProperNoun(typed)) {
    return null;
  }

  if (isProtectedWord(lower, learnedUses)) {
    return null;
  }

  // Non-English guard: if the word is unknown to this language's dictionary and
  // not learned + not an exact fix, do not fuzzy auto-correct it.
  // (SymSpell may still be used for suggestions, but auto-apply stays conservative.)
  // Hinglish / Franglais are English-like — allow OOV fuzzy against the combined dictionary.
  const langGate = getActiveLanguage();
  if (!isEnglishLikeLang(langGate) && !getBaseWords(langGate).includes(lower) && learnedUses === 0) {
    return null;
  }

  const candidates = collectCandidates(lower, maxEditDistance(lower.length));
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map(candidate => ({
      ...candidate,
      score: scoreCandidate(
        lower,
        candidate.word,
        candidate.edits,
        candidate.learnedUses,
        candidate.staticRank,
      ),
    }))
    .sort((left, right) => left.score - right.score);

  for (const best of ranked) {
    if (isLikelyNameTrap(lower, best.word)) {
      continue;
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
      continue;
    }

    const learnedCorrection = best.learnedUses >= 2;
    if (
      !learnedCorrection &&
      !isPlausibleTypo(lower, best.word, best.edits, best.staticRank)
    ) {
      continue;
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
      continue;
    }

    if (shouldBlockAutoCorrection(lower, best.word, best.edits)) {
      continue;
    }

    return {
      correction: applyCaseToWord(best.word, typed),
      confidence,
    };
  }

  return null;
}

/** True when the word is in the active language dictionary (safe to auto-learn on space). */
export function isDictionaryWord(word: string): boolean {
  const lower = word.trim().toLowerCase();
  if (!lower) {
    return false;
  }
  if (STATIC_RANK.has(lower)) {
    return true;
  }
  const lang = getActiveLanguage();
  if (lang === 'en') {
    return false;
  }
  return getBaseWords(lang).includes(lower);
}

function isInActiveDictionary(lower: string): boolean {
  return isDictionaryWord(lower);
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
  const normalized = normalizeAutocorrectToken(typed);
  if (!normalized) {
    return {keepTyped: null, correction: null};
  }
  getActiveLanguage(); // SymSpell language is active
  if (hasIntentionalCasing(typed)) {
    return {keepTyped: null, correction: null};
  }

  const lower = normalized;
  const learnedUses = getLearnedCounts().get(lower) ?? 0;
  const offerKeepTyped = learnedUses === 0;

  const exactFix = getExactDictionaryFix(lower);
  if (exactFix) {
    const correction = applyCaseToWord(exactFix.correction, typed);
    if (correction.toLowerCase() === typed.toLowerCase()) {
      return {keepTyped: null, correction: null};
    }
    return {
      keepTyped: offerKeepTyped ? typed : null,
      correction,
    };
  }

  if (getActiveLanguage() === 'hi-en') {
    const phraseFix = getHinglishPhraseCorrection(lower);
    if (phraseFix && phraseFix !== lower) {
      return {
        keepTyped: offerKeepTyped ? typed : null,
        correction: applyCaseToWord(phraseFix, typed),
      };
    }
  }

  const rawLower = typed.toLowerCase();
  if (lower !== rawLower && isInActiveDictionary(lower)) {
    return {
      keepTyped: offerKeepTyped ? typed : null,
      correction: applyCaseToWord(lower, typed),
    };
  }

  const missingSpace = findMissingSpaceCorrection(lower, learnedUses);
  if (missingSpace) {
    return {
      keepTyped: offerKeepTyped ? typed : null,
      correction: applyCaseToWord(missingSpace, typed),
    };
  }

  if (isProbablyProperNoun(typed)) {
    return {keepTyped: null, correction: null};
  }

  const fast = options?.fast ?? false;
  const softCorrection = getTypoSuggestionPreview(typed, fast);
  const correction =
    softCorrection ??
    (fast ? null : getAutocorrectCandidate(typed)?.correction ?? null);

  if (!correction || correction.toLowerCase() === typed.toLowerCase()) {
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

  // High-confidence splits / exact-style fixes still apply at sentence start
  // even when auto-caps makes the typed token look like a name.
  if (
    isProbablyProperNoun(typedWord) &&
    candidate.confidence < 0.88 &&
    !candidate.correction.includes(' ')
  ) {
    return false;
  }

  return true;
}
