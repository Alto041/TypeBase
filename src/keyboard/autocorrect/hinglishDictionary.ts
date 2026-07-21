import hinglishWords from './data/hinglish_words.json';

/**
 * Hinglish lexicon helpers.
 * Source `hinglish_words.json` uses `_` as a space between Romanized Hindi words.
 */

export type HinglishPhrase = {
  /** Display / commit form with real spaces. */
  spaced: string;
  /** No-space form users sometimes type as a run-on. */
  joined: string;
  firstWord: string;
};

let loaded = false;
let singles: string[] = [];
let phrases: HinglishPhrase[] = [];
/** Plain headwords only (no underscore source rows). */
const headwordSet = new Set<string>();
/** joined / collapsed → spaced phrase (for autocorrect). */
const joinedToSpaced = new Map<string, string>();
/** Fast prefix buckets: first 1–2 chars → display candidates. */
const prefixBuckets = new Map<string, string[]>();
/** Tokens to seed into SymSpell (singles + phrase parts + joined). */
let symSpellTokens: string[] = [];

function addPrefixCandidate(display: string) {
  const key = display.toLowerCase();
  const first = key[0];
  if (!first) {
    return;
  }
  const keys = [first];
  if (key.length >= 2 && key[1] !== ' ') {
    keys.push(key.slice(0, 2));
  }
  // Also index by first word for multi-word phrases.
  const firstWord = key.split(' ')[0];
  if (firstWord.length >= 2) {
    keys.push(firstWord.slice(0, 2));
  }
  for (const bucketKey of keys) {
    const bucket = prefixBuckets.get(bucketKey);
    if (bucket) {
      if (!bucket.includes(display)) {
        bucket.push(display);
      }
    } else {
      prefixBuckets.set(bucketKey, [display]);
    }
  }
}

function ensureHinglishLexiconLoaded() {
  if (loaded) {
    return;
  }
  loaded = true;

  const singleSet = headwordSet;
  singleSet.clear();
  const tokenSet = new Set<string>();
  const phraseList: HinglishPhrase[] = [];
  singles = [];

  for (const raw of hinglishWords as string[]) {
    const lower = raw.trim().toLowerCase();
    if (!lower || lower.length < 2) {
      continue;
    }

    if (!lower.includes('_')) {
      if (!singleSet.has(lower)) {
        singleSet.add(lower);
        singles.push(lower);
      }
      tokenSet.add(lower);
      addPrefixCandidate(lower);
      continue;
    }

    const parts = lower.split('_').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    // Prefer shorter, useful phrases in the suggestion bar (skip huge verb templates).
    if (parts.length <= 4) {
      const spaced = parts.join(' ');
      const joined = parts.join('');
      const firstWord = parts[0];
      phraseList.push({spaced, joined, firstWord});
      if (joined.length >= 2) {
        joinedToSpaced.set(joined, spaced);
        tokenSet.add(joined);
      }
      addPrefixCandidate(spaced);
    } else {
      // Still map long run-ons for autocorrect, but don't suggest the whole template.
      const spaced = parts.join(' ');
      const joined = parts.join('');
      if (joined.length >= 2) {
        joinedToSpaced.set(joined, spaced);
        tokenSet.add(joined);
      }
    }
    for (const part of parts) {
      if (part.length >= 2) {
        tokenSet.add(part);
        // Index parts for prefix match, but don't pollute the "singles" cold-start list.
        addPrefixCandidate(part);
      }
    }
  }

  phrases = phraseList;
  symSpellTokens = Array.from(tokenSet);
}

/** True for a standalone Hinglish headword (e.g. batana) — never space-split these. */
export function isHinglishHeadword(word: string): boolean {
  ensureHinglishLexiconLoaded();
  return headwordSet.has(word.trim().toLowerCase());
}

export function getHinglishSingles(): readonly string[] {
  ensureHinglishLexiconLoaded();
  return singles;
}

export function getHinglishPhrases(): readonly HinglishPhrase[] {
  ensureHinglishLexiconLoaded();
  return phrases;
}

export function getHinglishSymSpellTokens(): readonly string[] {
  ensureHinglishLexiconLoaded();
  return symSpellTokens;
}

/** If typed is a run-on of a known phrase, return the spaced form. */
export function getHinglishPhraseCorrection(typedLower: string): string | null {
  ensureHinglishLexiconLoaded();
  const collapsed = typedLower.replace(/\s+/g, '');
  return joinedToSpaced.get(collapsed) ?? joinedToSpaced.get(typedLower) ?? null;
}

/**
 * Prefix / cold-start suggestions for the Hinglish layout.
 * Always returns display forms (spaces, never underscores).
 */
export function getHinglishSuggestions(prefix: string, limit = 3): string[] {
  ensureHinglishLexiconLoaded();
  const lower = prefix.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (word: string) => {
    const normalized = word.trim();
    if (!normalized || seen.has(normalized) || normalized === lower) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  };

  // Cold start: real Hinglish headwords, then short phrases.
  if (lower.length === 0) {
    for (const word of singles) {
      push(word);
      if (out.length >= limit) {
        return out;
      }
    }
    for (const phrase of phrases) {
      if (phrase.spaced.split(' ').length <= 3) {
        push(phrase.spaced);
        if (out.length >= limit) {
          return out;
        }
      }
    }
    return out;
  }

  const bucketKeys =
    lower.length >= 2 ? [lower.slice(0, 2), lower[0]] : [lower[0]];
  for (const key of bucketKeys) {
    const bucket = prefixBuckets.get(key);
    if (!bucket) {
      continue;
    }
    for (const candidate of bucket) {
      const candLower = candidate.toLowerCase();
      if (
        candLower.startsWith(lower) ||
        candLower.replace(/\s+/g, '').startsWith(lower)
      ) {
        push(candidate);
        if (out.length >= limit) {
          return out;
        }
      }
    }
  }

  // Fallback linear scan for longer prefixes (buckets are 1–2 char only).
  if (out.length < limit && lower.length >= 3) {
    for (const word of singles) {
      if (word.startsWith(lower)) {
        push(word);
        if (out.length >= limit) {
          return out;
        }
      }
    }
    for (const phrase of phrases) {
      if (
        phrase.spaced.startsWith(lower) ||
        phrase.joined.startsWith(lower) ||
        phrase.firstWord.startsWith(lower)
      ) {
        push(phrase.spaced);
        if (out.length >= limit) {
          return out;
        }
      }
    }
  }

  return out;
}

/** Hinglish-first then English — used as getBaseWords('hi-en') for membership. */
export function buildHinglishCombinedTokenList(englishBase: string[]): string[] {
  ensureHinglishLexiconLoaded();
  const seen = new Set<string>();
  const combined: string[] = [];

  for (const token of symSpellTokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    combined.push(token);
  }
  for (const word of englishBase) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    combined.push(word);
  }
  return combined;
}

export function __resetHinglishLexiconForTests() {
  loaded = false;
  singles = [];
  phrases = [];
  headwordSet.clear();
  joinedToSpaced.clear();
  prefixBuckets.clear();
  symSpellTokens = [];
}
