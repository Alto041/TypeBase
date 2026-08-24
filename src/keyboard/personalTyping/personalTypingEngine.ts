import {keyboardBridge} from '../keyboardBridge';
import {
  isLearnablePhrase,
  isLearnableWord,
  normalizeLearnedWord,
  normalizePhrase,
} from './learnedText';
import type {
  CorrectionPairEntry,
  LearnedPhraseEntry,
  LearnedWordEntry,
  LearningSource,
  PersonalTypingProfile,
  PersonalTypingSnapshot,
} from './types';

const PROFILE_VERSION = 1 as const;
const MAX_WORDS = 4000;
const MAX_PHRASES = 1200;
const MAX_CORRECTIONS = 800;
const MAX_PUNCTUATION = 120;
const PERSIST_DEBOUNCE_MS = 5000;

const INITIAL_CONFIDENCE: Record<LearningSource, number> = {
  typed: 0.22,
  picked: 0.32,
  kept: 0.48,
  corrected: 0.28,
  manual: 0.5,
};

const CONFIRM_GAIN: Record<LearningSource, number> = {
  typed: 0.09,
  picked: 0.11,
  kept: 0.14,
  corrected: 0.1,
  manual: 0,
};

let profile: PersonalTypingProfile = emptyProfile();
const wordUsesCache = new Map<string, number>();
const phraseUsesCache = new Map<string, number>();
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function emptyProfile(): PersonalTypingProfile {
  return {
    version: PROFILE_VERSION,
    words: {},
    phrases: {},
    corrections: {},
    punctuation: {},
    updatedAt: 0,
  };
}

function correctionKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bumpConfidence(
  current: number,
  source: LearningSource,
): number {
  const gain = CONFIRM_GAIN[source] * (1 - current);
  return clampConfidence(current + gain);
}

function decayConfidence(current: number, amount = 0.24): number {
  return clampConfidence(current - amount);
}

function rebuildUsesCaches(): void {
  wordUsesCache.clear();
  phraseUsesCache.clear();
  for (const [word, entry] of Object.entries(profile.words)) {
    if (entry.uses > 0) {
      wordUsesCache.set(word, entry.uses);
    }
  }
  for (const [phrase, entry] of Object.entries(profile.phrases)) {
    if (entry.uses > 0) {
      phraseUsesCache.set(phrase, entry.uses);
    }
  }
}

function trimMap<T>(
  entries: Record<string, T>,
  limit: number,
  score: (value: T) => number,
): void {
  const keys = Object.keys(entries);
  if (keys.length <= limit) {
    return;
  }
  keys
    .sort((a, b) => score(entries[b]) - score(entries[a]))
    .slice(limit)
    .forEach(key => {
      delete entries[key];
    });
}

function wordScore(entry: LearnedWordEntry): number {
  return entry.confidence * 100 + entry.uses * 4 - entry.rejections * 8;
}

function phraseScore(entry: LearnedPhraseEntry): number {
  return entry.confidence * 100 + entry.uses * 5 - entry.rejections * 10;
}

