import {getEnglishWordsByFrequency} from './englishFrequencyDictionary';

type TrieNode = {
  top: string[];
  next: Map<string, TrieNode>;
};

const MAX_WORDS_PER_NODE = 20;
const BUILD_CHUNK = 500;
const BUILD_DELAY_MS = 45;
/** Cap fallback scans so rare prefixes cannot walk the whole dictionary. */
const MAX_FALLBACK_SCAN = 2_500;

let root: TrieNode | null = null;
let indexReady = false;
let indexBuilding = false;

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

/** Runs after SymSpell seed — never in parallel with it. */
export function scheduleEnglishPrefixIndexBuild(): void {
  if (indexReady || indexBuilding) {
    return;
  }
  indexBuilding = true;
  root = createNode();

  const words = getEnglishWordsByFrequency();
  let index = 0;

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
  for (const word of getEnglishWordsByFrequency()) {
    scanned += 1;
    if (scanned > MAX_FALLBACK_SCAN) {
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
  const lower = prefix.toLowerCase();
  if (lower.length < 1 || !/^[\p{L}\p{M}']+$/u.test(lower)) {
    return [];
  }

  const node = walkPrefix(lower);
  if (node) {
    const out: string[] = [];
    for (const word of node.top) {
      if (word.startsWith(lower) && word !== lower) {
        out.push(word);
        if (out.length >= limit) {
          return out;
        }
      }
    }
    if (out.length < limit) {
      for (const word of scanPrefixMatches(lower, limit)) {
        if (!out.includes(word)) {
          out.push(word);
          if (out.length >= limit) {
            break;
          }
        }
      }
    }
    return out.slice(0, limit);
  }

  return scanPrefixMatches(lower, limit);
}

export function hasLongerPrefixMatch(typed: string): boolean {
  const lower = typed.toLowerCase();
  if (lower.length < 2) {
    return false;
  }
  const [next] = getPrefixCompletions(lower, 1);
  return next != null && next.length > lower.length;
}
