import hinglishWords from './data/hinglish_words.json';
import typebaseHinglish from './data/typebase_hinglish.json';
import typebaseHinglishFlat from './data/typebase_hinglish_flat.json';

/**
 * Hinglish lexicon: legacy underscore list + TypeBase word/phrase packs.
 * Underscore sources use `_` as a space; TypeBase packs use real spaces.
 */

export type HinglishPhrase = {
  spaced: string;
  joined: string;
  firstWord: string;
};

type TypebaseHinglishPack = {
  language?: string;
  words?: string[];
  phrases?: string[];
};

let loaded = false;
let singles: string[] = [];
let phrases: HinglishPhrase[] = [];
const headwordSet = new Set<string>();
const joinedToSpaced = new Map<string, string>();
const prefixBuckets = new Map<string, string[]>();
let symSpellTokens: string[] = [];

const tokenSet = new Set<string>();
const phraseList: HinglishPhrase[] = [];

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

function ingestSingle(lower: string) {
  if (!lower || lower.length < 2) {
    return;
  }
  if (!headwordSet.has(lower)) {
    headwordSet.add(lower);
    singles.push(lower);
  }
  tokenSet.add(lower);
  addPrefixCandidate(lower);
}

function registerPhraseParts(parts: string[], spaced: string, joined: string) {
  const firstWord = parts[0];
  if (parts.length <= 4) {
    phraseList.push({spaced, joined, firstWord});
    addPrefixCandidate(spaced);
  }
  if (joined.length >= 2) {
    joinedToSpaced.set(joined, spaced);
    tokenSet.add(joined);
  }
  for (const part of parts) {
    if (part.length >= 2) {
      tokenSet.add(part);
      addPrefixCandidate(part);
    }
  }
}

function ingestUnderscoreEntry(lower: string) {
  const parts = lower.split('_').filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  if (parts.length === 1) {
    ingestSingle(parts[0]);
    return;
  }
  const spaced = parts.join(' ');
  const joined = parts.join('');
  registerPhraseParts(parts, spaced, joined);
}

function ingestSpacedEntry(raw: string) {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower.length < 2) {
    return;
  }
  if (lower.includes('_')) {
    ingestUnderscoreEntry(lower);
    return;
  }
  const parts = lower.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  if (parts.length === 1) {
    ingestSingle(parts[0]);
    return;
  }
  const spaced = parts.join(' ');
  const joined = parts.join('');
  registerPhraseParts(parts, spaced, joined);
}

function ensureHinglishLexiconLoaded() {
  if (loaded) {
    return;
  }
  loaded = true;

  headwordSet.clear();
  joinedToSpaced.clear();
  prefixBuckets.clear();
  tokenSet.clear();
  phraseList.length = 0;
  singles = [];

  for (const raw of hinglishWords as string[]) {
    const lower = raw.trim().toLowerCase();
    if (!lower || lower.length < 2) {
      continue;
    }
    if (!lower.includes('_')) {
      ingestSingle(lower);
    } else {
      ingestUnderscoreEntry(lower);
    }
  }

  const pack = typebaseHinglish as TypebaseHinglishPack;
  for (const word of pack.words ?? []) {
    ingestSingle(word.trim().toLowerCase());
  }
  for (const phrase of pack.phrases ?? []) {
    ingestSpacedEntry(phrase);
  }

  for (const entry of typebaseHinglishFlat as string[]) {
    ingestSpacedEntry(entry);
  }

  phrases = phraseList;
  symSpellTokens = Array.from(tokenSet);
}

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

export function getHinglishPhraseCorrection(typedLower: string): string | null {
  ensureHinglishLexiconLoaded();
  const collapsed = typedLower.replace(/\s+/g, '');
  return joinedToSpaced.get(collapsed) ?? joinedToSpaced.get(typedLower) ?? null;
}

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
  phraseList.length = 0;
  headwordSet.clear();
  joinedToSpaced.clear();
  prefixBuckets.clear();
  symSpellTokens = [];
  tokenSet.clear();
}
