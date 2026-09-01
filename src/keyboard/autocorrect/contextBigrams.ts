type BigramFollowers = Array<[string, number]>;

let bigramIndex: Record<string, BigramFollowers> | null = null;
let preloadScheduled = false;
const followerMapCache = new Map<string, Map<string, number>>();

function ensureBigramIndex(): Record<string, BigramFollowers> {
  if (!bigramIndex) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bigramIndex = require('./data/english_bigrams.json') as Record<
      string,
      BigramFollowers
    >;
  }
  return bigramIndex;
}

function followerMapFor(previousWord: string): Map<string, number> | undefined {
  const prev = previousWord.trim().toLowerCase();
  if (!prev) {
    return undefined;
  }
  const cached = followerMapCache.get(prev);
  if (cached) {
    return cached;
  }
  const followers = ensureBigramIndex()[prev];
  if (!followers?.length) {
    return undefined;
  }
  const map = new Map<string, number>(followers);
  followerMapCache.set(prev, map);
  return map;
}

/** Warm the bigram table off the typing hot path. */
export function preloadContextBigrams(): void {
  if (preloadScheduled || bigramIndex) {
    return;
  }
  preloadScheduled = true;
  const run = () => {
    try {
      ensureBigramIndex();
    } catch {
      preloadScheduled = false;
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, {timeout: 2500});
  } else {
    setTimeout(run, 1200);
  }
}

/** Raw follower score from the bigram table (0 when unknown). */
export function getBigramFollowScore(
  previousWord: string,
  nextWord: string,
): number {
  const prev = previousWord.trim().toLowerCase();
  const next = nextWord.trim().toLowerCase();
  if (!prev || !next) {
    return 0;
  }
  return followerMapFor(prev)?.get(next) ?? 0;
}

export function getTopBigramFollowers(
  previousWord: string,
  limit = 12,
): ReadonlyArray<{word: string; score: number}> {
  const prev = previousWord.trim().toLowerCase();
  if (!prev) {
    return [];
  }
  const followers = ensureBigramIndex()[prev];
  if (!followers?.length) {
    return [];
  }
  return followers.slice(0, limit).map(([word, score]) => ({word, score}));
}

export function resetContextBigramsForTests(): void {
  bigramIndex = null;
  preloadScheduled = false;
  followerMapCache.clear();
}
