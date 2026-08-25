import {InteractionManager} from 'react-native';
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
const MAX_WORDS = 2500;
const MAX_PHRASES = 600;
const MAX_CORRECTIONS = 400;
const MAX_PUNCTUATION = 80;
const PERSIST_DEBOUNCE_MS = 30_000;

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

type PhraseIndexEntry = {
  phrase: string;
  weight: number;
  lastWord: string;
};

let profile: PersonalTypingProfile = emptyProfile();
const wordUsesCache = new Map<string, number>();
const phraseUsesCache = new Map<string, number>();
const phrasesByLead = new Map<string, PhraseIndexEntry[]>();
const phrasesByStarter = new Map<string, PhraseIndexEntry[]>();
const hardRejectedCorrections = new Set<string>();
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let profileHydrated = false;

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

function phraseWeight(entry: LearnedPhraseEntry): number {
  return entry.uses * 10 * (0.4 + entry.confidence * 0.6);
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

function syncRejectedCorrection(entry: CorrectionPairEntry): void {
  const key = correctionKey(entry.from, entry.to);
  if (entry.rejections >= 2 && entry.rejections > entry.accepts) {
    hardRejectedCorrections.add(key);
  } else {
    hardRejectedCorrections.delete(key);
  }
}

function upsertPhraseIndex(phrase: string, entry: LearnedPhraseEntry): void {
  const words = phrase.split(' ');
  if (words.length < 2) {
    return;
  }
  const item: PhraseIndexEntry = {
    phrase,
    weight: phraseWeight(entry),
    lastWord: words[words.length - 1]!,
  };
  const lead = words.slice(0, -1).join(' ');
  const starter = words[0]!;

  const leadList = phrasesByLead.get(lead) ?? [];
  const leadIdx = leadList.findIndex(row => row.phrase === phrase);
  if (leadIdx >= 0) {
    leadList[leadIdx] = item;
  } else {
    leadList.push(item);
  }
  phrasesByLead.set(lead, leadList);

  const starterList = phrasesByStarter.get(starter) ?? [];
  const starterIdx = starterList.findIndex(row => row.phrase === phrase);
  if (starterIdx >= 0) {
    starterList[starterIdx] = item;
  } else {
    starterList.push(item);
  }
  phrasesByStarter.set(starter, starterList);
}

function removePhraseIndex(phrase: string): void {
  const words = phrase.split(' ');
  if (words.length < 2) {
    return;
  }
  const lead = words.slice(0, -1).join(' ');
  const starter = words[0]!;
  const leadList = phrasesByLead.get(lead);
  if (leadList) {
    phrasesByLead.set(
      lead,
      leadList.filter(row => row.phrase !== phrase),
    );
  }
  const starterList = phrasesByStarter.get(starter);
  if (starterList) {
    phrasesByStarter.set(
      starter,
      starterList.filter(row => row.phrase !== phrase),
    );
  }
}

function rebuildIndexes(): void {
  wordUsesCache.clear();
  phraseUsesCache.clear();
  phrasesByLead.clear();
  phrasesByStarter.clear();
  hardRejectedCorrections.clear();

  for (const [word, entry] of Object.entries(profile.words)) {
    if (entry.uses > 0) {
      wordUsesCache.set(word, entry.uses);
    }
  }
  for (const [phrase, entry] of Object.entries(profile.phrases)) {
    if (entry.uses > 0) {
      phraseUsesCache.set(phrase, entry.uses);
      upsertPhraseIndex(phrase, entry);
    }
  }
  for (const entry of Object.values(profile.corrections)) {
    syncRejectedCorrection(entry);
  }
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    InteractionManager.runAfterInteractions(() => {
      void flushPersist();
    });
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
  rebuildIndexes();
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

function mergeLoadedProfile(loaded: PersonalTypingProfile): void {
  if (!profileHydrated) {
    profile = loaded;
    profileHydrated = true;
    rebuildIndexes();
    return;
  }

  for (const [word, entry] of Object.entries(loaded.words)) {
    const current = profile.words[word];
    if (!current || entry.lastUsed > current.lastUsed) {
      profile.words[word] = entry;
      if (entry.uses > 0) {
        wordUsesCache.set(word, entry.uses);
      }
    }
  }
  for (const [phrase, entry] of Object.entries(loaded.phrases)) {
    const current = profile.phrases[phrase];
    if (!current || entry.lastUsed > current.lastUsed) {
      profile.phrases[phrase] = entry;
      if (entry.uses > 0) {
        phraseUsesCache.set(phrase, entry.uses);
        upsertPhraseIndex(phrase, entry);
      }
    }
  }
}

export function resetPersonalTypingCache(): void {
  loadGeneration += 1;
  profile = emptyProfile();
  profileHydrated = false;
  wordUsesCache.clear();
  phraseUsesCache.clear();
  phrasesByLead.clear();
  phrasesByStarter.clear();
  hardRejectedCorrections.clear();
  loadPromise = null;
  dirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

export function ensurePersonalTypingLoaded(): Promise<void> {
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
          mergeLoadedProfile(parsed);
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
    mergeLoadedProfile(migrateFromLegacyCounts(words, phrases));
    dirty = true;
    schedulePersist();
  })();

  return loadPromise;
}

export async function reloadPersonalTypingFromStorage(): Promise<void> {
  resetPersonalTypingCache();
  await ensurePersonalTypingLoaded();
}

export function getPersonalWordUses(word: string): number {
  return wordUsesCache.get(normalizeLearnedWord(word)) ?? 0;
}

export function getLearnedWordMap(): ReadonlyMap<string, number> {
  return wordUsesCache;
}

export function getLearnedPhraseMap(): ReadonlyMap<string, number> {
  return phraseUsesCache;
}

/** Fast O(1) check used on the typing hot path. */
export function isLearnedWordInsisted(word: string): boolean {
  const normalized = normalizeLearnedWord(word);
  const uses = wordUsesCache.get(normalized) ?? 0;
  if (uses >= 2) {
    return true;
  }
  if (uses === 0) {
    return false;
  }
  const entry = profile.words[normalized];
  return entry?.source === 'kept' || (entry?.confidence ?? 0) >= 0.38;
}

export function shouldPersonallyOfferKeepTyped(word: string): boolean {
  const normalized = normalizeLearnedWord(word);
  const uses = wordUsesCache.get(normalized) ?? 0;
  if (uses === 0) {
    return true;
  }
  const entry = profile.words[normalized];
  return (entry?.confidence ?? 0) < 0.32 && uses <= 1;
}

export function isHardRejectedCorrection(typed: string, candidate: string): boolean {
  const from = normalizeLearnedWord(typed);
  const to = normalizeLearnedWord(candidate);
  if (!from || !to || from === to) {
    return false;
  }
  return hardRejectedCorrections.has(correctionKey(from, to));
}

export function queryPhrasesByPrefix(prefix: string, limit = 2): string[] {
  const normalized = prefix.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const starter = normalized.split(' ')[0]!;
  const candidates = phrasesByStarter.get(starter) ?? [];
  if (candidates.length === 0) {
    return [];
  }
  const results: PhraseIndexEntry[] = [];
  for (const item of candidates) {
    if (item.phrase.startsWith(normalized) && item.phrase !== normalized) {
      results.push(item);
    }
  }
  return results
    .sort((a, b) => b.weight - a.weight - (b.phrase.length - a.phrase.length))
    .slice(0, limit)
    .map(item => item.phrase);
}

export function queryPhraseCorrectionCandidates(
  lead: string,
  typedWord: string,
): Array<{phrase: string; weight: number; lastWord: string}> {
  const normalizedLead = lead.trim().toLowerCase();
  if (!normalizedLead || typedWord.length < 2) {
    return [];
  }
  return phrasesByLead.get(normalizedLead) ?? [];
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
  upsertPhraseIndex(normalized, next);
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
  syncRejectedCorrection(next);
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
    removePhraseIndex(normalized);
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
  upsertPhraseIndex(normalized, profile.phrases[normalized]);
  schedulePersist();
  return true;
}

export function removePersonalPhraseEntry(phrase: string): void {
  const normalized = normalizePhrase(phrase);
  delete profile.phrases[normalized];
  phraseUsesCache.delete(normalized);
  removePhraseIndex(normalized);
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
  const uses = wordUsesCache.get(normalizeLearnedWord(word)) ?? 0;
  if (uses <= 0) {
    return 0;
  }
  return Math.min(uses * 80, 4000);
}

export function learnedSwipeBonusFromPersonal(word: string): number {
  const uses = wordUsesCache.get(normalizeLearnedWord(word)) ?? 0;
  if (uses <= 0) {
    return 0;
  }
  return Math.min(uses * 0.08 + Math.log10(uses + 1) * 0.08, 0.45);
}
