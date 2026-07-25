import {getEnglishWordsByFrequency} from './englishFrequencyDictionary';

type TrieNode = {
  top: string[];
  next: Map<string, TrieNode>;
};

const MAX_WORDS_PER_NODE = 24;
const BUILD_CHUNK = 500;
const BUILD_DELAY_MS = 45;
/** Sync insert on first lookup — common prefixes work without waiting for full build. */
const SYNC_PREFIX_BOOTSTRAP_WORDS = 4_000;
/** Cap linear fallback when trie node is sparse (never walk tens of thousands). */
const MAX_FALLBACK_SCAN = 360;

let root: TrieNode | null = null;
let indexReady = false;
let indexBuilding = false;
let bootstrapWordIndex = 0;

function createNode(): TrieNode {
  return {top: [], next: new Map()};
}

function insertWord(word: string): void {
  if (!root || word.length < 2) {
    return;
  }
  let node = root;
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i]!;
    let next = node.next.get(ch);
    if (!next) {
      next = createNode();
      node.next.set(ch, next);
    }
    node = next;
    if (node.top.length < MAX_WORDS_PER_NODE) {
      node.top.push(word);
    }
  }
}

function ensureSyncPrefixBootstrap(): void {
  if (root) {
    return;
  }
  root = createNode();
  const words = getEnglishWordsByFrequency();
  const end = Math.min(SYNC_PREFIX_BOOTSTRAP_WORDS, words.length);
  for (let i = 0; i < end; i += 1) {
    const word = words[i]!;
    if (word.length >= 2 && /^[\p{L}\p{M}']+$/u.test(word)) {
      insertWord(word);
    }
  }
  bootstrapWordIndex = end;
}

/** Runs after SymSpell seed — never in parallel with it. */
export function scheduleEnglishPrefixIndexBuild(): void {
  ensureSyncPrefixBootstrap();
  if (indexReady || indexBuilding) {
    return;
  }
  indexBuilding = true;

  const words = getEnglishWordsByFrequency();
  let index = bootstrapWordIndex;

  const step = (): void => {
    const end = Math.min(index + BUILD_CHUNK, words.length);
    for (; index < end; index += 1) {
      const word = words[index]!;
      if (word.length >= 2 && /^[\p{L}\p{M}']+$/u.test(word)) {
        insertWord(word);
      }
    }

    if (index < words.length) {
      setTimeout(step, BUILD_DELAY_MS);
      return;
    }

    indexReady = true;
    indexBuilding = false;
  };

  setTimeout(step, 0);
}

export function isEnglishPrefixIndexReady(): boolean {
  return indexReady;
}

function walkPrefix(prefix: string): TrieNode | null {
  if (!root || !prefix) {
    return null;
  }
  let node: TrieNode = root;
  for (let i = 0; i < prefix.length; i += 1) {
    const next = node.next.get(prefix[i]!);
    if (!next) {
      return null;
    }
    node = next;
  }
  return node;
}

function scanPrefixMatches(prefix: string, limit: number): string[] {
  const lower = prefix.toLowerCase();
  if (lower.length < 1) {
    return [];
  }

  const matches: string[] = [];
  let scanned = 0;
  const maxScan = Math.min(MAX_FALLBACK_SCAN, Math.max(limit * 40, 80));
  for (const word of getEnglishWordsByFrequency()) {
    scanned += 1;
    if (scanned > maxScan) {
      break;
    }
    if (word.length < 2) {
      continue;
    }
    if (word.startsWith(lower) && word !== lower) {
      matches.push(word);
      if (matches.length >= limit) {
        break;
      }
    }
  }
  return matches;
}

export function getPrefixCompletions(prefix: string, limit = 8): string[] {
  ensureSyncPrefixBootstrap();
  const lower = prefix.toLowerCase();
  if (lower.length < 1 || !/^[\p{L}\p{M}']+$/u.test(lower)) {
    return [];
  }

  const want = Math.min(Math.max(limit, 1), MAX_WORDS_PER_NODE);

  const node = walkPrefix(lower);
  if (node) {
    const out: string[] = [];
    for (const word of node.top) {
      if (word.startsWith(lower) && word !== lower) {
        out.push(word);
        if (out.length >= want) {
          return out;
        }
      }
    }
    if (out.length < want) {
      for (const word of scanPrefixMatches(lower, want - out.length)) {
        if (!out.includes(word)) {
          out.push(word);
          if (out.length >= want) {
            break;
          }
        }
      }
    }
    return out.slice(0, want);
  }

  return scanPrefixMatches(lower, want);
}

export function hasLongerPrefixMatch(typed: string): boolean {
  const lower = typed.toLowerCase();
  if (lower.length < 2) {
    return false;
  }
  const [next] = getPrefixCompletions(lower, 1);
  return next != null && next.length > lower.length;
}
