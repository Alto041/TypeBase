import {
  getEnglishWordsByFrequency,
  isEnglishDictionaryWord,
  rankFromSymSpellFrequency,
  scheduleEnglishRankMapBuild,
  scheduleEnglishWordSetBuild,
  syntheticFrequencyCount,
} from './englishFrequencyDictionary';
import {scheduleEnglishPrefixIndexBuild} from './englishPrefixIndex';
import italianWords from './data/italianWords.json';
import germanWords from './data/de_words.json';
import frenchWords from './data/french_words.json';
import {
  buildHinglishCombinedTokenList,
  getHinglishPhrases,
  getHinglishSymSpellTokens,
  __resetHinglishLexiconForTests,
} from './hinglishDictionary';
import {getAutocorrectLanguage} from './languageMap';
import {SymSpell, Verbosity} from './symspell/SymSpell';
import {ensureLearnedDictionaryLoaded, getLearnedCounts} from '../suggestions/learnedDictionary';
import {getKeyboardLayoutSettings} from '../settings/layoutStore';

/**
 * Dictionary manager for multi-lingual autocorrect (SymSpell powered).
 *
 * Language is chosen automatically from the active `letterLayoutId` via languageMap.
 *
 * - 'en' eagerly seeded from SymSpell frequency_dictionary_en (~82k words)
 * - 'it' eagerly seeded from italianWords.json
 * - 'de' lazily seeded from de_words.json
 * - 'hi-en' lazily seeded: English + Hinglish
 * - 'fr-en' (Franglais) lazily seeded: french_words.json + SymSpell English
 *   for the French AZERTY layout. English stays usable while seed runs.
 */

type Candidate = {
  word: string;
  edits: number;
  count?: number;
};

const ssCache = new Map<string, SymSpell>();
const baseCache = new Map<string, string[]>();
const inFlightSeeds = new Map<string, Promise<SymSpell>>();

/**
 * Languages that ship a dedicated base word list. Sync lookups must never fall back
 * to English for these — doing so would surface English corrections on, e.g., German
 * text during the brief window before the (lazily seeded) dictionary finishes loading.
 */
const DEDICATED_DICTIONARY_LANGS = new Set(['en', 'it', 'de', 'hi-en', 'fr-en']);

let italianBase: string[] | null = null;
let germanBase: string[] | null = null;
let frenchBase: string[] | null = null;
let hinglishCombinedBase: string[] | null = null;
let franglaisCombinedBase: string[] | null = null;

/** The SymSpell we can use synchronously right now (populated eagerly for 'en'). */
let readySymSpell: SymSpell | null = null;
let readyLearnedBoosted = false;

function getEnglishBase(): readonly string[] {
  return getEnglishWordsByFrequency();
}

function seedEnglishWordsIntoSymSpell(ss: SymSpell): void {
  const words = getEnglishWordsByFrequency();
  words.forEach((word, index) => {
    ss.CreateDictionaryEntry(word, syntheticFrequencyCount(index));
  });
}

