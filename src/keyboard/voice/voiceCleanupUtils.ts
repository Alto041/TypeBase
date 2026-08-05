function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, '')
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

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({length: rows}, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

/** Reject Gemini/Gemma output that rewrites the transcript instead of lightly cleaning it. */
export function isFaithfulVoiceCleanup(original: string, cleaned: string): boolean {
  const orig = original.trim();
  const clean = cleaned.trim();

  if (!orig) {
    return !clean;
  }
  if (!clean) {
    return false;
  }

  const origWords = orig.split(/\s+/).filter(Boolean);
  const cleanWords = clean.split(/\s+/).filter(Boolean);
  const maxWordDelta = Math.max(2, Math.ceil(origWords.length * 0.25));

  if (Math.abs(cleanWords.length - origWords.length) > maxWordDelta) {
    return false;
  }

  const normalizedOriginal = normalizeForComparison(orig);
  const normalizedCleaned = normalizeForComparison(clean);
  const maxLen = Math.max(normalizedOriginal.length, normalizedCleaned.length);
  if (maxLen === 0) {
    return true;
  }

  const distance = levenshteinDistance(normalizedOriginal, normalizedCleaned);
  return 1 - distance / maxLen >= 0.72;
}

export function resolveVoiceCleanupText(original: string, cleaned: string): string {
  const trimmedCleaned = cleaned.trim();
  if (!trimmedCleaned) {
    return original.trim();
  }
  return isFaithfulVoiceCleanup(original, trimmedCleaned)
    ? trimmedCleaned
    : original.trim();
}
