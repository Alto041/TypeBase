import {
  getActiveLanguage,
  lookupCandidatesSync,
} from './dictionaryManager';
import {getBigramFollowScore, getTopBigramFollowers} from './contextBigrams';
import {extractTrailingWords} from './learnedPhrases';
import {
  isHardRejectedCorrection,
  isLearnedWordInsisted,
  queryPersonalContextCorrections,
} from '../personalTyping/personalTypingEngine';
import {applyCaseToWord} from '../suggestions/wordSuggestions';
import {getAutocorrectSettings} from './autocorrectStore';

export type ContextCorrectionCandidate = {
  correction: string;
  confidence: number;
  source: 'personal' | 'bigram' | 'mixed';
};

export type ContextCorrectionOptions = {
  previousWord?: string;
  trailingWords?: string[];
  boundary?: boolean;
  lightweight?: boolean;
};

export type ContextCorrectionRunner = {
  word: string;
  rawScore: number;
  bigram: number;
  edits: number;
  source: 'personal' | 'bigram' | 'mixed';
};

export type ContextCorrectionDebugState = {
  typedWord: string;
  previousWord: string;
  trailingWords: string[];
  candidate: ContextCorrectionCandidate | null;
  runners: ContextCorrectionRunner[];
  skippedReason?: string;
  at: number;
};

const MIN_CONTEXT_CONFIDENCE = 0.56;
const MIN_CONTEXT_CONFIDENCE_BOUNDARY = 0.58;
const MAX_SYMSPELL_CANDIDATES = 8;
const MAX_BIGRAM_SEEDS_LIGHT = 8;
const MAX_BIGRAM_SEEDS_FULL = 14;
const RESULT_CACHE_TTL_MS = 280;
const RESULT_CACHE_MAX = 72;

let captureDebugSnapshots = false;
let lastDebugState: ContextCorrectionDebugState | null = null;

const resultCache = new Map<
  string,
  {result: ContextCorrectionCandidate | null; time: number}
>();

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
  if (Math.abs(a.length - b.length) > 3) {
    return 99;
  }

  const row = Array.from({length: b.length + 1}, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + cost);
      previous = temp;
    }
  }
  return row[b.length]!;
}

function maxEditDistance(length: number): number {
  if (length <= 3) {
    return 1;
  }
  if (length <= 8) {
    return 2;
  }
  return 3;
}

function isEnglishLikeLang(lang: string): boolean {
  return lang === 'en' || lang === 'hi-en' || lang === 'fr-en';
}

function buildTrailingWords(
  context: string,
  typedWord: string,
  trailingWords?: string[],
): string[] {
  if (trailingWords && trailingWords.length > 0) {
    return trailingWords.map(word => word.toLowerCase());
  }
  let ctx = context;
  if (typedWord.length > 0 && ctx.endsWith(typedWord)) {
    ctx = ctx.slice(0, ctx.length - typedWord.length);
  }
  return extractTrailingWords(ctx, 4);
}

function scoreCandidateInContext(
  trailingWords: readonly string[],
  candidate: string,
  personalBoost: number,
  edits: number,
): {rawScore: number; bigram: number} {
  const candidateLower = candidate.toLowerCase();
  let score = 0;
  let bigram = 0;

  if (trailingWords.length > 0) {
    const previous = trailingWords[trailingWords.length - 1]!;
    bigram = getBigramFollowScore(previous, candidateLower);
    score += bigram * 2.4;

    if (trailingWords.length >= 2) {
      const secondLast = trailingWords[trailingWords.length - 2]!;
      score += getBigramFollowScore(secondLast, previous) * 0.35;
    }
  }

  score += personalBoost;
  score -= edits * 14;

  return {rawScore: score, bigram};
}

function toConfidence(
  rawScore: number,
  edits: number,
  boundary: boolean,
): number {
  if (rawScore <= 0) {
    return 0;
  }
  const normalized = Math.min(1, rawScore / 120);
  let confidence = 0.52 + normalized * 0.4;
  if (edits === 1) {
    confidence += 0.06;
  } else if (edits >= 3) {
    confidence -= 0.08;
  }
  confidence = Math.max(0, Math.min(0.97, confidence));
  const min = boundary ? MIN_CONTEXT_CONFIDENCE_BOUNDARY : MIN_CONTEXT_CONFIDENCE;
  return confidence >= min ? confidence : 0;
}

function resultCacheKey(
  typedLower: string,
  trailingWords: readonly string[],
): string {
  return `${typedLower}\0${trailingWords.slice(-2).join('|')}`;
}

function rememberResult(
  key: string,
  result: ContextCorrectionCandidate | null,
): ContextCorrectionCandidate | null {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest) {
      resultCache.delete(oldest);
    }
  }
  resultCache.set(key, {result, time: Date.now()});
  return result;
}