function getItalianBase(): string[] {
  if (!italianBase) {
    // Dedup while preserving first-seen order (most frequent first in source).
    const seen = new Set<string>();
    italianBase = (italianWords as string[]).filter(w => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return italianBase;
}

function getGermanBase(): string[] {
  if (!germanBase) {
    // de_words.json is an array ordered by descending frequency (most frequent first),
    // matching italianWords.json. Dedup while preserving that order so the index-derived
    // seeding counts stay aligned with real frequency.
    const seen = new Set<string>();
    germanBase = (germanWords as string[]).filter(w => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return germanBase;
}

function getFrenchBase(): string[] {
  if (!frenchBase) {
    const seen = new Set<string>();
    frenchBase = (frenchWords as string[]).filter(w => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return frenchBase;
}

function getHinglishCombinedBase(): string[] {
  if (!hinglishCombinedBase) {
    // Hinglish tokens first (suggestions scan this list), then English.
    hinglishCombinedBase = buildHinglishCombinedTokenList([
      ...getEnglishWordsByFrequency(),
    ]);
  }
  return hinglishCombinedBase;
}

/** French-first then English — Franglais suggestions + membership. */
function getFranglaisCombinedBase(): string[] {
  if (franglaisCombinedBase) {
    return franglaisCombinedBase;
  }
  const fr = getFrenchBase();
  const seen = new Set<string>(fr);
  const combined = fr.slice();
  for (const word of getEnglishBase()) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    combined.push(word);
  }
  franglaisCombinedBase = combined;
  return franglaisCombinedBase;
}

// Full English SymSpell seeds in the background — never block keystrokes.
let englishSymSpellSeeded = false;
let englishSymSpellSeeding = false;

const ENGLISH_SYM_SPELL_SUPPLEMENTAL: Array<[string, number]> = [
  ['clickbait', 4_500_000],
  ['shitpost', 2_800_000],
  ['ratio', 6_200_000],
  ['based', 8_500_000],
  ['cope', 3_200_000],
  ['seethe', 1_900_000],
  ['meme', 12_000_000],
  ['memes', 9_500_000],
  ['vibe', 11_000_000],
  ['vibes', 8_800_000],
  ['cringe', 5_400_000],
  ['anyways', 18_000_000],
  ['gonna', 45_000_000],
  ['wanna', 42_000_000],
  ['gotta', 38_000_000],
];

export function isEnglishSymSpellReady(): boolean {
  return englishSymSpellSeeded;
}

/** True once any SymSpell instance is available (bootstrap or full seed). */
export function isSymSpellLookupReady(): boolean {
  return readySymSpell != null;
}

const SYM_SPELL_BOOTSTRAP_WORDS = 6_500;
const SYM_SEED_CHUNK = 500;
const SYM_SEED_DELAY_MS = 32;

function bootstrapEnglishSymSpell(words: readonly string[]): SymSpell {
  const en = new SymSpell(90_000, 2, 7);
  const bootstrapCount = Math.min(SYM_SPELL_BOOTSTRAP_WORDS, words.length);
  for (let i = 0; i < bootstrapCount; i += 1) {
    en.CreateDictionaryEntry(words[i]!, syntheticFrequencyCount(i));
  }
  for (const [word, count] of ENGLISH_SYM_SPELL_SUPPLEMENTAL) {
    en.CreateDictionaryEntry(word, count);
  }
  ssCache.set('en', en);
  readySymSpell = en;
  return en;
}

/** Chunked background seed — call once when the keyboard mounts. */
export function scheduleBackgroundEnglishSymSpellSeed(): void {
  scheduleEnglishWordSetBuild();
  if (englishSymSpellSeeded || englishSymSpellSeeding) {
    return;
  }
  englishSymSpellSeeding = true;

  const words = getEnglishWordsByFrequency();
  if (!words.length) {
    englishSymSpellSeeding = false;
    return;
  }

  const en = bootstrapEnglishSymSpell(words);
  let index = Math.min(SYM_SPELL_BOOTSTRAP_WORDS, words.length);

  const step = (): void => {
    const end = Math.min(index + SYM_SEED_CHUNK, words.length);
    for (; index < end; index += 1) {
      en.CreateDictionaryEntry(words[index]!, syntheticFrequencyCount(index));
    }

    if (index < words.length) {
      setTimeout(step, SYM_SEED_DELAY_MS);
      return;
    }

    englishSymSpellSeeded = true;
    englishSymSpellSeeding = false;
    scheduleEnglishPrefixIndexBuild();
    scheduleEnglishRankMapBuild();
  };

  if (index < words.length) {
    setTimeout(step, 400);
  } else {
    englishSymSpellSeeded = true;
    englishSymSpellSeeding = false;
    scheduleEnglishPrefixIndexBuild();
    scheduleEnglishRankMapBuild();
  }
}

function getLangBase(lang: string): string[] {
  if (baseCache.has(lang)) {
    return baseCache.get(lang)!;
  }
  let list: string[];
  if (lang === 'en') {
    // English uses prefix index + SymSpell — not a linear base list scan.
    list = [];
  } else if (lang === 'it') {
    // Dedicated Italian list for proper SymSpell autocorrect + suggestions.
    list = getItalianBase();
  } else if (lang === 'de') {
    // Dedicated German list (~50k words) for proper SymSpell autocorrect + suggestions.
    list = getGermanBase();
  } else if (lang === 'hi-en') {
    // Hinglish tokens first for suggestion scanning.
    list = getHinglishCombinedBase();
  } else if (lang === 'fr-en') {
    // Franglais: French first, then English.
    list = getFranglaisCombinedBase();
  } else if (lang === 'ru' || lang === 'ar') {
    // No base list yet for these scripts; only learned words.
    list = [];
  } else {
    // Other languages without dedicated data: return empty base.
    // This prevents English suggestions from polluting non-English layouts.
    // Learned words still work and are boosted into SymSpell.
    list = [];
  }
  baseCache.set(lang, list);
  return list;
}

async function seedSymSpell(lang: string, ss: SymSpell): Promise<void> {
  if (lang === 'hi-en') {
    const enSet = new Set(getEnglishBase());
    seedEnglishWordsIntoSymSpell(ss);
    const hiTokens = getHinglishSymSpellTokens();
    hiTokens.forEach((w, i) => {
      if (enSet.has(w)) {
        return;
      }
      ss.CreateDictionaryEntry(w, Math.max(1, 60_000 - Math.floor(i * 2)));
    });
    const phrases = getHinglishPhrases();
    phrases.forEach((phrase, i) => {
      ss.CreateDictionaryEntry(
        phrase.spaced,
        Math.max(1, 35_000 - Math.floor(i * 1)),
      );
    });
  } else if (lang === 'fr-en') {
    const enSet = new Set(getEnglishBase());
    seedEnglishWordsIntoSymSpell(ss);
    getFrenchBase().forEach((w, i) => {
      if (enSet.has(w)) {
        return;
      }
      ss.CreateDictionaryEntry(w, Math.max(1, 90_000 - Math.floor(i * 4)));
    });
  } else {
    const base = getLangBase(lang);
    base.forEach((w, i) => {
      const count = Math.max(1, 100_000 - Math.floor(i * 5));
      ss.CreateDictionaryEntry(w, count);
    });
  }

  // Seed currently loaded learned words (boosted).
  await ensureLearnedDictionaryLoaded();
  const learned = getLearnedCounts();
  for (const [word, uses] of learned) {
    if (uses > 0) {
      ss.CreateDictionaryEntry(word, 200_000 + uses * 800);
    }
  }
}

async function ensureSymSpell(lang: string): Promise<SymSpell> {
  const cached = ssCache.get(lang);
  if (cached) return cached;

  // Dedupe concurrent seeds (a lazy language can be requested by several sync
  // lookups before its first seed finishes).
  const pending = inFlightSeeds.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const ss = new SymSpell(95_000, 2, 7);
    await seedSymSpell(lang, ss);
    ssCache.set(lang, ss);
    if (!readySymSpell) {
      readySymSpell = ss;
    }
    inFlightSeeds.delete(lang);
    return ss;
  })();
  inFlightSeeds.set(lang, promise);
  return promise;
}

/** Returns the active autocorrect language based on current keyboard layout settings. */
export function getActiveLanguage(): string {
  try {
    const settings = getKeyboardLayoutSettings();
    return getAutocorrectLanguage(settings.letterLayoutId);
  } catch {
    return 'en';
  }
}

/** Get (or lazily create) the SymSpell instance for a specific language. */
export async function getSymSpell(lang?: string): Promise<SymSpell> {
  const l = lang ?? getActiveLanguage();
  return ensureSymSpell(l);
}

/** Convenience for the currently active language. */
export async function getCurrentSymSpell(): Promise<SymSpell> {
  return getSymSpell();
}

/** Add/boost a learned word into all currently materialized SymSpell instances. */
export function addLearnedWord(rawWord: string): void {
  const w = rawWord.trim().toLowerCase();
  if (w.length < 2) return;
  const boost = 300_000;
  for (const ss of ssCache.values()) {
    ss.CreateDictionaryEntry(w, boost);
  }
  // Also ensure the ready instance (used by sync lookups) is boosted.
  if (readySymSpell) {
    readySymSpell.CreateDictionaryEntry(w, boost);
  }
}

/** Synchronous access to a ready SymSpell (may be English or last ensured). */
export function getReadySymSpell(): SymSpell | null {
  return readySymSpell;
}

/** True when the active SymSpell dictionary contains this exact term. */
export function hasDictionaryWord(word: string): boolean {
  const lower = word.trim().toLowerCase();
  if (lower.length < 2) {
    return false;
  }
  const lang = getActiveLanguage();
  if (lang === 'en' || lang === 'hi-en' || lang === 'fr-en') {
    if (isEnglishDictionaryWord(lower)) {
      return true;
    }
  }
  const ss = resolveSymSpellForLanguage();
  if (!ss) {
    return false;
  }
  const exact = ss.Lookup(lower, Verbosity.Top, 0);
  return exact.length > 0 && exact[0].distance === 0;
}

/** Rank from SymSpell frequency (lower = more common). */
export function symSpellRank(term: string, edits = 0): number {
  const lower = term.toLowerCase();
  const ss = resolveSymSpellForLanguage();
  const count = ss?.Lookup(lower, Verbosity.Top, 0)[0]?.count;
  return rankFromSymSpellFrequency(lower, count, edits);
}

/**
 * Lookup fuzzy candidates from the active SymSpell (async path ensures load).
 */
export async function lookupCandidates(
  typedLower: string,
  maxEd = 2,
  limit = 10,
): Promise<Candidate[]> {
  const ss = await getCurrentSymSpell();
  const results = ss.Lookup(typedLower, Verbosity.All, maxEd);
  return results.slice(0, limit).map(r => ({
    word: r.term,
    edits: r.distance,
    count: r.count,
  }));
}

function resolveSymSpellForLanguage(): SymSpell | null {
  const lang = getActiveLanguage();
  let ss = ssCache.get(lang) || null;

  if (!ss && (lang === 'hi-en' || lang === 'fr-en')) {
    // Kick off combined bilingual seed; use English immediately so typing
    // stays fast until the full dictionary is ready.
    void ensureSymSpell(lang);
    ss = readySymSpell ?? ssCache.get('en') ?? null;
  } else if (!ss && lang !== 'en' && DEDICATED_DICTIONARY_LANGS.has(lang)) {
    // Dedicated non-English dictionary not materialized yet: seed it lazily and
    // return null (no suggestions) rather than polluting with English.
    void ensureSymSpell(lang);
  } else if (!ss && (lang === 'en' || !ssCache.has(lang))) {
    ss = readySymSpell ?? ssCache.get('en') ?? null;
  }

  if (!ss) {
    return null;
  }

  if (ss === readySymSpell && !readyLearnedBoosted) {
    readyLearnedBoosted = true;
    ensureLearnedDictionaryLoaded()
      .then(() => {
        const learned = getLearnedCounts();
        for (const [w, uses] of learned) {
          if (uses > 0) {
            ss!.CreateDictionaryEntry(w, 200_000 + uses * 800);
          }
        }
      })
      .catch(() => {
        /* ignore */
      });
  }

  return ss;
}

/** Synchronous fuzzy lookup. Prefers the language-specific SymSpell.
 * Never falls back to English for non-English languages.
 */
export function lookupCandidatesSync(
  typedLower: string,
  maxEd = 2,
  limit = 10,
): Candidate[] {
  const ss = resolveSymSpellForLanguage();
  if (!ss) {
    return [];
  }

  const results = ss.Lookup(typedLower, Verbosity.All, maxEd);
  return results.slice(0, limit).map(r => ({
    word: r.term,
    edits: r.distance,
    count: r.count,
  }));
}

/**
 * Broader SymSpell lookup for swipe typing: returns all candidates within edit
 * distance, sorted by distance then frequency.
 */
export function lookupSwipeCandidatesSync(
  pattern: string,
  maxEd = 2,
  limit = 120,
): Candidate[] {
  const ss = resolveSymSpellForLanguage();
  if (!ss || !pattern || !englishSymSpellSeeded) {
    return [];
  }

  const normalized = pattern.toLowerCase();
  if (!/^[a-z]/.test(normalized)) {
    return [];
  }

  const results = ss.Lookup(normalized, Verbosity.All, maxEd);
  return results.slice(0, limit).map(r => ({
    word: r.term,
    edits: r.distance,
    count: r.count,
  }));
}

/** Compound-aware lookup (for missing-space detection / phrase correction). */
export async function lookupCompound(
  phrase: string,
  maxEd = 2,
): Promise<{term: string; distance: number; count: number} | null> {
  const ss = await getCurrentSymSpell();
  return ss.LookupCompound(phrase, maxEd);
}

/** Synchronous compound lookup. Prefers the language-specific SymSpell.
 * Never falls back to English for non-English languages.
 */
export function lookupCompoundSync(
  phrase: string,
  maxEd = 2,
): {term: string; distance: number; count: number} | null {
  const lang = getActiveLanguage();
  let ss = ssCache.get(lang) || null;

  if (!ss && (lang === 'hi-en' || lang === 'fr-en')) {
    void ensureSymSpell(lang);
    ss = readySymSpell ?? ssCache.get('en') ?? null;
  } else if (!ss && lang !== 'en' && DEDICATED_DICTIONARY_LANGS.has(lang)) {
    void ensureSymSpell(lang);
  } else if (!ss && (lang === 'en' || !ssCache.has(lang))) {
    ss = readySymSpell ?? ssCache.get('en') ?? null;
  }

  if (!ss) return null;
  if (ss === readySymSpell && !readyLearnedBoosted) {
    readyLearnedBoosted = true;
    ensureLearnedDictionaryLoaded()
      .then(() => {
        const learned = getLearnedCounts();
        for (const [w, uses] of learned) {
          if (uses > 0) ss!.CreateDictionaryEntry(w, 200_000 + uses * 800);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }
  return ss.LookupCompound(phrase, maxEd);
}

/** Return a base word list for prefix matching for the given (or active) lang. */
export function getBaseWords(lang?: string): string[] {
  const l = lang ?? getActiveLanguage();
  return getLangBase(l);
}

/** Preload the dictionary for the active language (useful on layout switch). */
export async function preloadActiveDictionary(): Promise<void> {
  const lang = getActiveLanguage();
  await getSymSpell(lang);
}

/** Primarily for tests / reset in dev. */
export function __resetDictionaryManagerForTests() {
  ssCache.clear();
  baseCache.clear();
  inFlightSeeds.clear();
  englishSymSpellSeeded = false;
  englishSymSpellSeeding = false;
  readySymSpell = null;
  readyLearnedBoosted = false;
  italianBase = null;
  germanBase = null;
  frenchBase = null;
  hinglishCombinedBase = null;
  franglaisCombinedBase = null;
  __resetHinglishLexiconForTests();
}
