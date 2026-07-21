import {getEnglishStaticRank} from '../autocorrect/englishFrequencyDictionary';
import {getPrefixCompletions} from '../autocorrect/englishPrefixIndex';
import {getSimilarWordSuggestions} from '../autocorrect/autocorrectEngine';
import {getLearnedCounts} from './learnedDictionary';
import {getBaseWords, getActiveLanguage} from '../autocorrect/dictionaryManager';
import {getHinglishSuggestions} from '../autocorrect/hinglishDictionary';

const LEARNED_SCORE_BOOST = 12;
const HINGLISH_SCAN_LIMIT = 80;
const FRANGLAIS_SCAN_LIMIT = 80;
const FUZZY_EDIT_WEIGHT = 650;

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
  const match = text.match(/[\p{L}\p{M}0-9']+$/u);
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
  const extraLengthPenalty = Math.max(0, word.length - prefix.length) * 4;
  if (lang === 'hi-en') {
    const isPhrase = word.includes(' ');
    const hinglishBias = isPhrase ? -800 : -400;
    return extraLengthPenalty - learnedUses * LEARNED_SCORE_BOOST + hinglishBias;
  }
  if (lang === 'fr-en') {
    return baseRank(word, lang) + extraLengthPenalty - learnedUses * LEARNED_SCORE_BOOST;
  }
  const staticRank = getEnglishStaticRank(word) ?? 50_000;
  return staticRank + extraLengthPenalty - learnedUses * LEARNED_SCORE_BOOST;
}

function scoreFuzzyCandidate(
  prefix: string,
  word: string,
  edits: number,
  learned: ReadonlyMap<string, number>,
  lang: string,
): number {
  const learnedUses = learned.get(word) ?? 0;
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
    sharedStemBonus
  );
}

function getPrefixMatches(
  lower: string,
  learned: ReadonlyMap<string, number>,
  lang: string,
): string[] {
  const candidates = new Set<string>();

  if (lang === 'hi-en') {
    for (const word of getHinglishSuggestions(lower, HINGLISH_SCAN_LIMIT)) {
      candidates.add(word);
    }
  }

  if (lang === 'en' || lang === 'hi-en' || lang === 'fr-en') {
    for (const word of getPrefixCompletions(lower, 12)) {
      candidates.add(word);
    }
  }

  if (lang === 'fr-en' || lang === 'hi-en') {
    const base = getBaseWords(lang);
    const scanLimit =
      lang === 'hi-en' ? HINGLISH_SCAN_LIMIT : FRANGLAIS_SCAN_LIMIT;
    let scanned = 0;
    for (const word of base) {
      if (word.length < 2 || !/^[\p{L}\p{M}]+$/u.test(word)) {
        continue;
      }
      if (word.startsWith(lower) && word !== lower) {
        candidates.add(word);
        scanned += 1;
        if (scanned >= scanLimit) {
          break;
        }
      }
    }
  }

  for (const [word, count] of learned.entries()) {
    if (count > 0 && word.startsWith(lower) && word !== lower) {
      candidates.add(word);
    }
  }

  return Array.from(candidates).sort(
    (a, b) =>
      scorePrefixCandidate(lower, a, learned, lang) -
      scorePrefixCandidate(lower, b, learned, lang),
  );
}

export function getWordSuggestions(
  prefix: string,
  limit = 3,
  options?: {skipFuzzy?: boolean; lightweight?: boolean},
): string[] {
  const lang = getActiveLanguage();

  if (lang === 'hi-en' && (!prefix || prefix.length < 1)) {
    return getHinglishSuggestions('', limit);
  }
  if (lang === 'fr-en' && (!prefix || prefix.length < 1)) {
    return getFranglaisStarters(limit);
  }

  if (!prefix || prefix.length < 1) {
    return [];
  }

  const lower = prefix.toLowerCase();
  if (!/^[\p{L}\p{M}]+$/u.test(lower)) {
    return [];
  }

  if (lang === 'hi-en' && lower.length === 1) {
    const hinglish = getHinglishSuggestions(lower, limit);
    if (hinglish.length >= limit) {
      return hinglish.slice(0, limit);
    }
  }

  const learned = getLearnedCounts();
  const prefixMatches = getPrefixMatches(lower, learned, lang);
  const taken = new Set<string>([
    lower,
    ...prefixMatches.map(w => w.toLowerCase()),
    ...prefixMatches.map(w => w.replace(/\s+/g, '').toLowerCase()),
  ]);
  const fuzzyMatches = options?.skipFuzzy
    ? []
    : getSimilarWordSuggestions(lower, limit, taken, {
        skipFrequentScan: true,
        lightweight: options?.lightweight ?? true,
      });

  type RankedSuggestion = {
    word: string;
    score: number;
  };

  const ranked: RankedSuggestion[] = [
    ...prefixMatches.map(word => ({
      word,
      score: scorePrefixCandidate(lower, word, learned, lang),
    })),
    ...fuzzyMatches.map(match => ({
      word: match.word,
      score: scoreFuzzyCandidate(lower, match.word, match.edits, learned, lang),
    })),
  ];

  if (lang === 'hi-en') {
    const hinglishHits = getHinglishSuggestions(lower, limit * 2);
    for (let i = 0; i < hinglishHits.length; i++) {
      ranked.push({word: hinglishHits[i], score: -2000 + i});
    }
  }

  const seen = new Set<string>();
  const merged: string[] = [];
  ranked
    .sort((left, right) => left.score - right.score)
    .forEach(entry => {
      const key = entry.word.toLowerCase();
      if (seen.has(key) || merged.length >= limit) {
        return;
      }
      seen.add(key);
      merged.push(entry.word);
    });

  return merged;
}
