import englishWords from '../gesture/data/englishWords.json';
import italianWords from './data/italianWords.json';
import {getAutocorrectLanguage} from './languageMap';
import {SymSpell, Verbosity} from './symspell/SymSpell';
import {ensureLearnedDictionaryLoaded, getLearnedCounts} from '../suggestions/learnedDictionary';
import {getKeyboardLayoutSettings} from '../settings/layoutStore';

/**
 * Dictionary manager for multi-lingual autocorrect (SymSpell powered).
 *
 * Language is chosen automatically from the active `letterLayoutId` via languageMap.
 * No user-facing language selector.
 *
 * Current state:
 * - 'en' is eagerly seeded from englishWords.json (with derived freq).
 * - 'it' (Italian) is eagerly seeded from italianWords.json for full SymSpell support.
 * - Other languages start empty or with minimal data (learned words still work).
 * - Learned words are boosted into all materialized SymSpell instances.
 *
 * Adding a new language (example: French):
 * 1. Add a word list under src/keyboard/autocorrect/data/ (e.g. frenchWords.json).
 * 2. Import it here and extend getLangBase + eager seeding for lang==='fr'.
 * 3. languageMap already maps 'fr-fr' -> 'fr'.
 *
 * SymSpell gives us fast fuzzy + LookupCompound for missing-space / run-ons.
 */

type Candidate = {
  word: string;
  edits: number;
  count?: number;
};

const ssCache = new Map<string, SymSpell>();
const baseCache = new Map<string, string[]>();

let englishBase: string[] | null = null;
let italianBase: string[] | null = null;

/** The SymSpell we can use synchronously right now (populated eagerly for 'en'). */
let readySymSpell: SymSpell | null = null;
let readyLearnedBoosted = false;

function getEnglishBase(): string[] {
  if (!englishBase) {
    const seen = new Set<string>();
    englishBase = (englishWords as string[]).filter(w => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return englishBase;
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

// Eagerly seed English dictionary synchronously so the engine stays sync for fast path.
(function seedDefaultEnglish() {
  const en = new SymSpell(64, 2, 7);
  const enBase = getEnglishBase();
  enBase.forEach((w, i) => {
    const count = Math.max(1, 100_000 - Math.floor(i * 5));
    en.CreateDictionaryEntry(w, count);
  });
  ssCache.set('en', en);
  baseCache.set('en', enBase);
  readySymSpell = en;
})();

// Eagerly seed Italian dictionary for SymSpell-based Italian autocorrect (no manual selection).
(function seedDefaultItalian() {
  const it = new SymSpell(64, 2, 7);
  const itBase = getItalianBase();
  itBase.forEach((w, i) => {
    const count = Math.max(1, 100_000 - Math.floor(i * 5));
    it.CreateDictionaryEntry(w, count);
  });
  ssCache.set('it', it);
  baseCache.set('it', itBase);
})();

function getLangBase(lang: string): string[] {
  if (baseCache.has(lang)) {
    return baseCache.get(lang)!;
  }
  let list: string[];
  if (lang === 'en') {
    list = getEnglishBase();
  } else if (lang === 'it') {
    // Dedicated Italian list for proper SymSpell autocorrect + suggestions.
    list = getItalianBase();
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
  const base = getLangBase(lang);
  base.forEach((w, i) => {
    // Decreasing frequency; most common first in the array.
    const count = Math.max(1, 100_000 - Math.floor(i * 5));
    ss.CreateDictionaryEntry(w, count);
  });

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

  const ss = new SymSpell(64, 2, 7);
  await seedSymSpell(lang, ss);
  ssCache.set(lang, ss);
  if (!readySymSpell) {
    readySymSpell = ss;
  }
  return ss;
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
  const ss = resolveSymSpellForLanguage();
  if (!ss) {
    return false;
  }
  const exact = ss.Lookup(lower, Verbosity.Top, 0);
  return exact.length > 0 && exact[0].distance === 0;
}

/** Rank from SymSpell frequency (lower = more common). */
export function symSpellRank(term: string, edits = 0): number {
  const ss = resolveSymSpellForLanguage();
  if (!ss) {
    return 50_000 + edits * 100;
  }
  const hit = ss.Lookup(term.toLowerCase(), Verbosity.Top, 0);
  const count = hit[0]?.count ?? 0;
  return Math.max(0, 120_000 - count) + edits * 45;
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
  const results = ss.Lookup(typedLower, Verbosity.Closest, maxEd);
  return results.slice(0, limit).map(r => ({
    word: r.term,
    edits: r.distance,
    count: r.count,
  }));
}

function resolveSymSpellForLanguage(): SymSpell | null {
  const lang = getActiveLanguage();
  let ss = ssCache.get(lang) || null;

  if (!ss && (lang === 'en' || !ssCache.has(lang))) {
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

  const results = ss.Lookup(typedLower, Verbosity.Closest, maxEd);
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
  limit = 420,
): Candidate[] {
  const ss = resolveSymSpellForLanguage();
  if (!ss || !pattern) {
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

  if (!ss && (lang === 'en' || !ssCache.has(lang))) {
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
  englishBase = null;
  italianBase = null;
}