function correctionScore(entry: CorrectionPairEntry): number {
  return entry.confidence * 80 + entry.accepts * 6 - entry.rejections * 12;
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(): Promise<void> {
  if (!dirty) {
    return;
  }
  dirty = false;
  trimMap(profile.words, MAX_WORDS, wordScore);
  trimMap(profile.phrases, MAX_PHRASES, phraseScore);
  trimMap(profile.corrections, MAX_CORRECTIONS, correctionScore);
  rebuildUsesCaches();
  profile.updatedAt = Date.now();
  const json = JSON.stringify(profile);
  void keyboardBridge.setPersonalTypingProfile(json);
}

function migrateFromLegacyCounts(
  words: Record<string, number>,
  phrases: Record<string, number>,
): PersonalTypingProfile {
  const next = emptyProfile();
  const now = Date.now();
  for (const [word, uses] of Object.entries(words)) {
    if (uses <= 0) {
      continue;
    }
    next.words[word] = {
      uses,
      confidence: clampConfidence(0.2 + Math.min(uses, 6) * 0.08),
      rejections: 0,
      lastUsed: now,
      source: 'typed',
    };
  }
  for (const [phrase, uses] of Object.entries(phrases)) {
    if (uses <= 0) {
      continue;
    }
    next.phrases[phrase] = {
      uses,
      confidence: clampConfidence(0.22 + Math.min(uses, 5) * 0.09),
      rejections: 0,
      lastUsed: now,
    };
  }
  next.updatedAt = now;
  return next;
}

export function resetPersonalTypingCache(): void {
  loadGeneration += 1;
  profile = emptyProfile();
  wordUsesCache.clear();
  phraseUsesCache.clear();
  loadPromise = null;
  dirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

export async function ensurePersonalTypingLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  const generation = loadGeneration;
  loadPromise = (async () => {
    const raw = await keyboardBridge.getPersonalTypingProfile();
    if (generation !== loadGeneration) {
      return;
    }

    if (raw && raw.trim().length > 2) {
      try {
        const parsed = JSON.parse(raw) as PersonalTypingProfile;
        if (parsed?.version === PROFILE_VERSION) {
          profile = parsed;
          rebuildUsesCaches();
          return;
        }
      } catch {
        // Fall through to legacy migration.
      }
    }

    const [words, phrases] = await Promise.all([
      keyboardBridge.getLearnedWordCounts(),
      keyboardBridge.getLearnedPhraseCounts(),
    ]);
    if (generation !== loadGeneration) {
      return;
    }
    profile = migrateFromLegacyCounts(words, phrases);
    rebuildUsesCaches();
    dirty = true;
    await flushPersist();
  })();

  return loadPromise;
}

export async function reloadPersonalTypingFromStorage(): Promise<void> {
  resetPersonalTypingCache();
  await ensurePersonalTypingLoaded();
}

export function getPersonalWordUses(word: string): number {
  const normalized = normalizeLearnedWord(word);
  return wordUsesCache.get(normalized) ?? 0;
}

export function getPersonalWordConfidence(word: string): number {
  const normalized = normalizeLearnedWord(word);
  return profile.words[normalized]?.confidence ?? 0;
}

export function getPersonalPhraseUses(phrase: string): number {
  const normalized = normalizePhrase(phrase);
  return phraseUsesCache.get(normalized) ?? 0;
}

export function getPersonalPhraseConfidence(phrase: string): number {
  const normalized = normalizePhrase(phrase);
  return profile.phrases[normalized]?.confidence ?? 0;
}

export function getLearnedWordMap(): ReadonlyMap<string, number> {
  return wordUsesCache;
}

export function getLearnedPhraseMap(): ReadonlyMap<string, number> {
  return phraseUsesCache;
}

export function getPersonalWordStrength(word: string): number {
  const uses = getPersonalWordUses(word);
  const confidence = getPersonalWordConfidence(word);
  if (uses <= 0 && confidence <= 0) {
    return 0;
  }
  return uses * (0.45 + confidence * 0.55);
}

export function getPersonalPhraseWeight(phrase: string): number {
  const uses = getPersonalPhraseUses(phrase);
  const confidence = getPersonalPhraseConfidence(phrase);
  if (uses <= 0) {
    return 0;
  }
  return uses * 10 * (0.4 + confidence * 0.6);
}

export function isPersonallyProtectedWord(word: string): boolean {
  const normalized = normalizeLearnedWord(word);
  const entry = profile.words[normalized];
  if (!entry || entry.uses <= 0) {
    return false;
  }
  if (entry.confidence >= 0.38) {
    return true;
  }
  if (entry.uses >= 2 && entry.confidence >= 0.22) {
    return true;
  }
  if (entry.source === 'kept' && entry.confidence >= 0.3) {
    return true;
  }
  return entry.uses >= 3;
}

export function shouldPersonallyOfferKeepTyped(word: string): boolean {
  const normalized = normalizeLearnedWord(word);
  const entry = profile.words[normalized];
  if (!entry) {
    return true;
  }
  return entry.confidence < 0.32 && entry.uses <= 1;
}

export function getPersonalCorrectionModifier(
  typed: string,
  candidate: string,
): number {
  const from = normalizeLearnedWord(typed);
  const to = normalizeLearnedWord(candidate);
  if (!from || !to || from === to) {
    return 0;
  }
  const entry = profile.corrections[correctionKey(from, to)];
  if (!entry) {
    return 0;
  }
  if (entry.rejections > entry.accepts && entry.confidence < 0.35) {
    return -0.55 - entry.rejections * 0.08;
  }
  if (entry.accepts > 0) {
    return Math.min(0.35, entry.confidence * 0.4 + entry.accepts * 0.04);
  }
  return 0;
}

export function isPersonallyRejectedCorrection(
  typed: string,
  candidate: string,
): boolean {
  const from = normalizeLearnedWord(typed);
  const to = normalizeLearnedWord(candidate);
  const entry = profile.corrections[correctionKey(from, to)];
  if (!entry) {
    return false;
  }
  return entry.rejections >= 2 && entry.rejections > entry.accepts;
}

function upsertWord(
  word: string,
  source: LearningSource,
): LearnedWordEntry | null {
  if (!isLearnableWord(word)) {
    return null;
  }
  const normalized = normalizeLearnedWord(word);
  const now = Date.now();
  const existing = profile.words[normalized];
  const next: LearnedWordEntry = existing
    ? {
        ...existing,
        uses: existing.uses + 1,
        confidence: bumpConfidence(existing.confidence, source),
        lastUsed: now,
        source,
      }
    : {
        uses: 1,
        confidence: INITIAL_CONFIDENCE[source],
        rejections: 0,
        lastUsed: now,
        source,
      };
  profile.words[normalized] = next;
  wordUsesCache.set(normalized, next.uses);
  schedulePersist();
  return next;
}

function upsertPhrase(
  phrase: string,
  source: LearningSource,
  schedule = true,
): LearnedPhraseEntry | null {
  if (!isLearnablePhrase(phrase)) {
    return null;
  }
  const normalized = normalizePhrase(phrase);
  const now = Date.now();
  const existing = profile.phrases[normalized];
  const next: LearnedPhraseEntry = existing
    ? {
        ...existing,
        uses: existing.uses + 1,
        confidence: bumpConfidence(existing.confidence, source),
        lastUsed: now,
      }
    : {
        uses: 1,
        confidence: INITIAL_CONFIDENCE[source],
        rejections: 0,
        lastUsed: now,
      };
  profile.phrases[normalized] = next;
  phraseUsesCache.set(normalized, next.uses);
  if (schedule) {
    schedulePersist();
  }
  return next;
}

function upsertCorrectionPair(
  from: string,
  to: string,
  kind: 'accept' | 'reject',
): void {
  const fromNorm = normalizeLearnedWord(from);
  const toNorm = normalizeLearnedWord(to);
  if (!fromNorm || !toNorm || fromNorm === toNorm) {
    return;
  }
  const key = correctionKey(fromNorm, toNorm);
  const now = Date.now();
  const existing = profile.corrections[key];
  const next: CorrectionPairEntry = existing
    ? {...existing}
    : {
        from: fromNorm,
        to: toNorm,
        accepts: 0,
        rejections: 0,
        confidence: 0.2,
        lastUsed: now,
      };
  if (kind === 'accept') {
    next.accepts += 1;
    next.confidence = bumpConfidence(next.confidence, 'corrected');
  } else {
    next.rejections += 1;
    next.confidence = decayConfidence(next.confidence, 0.18);
  }
  next.lastUsed = now;
  profile.corrections[key] = next;
  schedulePersist();
}

export function observeWordCommitted(
  word: string,
  source: LearningSource = 'typed',
): number {
  const entry = upsertWord(word, source);
  return entry?.uses ?? 0;
}

export function observePhraseCommitted(
  phrase: string,
  source: LearningSource = 'typed',
): number {
  const entry = upsertPhrase(phrase, source);
  return entry?.uses ?? 0;
}

export function observePhrasesCommitted(
  phrases: string[],
  source: LearningSource = 'typed',
): void {
  let changed = false;
  for (const phrase of phrases) {
    if (upsertPhrase(phrase, source, false)) {
      changed = true;
    }
  }
  if (changed) {
    schedulePersist();
  }
}

export function observeCorrectionAccepted(from: string, to: string): void {
  upsertCorrectionPair(from, to, 'accept');
}

export function observeCorrectionRejected(from: string, to: string): void {
  upsertCorrectionPair(from, to, 'reject');
  const normalized = normalizeLearnedWord(from);
  const entry = profile.words[normalized];
  if (entry) {
    entry.rejections += 1;
    entry.confidence = decayConfidence(entry.confidence, 0.12);
    entry.lastUsed = Date.now();
    schedulePersist();
  }
}

export function observeKeepTyped(word: string, rejectedCorrection?: string): void {
  if (rejectedCorrection) {
    upsertCorrectionPair(word, rejectedCorrection, 'reject');
  }
}

export function observeSuggestionPicked(word: string): void {
  observeWordCommitted(word, 'picked');
}

export function observePunctuationPattern(pattern: string): void {
  const normalized = pattern.trim();
  if (!normalized || normalized.length > 8) {
    return;
  }
  profile.punctuation[normalized] = (profile.punctuation[normalized] ?? 0) + 1;
  schedulePersist();
}

export function getPersonalTypingSnapshot(limit = 200): PersonalTypingSnapshot {
  const words = Object.entries(profile.words)
    .map(([word, entry]) => ({
      word,
      uses: entry.uses,
      confidence: entry.confidence,
      rejections: entry.rejections,
      lastUsed: entry.lastUsed,
    }))
    .sort((a, b) => b.confidence * b.uses - a.confidence * a.uses)
    .slice(0, limit);

  const phrases = Object.entries(profile.phrases)
    .map(([phrase, entry]) => ({
      phrase,
      uses: entry.uses,
      confidence: entry.confidence,
      rejections: entry.rejections,
      lastUsed: entry.lastUsed,
    }))
    .sort((a, b) => b.confidence * b.uses - a.confidence * a.uses)
    .slice(0, limit);

  const corrections = Object.values(profile.corrections)
    .map(entry => ({
      from: entry.from,
      to: entry.to,
      accepts: entry.accepts,
      rejections: entry.rejections,
      confidence: entry.confidence,
    }))
    .sort((a, b) => b.accepts + b.confidence - (a.accepts + a.confidence))
    .slice(0, limit);

  const punctuation = Object.entries(profile.punctuation)
    .map(([pattern, uses]) => ({pattern, uses}))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 40);

  return {
    words,
    phrases,
    corrections,
    punctuation,
    wordCount: wordUsesCache.size,
    phraseCount: phraseUsesCache.size,
    correctionCount: Object.keys(profile.corrections).length,
  };
}

