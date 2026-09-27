const FILLER_PATTERN =
  /\b(?:um+m?|uh+h?|hmm+|hm+|mm+|er+r?|ah+h?|mhm+|eh+h?)\b/gi;

const SPOKEN_PUNCTUATION_WORD =
  /\b(?:new line|newline|exclamation point|exclamation mark|question mark|full stop|period|dot|comma|colon|semicolon|open quote|close quote|quote|apostrophe)\b/i;

/** Strip common speech fillers before comparing or as a light pre-clean pass. */
export function stripSpeechFillers(text: string): string {
  return text
    .replace(FILLER_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^\s+|[\s,]+$/g, '')
    .trim();
}

/** True when the transcript likely still needs an AI polish pass. */
export function needsVoicePolish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  FILLER_PATTERN.lastIndex = 0;
  if (FILLER_PATTERN.test(trimmed)) {
    return true;
  }

  if (/\b(\w+)(?:\s+\1\b)+/i.test(trimmed)) {
    return true;
  }

  if (/\b(\w+)\s+that\s+\1\b/i.test(trimmed)) {
    return true;
  }

  if (SPOKEN_PUNCTUATION_WORD.test(trimmed)) {
    return true;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && trimmed === trimmed.toLowerCase()) {
    return true;
  }

  if (words.length >= 6 && !/[.!?]$/.test(trimmed)) {
    return true;
  }

  return false;
}

/** Fast local cleanup for noisy STT before optional Gemma polish. */
export function applyVoiceHeuristicCleanup(text: string): string {
  let result = stripSpeechFillers(text);

  // Collapse immediate repeated words: "that that" -> "that"
  result = result.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');

  // Collapse stuttered clauses: "because that because" -> "because"
  result = result.replace(/\b(\w+)\s+that\s+\1\b/gi, '$1');

  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?]\s+)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
    .trim();

  return result;
}

const SPOKEN_PUNCTUATION: ReadonlyArray<[RegExp, string]> = [
  [/\b(new line|newline)\b/gi, '\n'],
  [/\b(exclamation point|exclamation mark)\b/gi, '!'],
  [/\b(question mark)\b/gi, '?'],
  [/\b(full stop|period|dot)\b/gi, '.'],
  [/\b(comma)\b/gi, ','],
  [/\b(colon)\b/gi, ':'],
  [/\b(semicolon)\b/gi, ';'],
  [/\b(open quote|close quote|quote)\b/gi, '"'],
  [/\b(apostrophe)\b/gi, "'"],
];

function applySpokenPunctuation(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SPOKEN_PUNCTUATION) {
    result = result.replace(pattern, replacement);
  }

  return result
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?=[^\s\n])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function capitalizeSentences(text: string): string {
  const withStandaloneI = text.replace(/\bi\b/g, 'I');
  if (!withStandaloneI) {
    return withStandaloneI;
  }

  const capped = withStandaloneI.replace(
    /(^|[.!?]\s+|\n+)([a-z])/g,
    (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`,
  );

  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/** Strong on-device polish after Parakeet (no LLM). */
export function polishVoiceTranscriptLocal(text: string): string {
  const heuristic = applyVoiceHeuristicCleanup(text);
  const punctuated = applySpokenPunctuation(heuristic);
  return capitalizeSentences(punctuated);
}

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

function isPunctuationOnlyDrift(original: string, cleaned: string): boolean {
  if (normalizeForComparison(original) !== normalizeForComparison(cleaned)) {
    return false;
  }
  return original.trim() !== cleaned.trim();
}

export function resolveVoiceCleanupText(
  original: string,
  cleaned: string,
  options?: {allowFillerRemoval?: boolean},
): string {
  const trimmedOriginal = original.trim();
  const trimmedCleaned = cleaned.trim();
  if (!trimmedCleaned) {
    return trimmedOriginal;
  }

  const defillerized = stripSpeechFillers(trimmedOriginal);
  const removedFillers = defillerized !== trimmedOriginal;

  // Reject Gemma/Gemini adding stray quotes or punctuation when meaning is unchanged.
  if (
    isPunctuationOnlyDrift(trimmedOriginal, trimmedCleaned) &&
    !removedFillers
  ) {
    return trimmedOriginal;
  }

  if (isFaithfulVoiceCleanup(trimmedOriginal, trimmedCleaned)) {
    return trimmedCleaned;
  }
  if (
    options?.allowFillerRemoval &&
    isFaithfulVoiceCleanup(defillerized, trimmedCleaned)
  ) {
    return trimmedCleaned;
  }
  return trimmedOriginal;
}
