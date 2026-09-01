import {
  getActiveLanguage,
  getBaseWords,
  getPrefixIndexWordList,
} from '../autocorrect/dictionaryManager';
import {getEnglishStaticRank} from '../autocorrect/englishFrequencyDictionary';
import {getLearnedWordMap} from '../personalTyping/personalTypingEngine';
import {getLetterBigramWeight} from './touchIntelligenceLetterBigrams';
import {getOrCreatePrefixIndex} from './prefixIndex';

export type NextLetterDistribution = {
  /** Normalized letter -> probability (0-1). Empty when neutral mode is active. */
  probabilities: ReadonlyMap<string, number>;
  /** True when no dictionary/learned completions matched — use symmetric slop only. */
  neutralMode: boolean;
  /** Top predicted letter, if any. */
  topLetter: string | null;
};

const MIN_TOTAL_WEIGHT = 0.02;
const MAX_COMPLETIONS_SAMPLE = 72;
const LEARNED_WORD_SCAN_LIMIT = 200;
const BIGRAM_BLEND = 0.12;

function normalizePrefix(prefix: string): string {
  return prefix.trim().toLowerCase();
}

function isValidPrefix(prefix: string): boolean {
  return prefix.length > 0 && /^[\p{L}\p{M}']+$/u.test(prefix);
}

function wordListRank(word: string, lang: string): number {
  const idx = getBaseWords(lang).indexOf(word);
  if (idx >= 0) {
    return idx;
  }
  const list = getPrefixIndexWordList(lang);
  const listIdx = list.indexOf(word);
  return listIdx >= 0 ? listIdx : 50_000;
}

function wordFrequencyWeight(word: string, lang: string): number {
  const learnedUses = getLearnedWordMap().get(word) ?? 0;
  const rank =
    lang === 'en' || lang === 'hi-en' || lang === 'fr-en'
      ? (getEnglishStaticRank(word) ?? wordListRank(word, lang))
      : wordListRank(word, lang);
  const frequency = 1 / (1 + rank * 0.00012);
  const learnedBoost = 1 + Math.min(learnedUses, 80) * 0.06;
  return frequency * learnedBoost;
}

function collectLearnedWeights(prefix: string): Map<string, number> {
  const lower = normalizePrefix(prefix);
  const weights = new Map<string, number>();
  let scanned = 0;
  for (const [word, uses] of getLearnedWordMap()) {
    if (uses <= 0 || word.length <= lower.length) {
      continue;
    }
    if (!word.startsWith(lower) || word === lower) {
      scanned += 1;
      if (scanned > LEARNED_WORD_SCAN_LIMIT * 6) {
        break;
      }
      continue;
    }
    const nextLetter = word[lower.length]!.toLowerCase();
    if (!/[a-z]/.test(nextLetter)) {
      continue;
    }
    const w = wordFrequencyWeight(word, getActiveLanguage()) * (1 + uses * 0.04);
    weights.set(nextLetter, (weights.get(nextLetter) ?? 0) + w);
    scanned += 1;
    if (scanned > LEARNED_WORD_SCAN_LIMIT) {
      break;
    }
  }
  return weights;
}

function collectCompletionWeights(prefix: string, lang: string): Map<string, number> {
  const lower = normalizePrefix(prefix);
  const words = getPrefixIndexWordList(lang);
  const index = getOrCreatePrefixIndex(lang, words);
  const weightFn = (word: string) => wordFrequencyWeight(word, lang);

  const weights = index.getNextLetterWeights(lower, weightFn);

  const completions = index.getPrefixCompletions(lower, MAX_COMPLETIONS_SAMPLE);
  for (const word of completions) {
    if (!word.startsWith(lower) || word.length <= lower.length) {
      continue;
    }
    const nextLetter = word[lower.length]!.toLowerCase();
    if (!/[a-z]/.test(nextLetter)) {
      continue;
    }
    const w = weightFn(word);
    weights.set(nextLetter, (weights.get(nextLetter) ?? 0) + w * 0.35);
  }

  for (const [letter, w] of collectLearnedWeights(lower)) {
    weights.set(letter, (weights.get(letter) ?? 0) + w);
  }

  return weights;
}

function blendBigramWeights(
  weights: Map<string, number>,
  prefix: string,
): Map<string, number> {
  const prefixLast = prefix.trim().toLowerCase().slice(-1);
  if (!prefixLast || !/[a-z]/.test(prefixLast)) {
    return weights;
  }

  const blended = new Map(weights);
  for (const [letter, w] of weights) {
    const bigram = getLetterBigramWeight(prefixLast, letter);
    blended.set(letter, w * (1 - BIGRAM_BLEND) + bigram * BIGRAM_BLEND * w);
  }
  return blended;
}

function normalizeWeights(weights: Map<string, number>): NextLetterDistribution {
  if (weights.size === 0) {
    return {probabilities: new Map(), neutralMode: true, topLetter: null};
  }

  let total = 0;
  for (const w of weights.values()) {
    total += w;
  }
  if (total < MIN_TOTAL_WEIGHT) {
    return {probabilities: new Map(), neutralMode: true, topLetter: null};
  }

  const probabilities = new Map<string, number>();
  let topLetter: string | null = null;
  let topProb = -1;
  for (const [letter, w] of weights) {
    const prob = w / total;
    probabilities.set(letter, prob);
    if (prob > topProb) {
      topProb = prob;
      topLetter = letter;
    }
  }

  return {probabilities, neutralMode: false, topLetter};
}

let lastCacheKey = '';
let lastDistribution: NextLetterDistribution = {
  probabilities: new Map(),
  neutralMode: true,
  topLetter: null,
};

/**
 * Predict next-letter probabilities from the active language dictionary and learned words.
 * Returns neutral mode (empty distribution) when the prefix has no completions.
 */
export function getNextLetterDistribution(
  wordPrefix: string,
  lang?: string,
): NextLetterDistribution {
  const activeLang = lang ?? getActiveLanguage();
  const prefix = normalizePrefix(wordPrefix);
  const cacheKey = `${activeLang}|${prefix}`;
  if (cacheKey === lastCacheKey) {
    return lastDistribution;
  }

  if (!isValidPrefix(prefix)) {
    lastCacheKey = cacheKey;
    lastDistribution = {probabilities: new Map(), neutralMode: true, topLetter: null};
    return lastDistribution;
  }

  const words = getPrefixIndexWordList(activeLang);
  const index = getOrCreatePrefixIndex(activeLang, words);
  if (!index.hasPrefixNode(prefix)) {
    const learnedOnly = collectLearnedWeights(prefix);
    if (learnedOnly.size === 0) {
      lastCacheKey = cacheKey;
      lastDistribution = {probabilities: new Map(), neutralMode: true, topLetter: null};
      return lastDistribution;
    }
    lastCacheKey = cacheKey;
    lastDistribution = normalizeWeights(blendBigramWeights(learnedOnly, prefix));
    return lastDistribution;
  }

  const weights = blendBigramWeights(collectCompletionWeights(prefix, activeLang), prefix);
  lastCacheKey = cacheKey;
  lastDistribution = normalizeWeights(weights);
  return lastDistribution;
}

export function getLetterProbability(
  letter: string,
  wordPrefix: string,
  lang?: string,
): number {
  const distribution = getNextLetterDistribution(wordPrefix, lang);
  if (distribution.neutralMode) {
    return 0;
  }
  return distribution.probabilities.get(letter.trim().toLowerCase()) ?? 0;
}

export function resetPrefixPredictionCacheForTests(): void {
  lastCacheKey = '';
  lastDistribution = {probabilities: new Map(), neutralMode: true, topLetter: null};
}