export function setPersonalWordEntry(
  word: string,
  uses: number,
  confidence: number,
): boolean {
  if (!isLearnableWord(word)) {
    return false;
  }
  const normalized = normalizeLearnedWord(word);
  if (uses <= 0) {
    delete profile.words[normalized];
    wordUsesCache.delete(normalized);
    schedulePersist();
    return true;
  }
  profile.words[normalized] = {
    uses: Math.max(1, Math.round(uses)),
    confidence: clampConfidence(confidence),
    rejections: profile.words[normalized]?.rejections ?? 0,
    lastUsed: Date.now(),
    source: 'manual',
  };
  wordUsesCache.set(normalized, profile.words[normalized].uses);
  schedulePersist();
  return true;
}

export function removePersonalWordEntry(word: string): void {
  const normalized = normalizeLearnedWord(word);
  delete profile.words[normalized];
  wordUsesCache.delete(normalized);
  schedulePersist();
}

export function setPersonalPhraseEntry(
  phrase: string,
  uses: number,
  confidence: number,
): boolean {
  if (!isLearnablePhrase(phrase)) {
    return false;
  }
  const normalized = normalizePhrase(phrase);
  if (uses <= 0) {
    delete profile.phrases[normalized];
    phraseUsesCache.delete(normalized);
    schedulePersist();
    return true;
  }
  profile.phrases[normalized] = {
    uses: Math.max(1, Math.round(uses)),
    confidence: clampConfidence(confidence),
    rejections: profile.phrases[normalized]?.rejections ?? 0,
    lastUsed: Date.now(),
  };
  phraseUsesCache.set(normalized, profile.phrases[normalized].uses);
  schedulePersist();
  return true;
}

export function removePersonalPhraseEntry(phrase: string): void {
  const normalized = normalizePhrase(phrase);
  delete profile.phrases[normalized];
  phraseUsesCache.delete(normalized);
  schedulePersist();
}

export async function clearPersonalTypingProfile(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  resetPersonalTypingCache();
  profile = emptyProfile();
  dirty = true;
  await flushPersist();
  await keyboardBridge.clearLearnedAutocorrectData();
  loadPromise = Promise.resolve();
}

export function learnedRankBoostFromPersonal(word: string): number {
  const strength = getPersonalWordStrength(word);
  if (strength <= 0) {
    return 0;
  }
  return Math.min(strength * 70, 4500);
}

export function learnedSwipeBonusFromPersonal(word: string): number {
  const strength = getPersonalWordStrength(word);
  if (strength <= 0) {
    return 0;
  }
  return Math.min(strength * 0.07 + Math.log10(strength + 1) * 0.06, 0.48);
}
