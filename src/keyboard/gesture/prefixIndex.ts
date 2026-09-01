type TrieNode = {
  top: string[];
  next: Map<string, TrieNode>;
};

export type PrefixIndex = {
  getPrefixCompletions(prefix: string, limit?: number): string[];
  hasPrefixNode(prefix: string): boolean;
  countPrefixCompletions(prefix: string, limit?: number): number;
  /** Sum frequency weights per next child letter at the prefix node. */
  getNextLetterWeights(
    prefix: string,
    wordWeight: (word: string) => number,
  ): Map<string, number>;
};

const MAX_WORDS_PER_NODE = 24;
const BUILD_CHUNK = 500;
const BUILD_DELAY_MS = 45;
const MAX_FALLBACK_SCAN = 360;
const DEFAULT_BOOTSTRAP_WORDS = 12_000;

function createNode(): TrieNode {
  return {top: [], next: new Map()};
}

function isIndexableWord(word: string): boolean {
  return word.length >= 2 && /^[\p{L}\p{M}']+$/u.test(word);
}

function createPrefixIndex(words: readonly string[], bootstrapWords = DEFAULT_BOOTSTRAP_WORDS): PrefixIndex {
  let root: TrieNode | null = null;
  let indexReady = false;
  let indexBuilding = false;
  let bootstrapWordIndex = 0;

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

  function ensureBootstrap(): void {
    if (root) {
      return;
    }
    root = createNode();
    const end = Math.min(bootstrapWords, words.length);
    for (let i = 0; i < end; i += 1) {
      const word = words[i]!;
      if (isIndexableWord(word)) {
        insertWord(word.toLowerCase());
      }
    }
    bootstrapWordIndex = end;
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
    for (const word of words) {
      scanned += 1;
      if (scanned > maxScan) {
        break;
      }
      if (word.length < 2) {
        continue;
      }
      const normalized = word.toLowerCase();
      if (normalized.startsWith(lower) && normalized !== lower) {
        matches.push(normalized);
        if (matches.length >= limit) {
          break;
        }
      }
    }
    return matches;
  }

  function scheduleBuild(): void {
    ensureBootstrap();
    if (indexReady || indexBuilding || bootstrapWordIndex >= words.length) {
      if (bootstrapWordIndex >= words.length) {
        indexReady = true;
      }
      return;
    }
    indexBuilding = true;

    let index = bootstrapWordIndex;
    const step = (): void => {
      const end = Math.min(index + BUILD_CHUNK, words.length);
      for (; index < end; index += 1) {
        const word = words[index]!;
        if (isIndexableWord(word)) {
          insertWord(word.toLowerCase());
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

  scheduleBuild();

  return {
    getPrefixCompletions(prefix: string, limit = 8): string[] {
      ensureBootstrap();
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
    },

    hasPrefixNode(prefix: string): boolean {
      ensureBootstrap();
      const lower = prefix.toLowerCase();
      if (!lower) {
        return false;
      }
      return walkPrefix(lower) != null;
    },

    countPrefixCompletions(prefix: string, limit = 8): number {
      return this.getPrefixCompletions(prefix, limit).length;
    },

    getNextLetterWeights(
      prefix: string,
      wordWeight: (word: string) => number,
    ): Map<string, number> {
      ensureBootstrap();
      const lower = prefix.toLowerCase();
      if (!lower || !/^[\p{L}\p{M}']+$/u.test(lower)) {
        return new Map();
      }
      const node = walkPrefix(lower);
      if (!node) {
        return new Map();
      }

      const weights = new Map<string, number>();
      for (const [letter, child] of node.next) {
        if (!/[a-z]/.test(letter)) {
          continue;
        }
        let sum = 0;
        for (const word of child.top) {
          if (word.startsWith(lower) && word.length > lower.length) {
            sum += wordWeight(word);
          }
        }
        if (sum > 0) {
          weights.set(letter, sum);
        }
      }
      return weights;
    },
  };
}

const indexByLang = new Map<string, PrefixIndex>();

export function getOrCreatePrefixIndex(
  lang: string,
  words: readonly string[],
  bootstrapWords = DEFAULT_BOOTSTRAP_WORDS,
): PrefixIndex {
  const existing = indexByLang.get(lang);
  if (existing) {
    return existing;
  }
  const created = createPrefixIndex(words, bootstrapWords);
  indexByLang.set(lang, created);
  return created;
}

export function resetPrefixIndexesForTests(): void {
  indexByLang.clear();
}
