import {getEnglishStaticRank} from '../autocorrect/englishFrequencyDictionary';
import {getPrefixCompletions} from '../autocorrect/englishPrefixIndex';
import {getSimilarWordSuggestions} from '../autocorrect/autocorrectEngine';
import {getLearnedCounts} from './learnedDictionary';
import {getPersonalWordStrength} from '../personalTyping/personalTypingEngine';
import {getBaseWords, getActiveLanguage} from '../autocorrect/dictionaryManager';
import {getHinglishSuggestions} from '../autocorrect/hinglishDictionary';

const LEARNED_SCORE_BOOST = 12;
const FUZZY_EDIT_WEIGHT = 650;
/** Max candidates to score per keystroke (bar only needs a handful). */
const PREFIX_CANDIDATE_POOL = 14;
const LEARNED_PREFIX_SCAN_CAP = 96;
const LEARNED_PREFIX_MAX = 6;
const BILINGUAL_BASE_SCAN_MAX = 12;
const HINGLISH_PREFIX_MAX = 10;

/** Frequent French words for empty-prefix suggestion chips. */
function getFranglaisStarters(limit: number): string[] {
  const out: string[] = [];
  for (const word of getBaseWords('fr-en')) {
    if (word.length < 3 || !/^[\p{L}\p{M}]+$/u.test(word)) {
      continue;
    }
    out.push(word);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

function baseRank(word: string, lang: string): number {
  const idx = getBaseWords(lang).indexOf(word);
  return idx >= 0 ? idx : 50_000;
}

export function extractCurrentWord(text: string): string {
  // Only the active line — JS `$` matches before a trailing `\n`, which would
  // otherwise resurrect the previous line's last word after Enter.
  const lineTail = text.split(/\r?\n/).pop() ?? '';
  const match = lineTail.match(/[\p{L}\p{M}0-9']+$/u);
  return match ? match[0] : '';
}

export function applyCaseToWord(word: string, prefix: string): string {
  const normalizedWord = word ?? '';
  if (!prefix) {
    return normalizedWord;
  }
  if (prefix === prefix.toUpperCase()) {
    return normalizedWord.toUpperCase();
  }
  if (prefix[0] === prefix[0].toUpperCase()) {
    return normalizedWord.charAt(0).toUpperCase() + normalizedWord.slice(1);
  }
  return normalizedWord;
}

function scorePrefixCandidate(
  prefix: string,
  word: string,
  learned: ReadonlyMap<string, number>,
  lang: string,
): number {
  const learnedUses = learned.get(word) ?? learned.get(word.replace(/\s+/g, '')) ?? 0;
  const personalBoost = getPersonalWordStrength(word) * LEARNED_SCORE_BOOST;
  const extraLengthPenalty = Math.max(0, word.length - prefix.length) * 4;
  if (lang === 'hi-en') {
    const isPhrase = word.includes(' ');
    const hinglishBias = isPhrase ? -800 : -400;
    return (
      extraLengthPenalty -
      learnedUses * LEARNED_SCORE_BOOST -
      personalBoost +
      hinglishBias
    );
  }
  if (lang === 'fr-en') {
    return (
      baseRank(word, lang) +
      extraLengthPenalty -
      learnedUses * LEARNED_SCORE_BOOST -
      personalBoost
    );
  }
  const staticRank = getEnglishStaticRank(word) ?? 50_000;
  return (
    staticRank + extraLengthPenalty - learnedUses * LEARNED_SCORE_BOOST - personalBoost
  );
}

function scoreFuzzyCandidate(
  prefix: string,
  word: string,
  edits: number,
  learned: ReadonlyMap<string, number>,
  lang: string,
): number {
  const learnedUses = learned.get(word) ?? 0;
  const personalBoost = getPersonalWordStrength(word) * LEARNED_SCORE_BOOST;
  const sharedStemBonus =
    word.slice(0, 2) === prefix.slice(0, 2) ? 500 : 0;
  const staticRank =
    lang === 'hi-en'
      ? 8_000
      : lang === 'fr-en'
        ? baseRank(word, lang)
        : (getEnglishStaticRank(word) ?? 50_000);
  return (
    edits * FUZZY_EDIT_WEIGHT +
    staticRank -
    learnedUses * LEARNED_SCORE_BOOST -
    personalBoost -
    sharedStemBonus
  );
}

function collectPrefixCandidates(
  lower: string,
  learned: ReadonlyMap<string, number>,
  lang: string,
  poolLimit: number,
): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const push = (word: string) => {
    const key = word.toLowerCase();
    if (key === lower || seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(word);
  };

  if (lang === 'en' || lang === 'hi-en' || lang === 'fr-en') {
    for (const word of getPrefixCompletions(lower, poolLimit)) {
      push(word);
      if (candidates.length >= poolLimit) {
        break;
      }
    }
  }

  if (lang === 'hi-en' && candidates.length < poolLimit) {
    for (const word of getHinglishSuggestions(lower, HINGLISH_PREFIX_MAX)) {
      push(word);
      if (candidates.length >= poolLimit) {
        break;
      }
    }
  }

  if ((lang === 'fr-en' || lang === 'hi-en') && candidates.length < poolLimit) {
    let scanned = 0;
    for (const word of getBaseWords(lang)) {
      if (word.length < 2 || !/^[\p{L}\p{M}]+$/u.test(word)) {
        continue;
      }
      if (!word.startsWith(lower) || word.toLowerCase() === lower) {
        continue;
      }
      push(word);
      scanned += 1;
      if (scanned >= BILINGUAL_BASE_SCAN_MAX || candidates.length >= poolLimit) {
        break;
      }
    }
  }

  let learnedHits = 0;
  let learnedExamined = 0;
  for (const [word, count] of learned.entries()) {
    learnedExamined += 1;
    if (learnedExamined > LEARNED_PREFIX_SCAN_CAP) {
      break;
    }
    if (count <= 0 || !word.startsWith(lower) || word.toLowerCase() === lower) {
      continue;
    }
    push(word);
    learnedHits += 1;
    if (learnedHits >= LEARNED_PREFIX_MAX || candidates.length >= poolLimit) {
      break;
    }
  }

  candidates.sort(
    (a, b) =>
      scorePrefixCandidate(lower, a, learned, lang) -
      scorePrefixCandidate(lower, b, learned, lang),
  );

  return candidates.slice(0, poolLimit);
}

export function getWordSuggestions(
  prefix: string,
  limit = 8,
  options?: {skipFuzzy?: boolean; lightweight?: boolean},
): string[] {
  const lang = getActiveLanguage();
  const cap = Math.min(Math.max(limit, 1), 10);

  if (lang === 'hi-en' && (!prefix || prefix.length < 1)) {
    return getHinglishSuggestions('', cap);
  }
  if (lang === 'fr-en' && (!prefix || prefix.length < 1)) {
    return getFranglaisStarters(cap);
  }

  if (!prefix || prefix.length < 1) {
    return [];
  }

  const lower = prefix.toLowerCase();
  if (!/^[\p{L}\p{M}]+$/u.test(lower)) {
    return [];
  }

  const learned = getLearnedCounts();
  const pool = Math.min(PREFIX_CANDIDATE_POOL, cap + 4);
  const prefixMatches = collectPrefixCandidates(lower, learned, lang, pool);

  const taken = new Set<string>([lower]);
  for (const word of prefixMatches) {
    taken.add(word.toLowerCase());
    taken.add(word.replace(/\s+/g, '').toLowerCase());
  }

  const fuzzyBudget = options?.skipFuzzy ? 0 : Math.min(2, cap);
  const fuzzyMatches =
    fuzzyBudget > 0
      ? getSimilarWordSuggestions(lower, fuzzyBudget, taken, {
          skipFrequentScan: true,
          lightweight: options?.lightweight ?? true,
        })
      : [];

  type RankedSuggestion = {word: string; score: number};

  const ranked: RankedSuggestion[] = prefixMatches.map(word => ({
    word,
    score: scorePrefixCandidate(lower, word, learned, lang),
  }));

  for (const match of fuzzyMatches) {
    ranked.push({
      word: match.word,
      score: scoreFuzzyCandidate(lower, match.word, match.edits, learned, lang),
    });
  }

  const seen = new Set<string>();
  const merged: string[] = [];
  ranked
    .sort((left, right) => left.score - right.score)
    .forEach(entry => {
      const key = entry.word.toLowerCase();
      if (seen.has(key) || merged.length >= cap) {
        return;
      }
      seen.add(key);
      merged.push(entry.word);
    });

  return merged;
}
