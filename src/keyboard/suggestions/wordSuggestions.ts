import englishWords from '../gesture/data/englishWords.json';
import {getSimilarWordSuggestions} from '../autocorrect/autocorrectEngine';
import {getLearnedCounts} from './learnedDictionary';
import {getBaseWords, getActiveLanguage} from '../autocorrect/dictionaryManager';

const WORDS = englishWords as string[];
const STATIC_RANK = new Map<string, number>(
  WORDS.map((word, index) => [word, index]),
);
const LEARNED_SCORE_BOOST = 12;
const STATIC_SCAN_LIMIT = 40;
const FUZZY_EDIT_WEIGHT = 650;

export function extractCurrentWord(text: string): string {
  // Unicode letters + combining marks + apostrophe (for contractions like "don't", "l'école").
  const match = text.match(/[\p{L}\p{M}']+$/u);
  return match ? match[0] : '';
}

export function applyCaseToWord(word: string, prefix: string): string {
  if (!prefix) {
    return word;
  }
  if (prefix === prefix.toUpperCase()) {
    return word.toUpperCase();
  }
  if (prefix[0] === prefix[0].toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

function scorePrefixCandidate(
  prefix: string,
  word: string,
  learned: ReadonlyMap<string, number>,
): number {
  const staticRank = STATIC_RANK.get(word) ?? 50_000;
  const learnedUses = learned.get(word) ?? 0;
  const extraLengthPenalty = Math.max(0, word.length - prefix.length) * 4;
  return staticRank + extraLengthPenalty - learnedUses * LEARNED_SCORE_BOOST;
}

function scoreFuzzyCandidate(
  prefix: string,
  word: string,
  edits: number,
  learned: ReadonlyMap<string, number>,
): number {
  const staticRank = STATIC_RANK.get(word) ?? 50_000;
  const learnedUses = learned.get(word) ?? 0;
  const sharedStemBonus =
    word.slice(0, 2) === prefix.slice(0, 2) ? 500 : 0;
  return (
    edits * FUZZY_EDIT_WEIGHT +
    staticRank -
    learnedUses * LEARNED_SCORE_BOOST -
    sharedStemBonus
  );
}

function getPrefixMatches(
  lower: string,
  learned: ReadonlyMap<string, number>,
): string[] {
  const candidates = new Set<string>();

  // Use the language-appropriate base list from dictionary manager (falls back to English for latin scripts).
  const base = getBaseWords();
  let scanned = 0;
  for (const word of base) {
    if (word.length < 2 || !/^[\p{L}\p{M}]+$/u.test(word)) {
      continue;
    }
    if (word.startsWith(lower) && word !== lower) {
      candidates.add(word);
      scanned += 1;
      if (scanned >= STATIC_SCAN_LIMIT) {
        break;
      }
    }
  }

  for (const [word, count] of learned.entries()) {
    if (count > 0 && word.startsWith(lower) && word !== lower) {
      candidates.add(word);
    }
  }

  return Array.from(candidates).sort(
    (a, b) => scorePrefixCandidate(lower, a, learned) - scorePrefixCandidate(lower, b, learned),
  );
}

export function getWordSuggestions(
  prefix: string,
  limit = 3,
  options?: {skipFuzzy?: boolean},
): string[] {
  if (!prefix || prefix.length < 1) {
    return [];
  }

  const _lang = getActiveLanguage(); // selects per-layout dictionary via manager

  const lower = prefix.toLowerCase();
  if (!/^[\p{L}\p{M}]+$/u.test(lower)) {
    return [];
  }

  const learned = getLearnedCounts();
  const prefixMatches = getPrefixMatches(lower, learned);
  const taken = new Set<string>([lower, ...prefixMatches]);
  const fuzzyMatches = options?.skipFuzzy
    ? []
    : getSimilarWordSuggestions(lower, limit, taken, {skipFrequentScan: true});

  type RankedSuggestion = {
    word: string;
    score: number;
  };

  const ranked: RankedSuggestion[] = [
    ...prefixMatches.map(word => ({
      word,
      score: scorePrefixCandidate(lower, word, learned),
    })),
    ...fuzzyMatches.map(match => ({
      word: match.word,
      score: scoreFuzzyCandidate(lower, match.word, match.edits, learned),
    })),
  ];

  const seen = new Set<string>();
  const merged: string[] = [];
  ranked
    .sort((left, right) => left.score - right.score)
    .forEach(entry => {
      if (seen.has(entry.word) || merged.length >= limit) {
        return;
      }
      seen.add(entry.word);
      merged.push(entry.word);
    });

  return merged;
}