function gatherCandidates(
  typedLower: string,
  trailingWords: readonly string[],
  lightweight: boolean,
): Map<string, {edits: number; personalBoost: number; source: 'personal' | 'bigram' | 'mixed'}> {
  const candidates = new Map<
    string,
    {edits: number; personalBoost: number; source: 'personal' | 'bigram' | 'mixed'}
  >();
  const maxEdits = maxEditDistance(typedLower.length);
  const bigramLimit = lightweight ? MAX_BIGRAM_SEEDS_LIGHT : MAX_BIGRAM_SEEDS_FULL;

  const add = (
    word: string,
    edits: number,
    personalBoost: number,
    source: 'personal' | 'bigram' | 'mixed',
  ) => {
    const lower = word.toLowerCase();
    if (!lower || lower === typedLower) {
      return;
    }
    if (isHardRejectedCorrection(typedLower, lower)) {
      return;
    }
    const existing = candidates.get(lower);
    if (!existing || personalBoost > existing.personalBoost) {
      candidates.set(lower, {
        edits: Math.min(existing?.edits ?? edits, edits),
        personalBoost: Math.max(existing?.personalBoost ?? 0, personalBoost),
        source: existing && existing.source !== source ? 'mixed' : source,
      });
    }
  };

  for (const personal of queryPersonalContextCorrections(typedLower)) {
    add(personal.to, levenshtein(typedLower, personal.to), personal.confidence * 90, 'personal');
  }

  if (trailingWords.length > 0) {
    const previous = trailingWords[trailingWords.length - 1]!;
    for (const {word, score} of getTopBigramFollowers(previous, bigramLimit)) {
      if (Math.abs(word.length - typedLower.length) > maxEdits) {
        continue;
      }
      const edits = levenshtein(typedLower, word);
      if (edits > 0 && edits <= maxEdits) {
        add(word, edits, score * 0.15, 'bigram');
      }
    }
  }

  if (!lightweight) {
    const symHits = lookupCandidatesSync(typedLower, maxEdits, MAX_SYMSPELL_CANDIDATES);
    for (const hit of symHits) {
      if (hit.word.includes(' ')) {
        continue;
      }
      add(hit.word, hit.edits, 0, 'bigram');
    }
  }

  return candidates;
}

function publishDebugState(state: ContextCorrectionDebugState): void {
  if (!captureDebugSnapshots) {
    return;
  }
  lastDebugState = state;
}

export function setContextCorrectionDebugCapture(enabled: boolean): void {
  captureDebugSnapshots = enabled;
  if (!enabled) {
    lastDebugState = null;
  }
}

export function getContextCorrectionDebugState(): ContextCorrectionDebugState | null {
  return lastDebugState;
}

/**
 * Picks the best typo fix for `typedWord` using sentence context (bigrams + personal history).
 */
export function getContextCorrectionCandidate(
  typedWord: string,
  context: string,
  options?: ContextCorrectionOptions,
): ContextCorrectionCandidate | null {
  if (!getAutocorrectSettings().contextCorrectionEnabled) {
    publishDebugState({
      typedWord,
      previousWord: '',
      trailingWords: [],
      candidate: null,
      runners: [],
      skippedReason: 'disabled',
      at: Date.now(),
    });
    return null;
  }

  const typed = typedWord.trim();
  const typedLower = typed.toLowerCase();
  if (typedLower.length < 2 || !/^[\p{L}\p{M}']+$/u.test(typedLower)) {
    return null;
  }
  if (isLearnedWordInsisted(typedLower)) {
    return null;
  }

  const lang = getActiveLanguage();
  if (!isEnglishLikeLang(lang)) {
    return null;
  }

  const trailingWords = buildTrailingWords(
    context,
    typed,
    options?.trailingWords,
  );
  const previousWord =
    options?.previousWord?.toLowerCase() ??
    trailingWords[trailingWords.length - 1] ??
    '';

  if (!previousWord && trailingWords.length === 0) {
    publishDebugState({
      typedWord: typed,
      previousWord: '',
      trailingWords: [],
      candidate: null,
      runners: [],
      skippedReason: 'no-context',
      at: Date.now(),
    });
    return null;
  }

  const cacheKey = resultCacheKey(typedLower, trailingWords);
  const cached = resultCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.time < RESULT_CACHE_TTL_MS) {
    if (captureDebugSnapshots) {
      publishDebugState({
        typedWord: typed,
        previousWord,
        trailingWords: [...trailingWords],
        candidate: cached.result,
        runners: [],
        skippedReason: 'cache-hit',
        at: now,
      });
    }
    return cached.result;
  }

  const lightweight = options?.lightweight ?? false;
  const candidates = gatherCandidates(
    typedLower,
    trailingWords,
    lightweight && options?.boundary !== true,
  );
  if (candidates.size === 0) {
    publishDebugState({
      typedWord: typed,
      previousWord,
      trailingWords: [...trailingWords],
      candidate: null,
      runners: [],
      skippedReason: 'no-candidates',
      at: now,
    });
    return rememberResult(cacheKey, null);
  }

  const activeTrailing =
    trailingWords.length > 0 ? trailingWords : previousWord ? [previousWord] : [];

  let best: ContextCorrectionCandidate | null = null;
  let bestScore = -Infinity;
  const runners: ContextCorrectionRunner[] = [];

  for (const [word, meta] of candidates) {
    const scored = scoreCandidateInContext(
      activeTrailing,
      word,
      meta.personalBoost,
      meta.edits,
    );
    const confidence = toConfidence(
      scored.rawScore,
      meta.edits,
      options?.boundary ?? false,
    );
    runners.push({
      word,
      rawScore: scored.rawScore,
      bigram: scored.bigram,
      edits: meta.edits,
      source: meta.source,
    });
    if (confidence <= 0) {
      continue;
    }
    if (scored.rawScore > bestScore) {
      bestScore = scored.rawScore;
      best = {
        correction: applyCaseToWord(word, typed),
        confidence,
        source: meta.source,
      };
    }
  }

  runners.sort((a, b) => b.rawScore - a.rawScore);

  publishDebugState({
    typedWord: typed,
    previousWord,
    trailingWords: [...trailingWords],
    candidate: best,
    runners: runners.slice(0, 5),
    at: now,
  });

  return rememberResult(cacheKey, best);
}

export function getContextCorrectionPreview(
  typedWord: string,
  context: string,
  options?: ContextCorrectionOptions,
): string | null {
  return getContextCorrectionCandidate(typedWord, context, options)?.correction ?? null;
}
