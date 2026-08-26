const GLUE_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'am',
  'was',
  'were',
  'be',
  'been',
  'to',
  'for',
  'and',
  'or',
  'in',
  'on',
  'at',
  'it',
  'you',
  'i',
  'my',
  'your',
  'me',
  'we',
  'they',
  'he',
  'she',
  'do',
  'does',
  'did',
  'can',
  'could',
  'will',
  'would',
  'should',
  'of',
  'with',
  'that',
  'this',
  'there',
  'here',
  'up',
]);

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a) {
    return b.length;
  }
  if (!b) {
    return a.length;
  }

  const prev = Array.from({length: b.length + 1}, (_, index) => index);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function wordsFrom(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter(Boolean);
}

function wordMatchesOriginal(word: string, originals: string[]): boolean {
  if (!word || GLUE_WORDS.has(word)) {
    return true;
  }

  const maxDistance = Math.max(2, Math.ceil(word.length * 0.34));
  return originals.some(original => {
    if (!original) {
      return false;
    }
    if (word === original) {
      return true;
    }
    return levenshteinDistance(word, original) <= maxDistance;
  });
}

function wordRetentionScore(original: string, correction: string): number {
  const originals = wordsFrom(original);
  if (originals.length === 0) {
    return 1;
  }

  let matched = 0;
  for (const word of originals) {
    if (wordMatchesOriginal(word, wordsFrom(correction))) {
      matched += 1;
    }
  }

  return matched / originals.length;
}

function similarityScore(original: string, correction: string): number {
  const a = normalizeForComparison(original);
  const b = normalizeForComparison(correction);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 1;
  }
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function hasUnsupportedNewWords(original: string, correction: string): boolean {
  const originals = wordsFrom(original);
  const correctionWords = wordsFrom(correction);

  for (const word of correctionWords) {
    if (wordMatchesOriginal(word, originals)) {
      continue;
    }
    return true;
  }

  return false;
}

export function isDegenerateTypeLiftOutput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (/\b([\w']{1,24})(?:\s+\1\b){3,}/i.test(trimmed)) {
    return true;
  }

  const words = wordsFrom(trimmed);
  if (words.length >= 6) {
    const counts = new Map<string, number>();
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    if (maxCount / words.length >= 0.55) {
      return true;
    }
  }

  return false;
}

export function cleanOnDeviceTypeLiftOutput(
  raw: string,
  original: string,
): string | null {
  const segments = raw
    .split(/(?:\\n|\r?\n)+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  let text = segments[0] ?? raw.trim();
  if (!text) {
    return null;
  }

  text = text.replace(/\b([\w']{1,24})(?:\s+\1\b)+/gi, '$1');

  const maxLen = Math.max(
    original.length + 24,
    Math.ceil(original.length * 1.4),
  );
  if (text.length > maxLen) {
    text = text.slice(0, maxLen).trim();
  }

  const cleaned = text
    .replace(/\\[nr]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || isDegenerateTypeLiftOutput(cleaned)) {
    return null;
  }

  return cleaned;
}

export type TypeLiftFaithfulnessMode = 'suggest' | 'auto';

export function isFaithfulTypeLiftCorrection(
  original: string,
  correction: string,
  mode: TypeLiftFaithfulnessMode = 'suggest',
): boolean {
  const orig = original.trim();
  const clean = correction.trim();
  if (!orig || !clean) {
    return false;
  }

  if (isDegenerateTypeLiftOutput(clean)) {
    return false;
  }

  if (hasUnsupportedNewWords(orig, clean)) {
    return false;
  }

  const retention = wordRetentionScore(orig, clean);
  const similarity = similarityScore(orig, clean);
  const origWords = wordsFrom(orig);
  const cleanWords = wordsFrom(clean);
  const maxWordDelta = Math.max(2, Math.ceil(origWords.length * 0.3));

  if (Math.abs(cleanWords.length - origWords.length) > maxWordDelta) {
    return false;
  }

  if (mode === 'auto') {
    return similarity >= 0.72 || retention >= 0.8;
  }

  return similarity >= 0.58 || retention >= 0.55;
}
