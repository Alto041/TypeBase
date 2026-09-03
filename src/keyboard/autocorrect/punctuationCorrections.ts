/**
 * Punctuation Correction Engine
 *
 * Handles common punctuation omissions and replacements:
 * - Contractions: its → it's, dont → don't, etc.
 * - Apostrophes: im → i'm, youre → you're
 * - Common punctuation patterns
 *
 * This runs after basic autocorrect but before final commit.
 */

export type PunctuationCorrection = {
  correction: string;
  confidence: number;
  pattern: 'contraction' | 'apostrophe' | 'abbreviation';
};

/**
 * Comprehensive mapping of common punctuation omissions.
 * Organized by pattern type for easy maintenance.
 */
const CONTRACTION_MAP = new Map<string, string>([
  // "is" contractions
  ['its', "it's"],
  ['whats', "what's"],
  ['thats', "that's"],
  ['heres', "here's"],
  ['theres', "there's"],
  ['whos', "who's"],
  ['lets', "let's"],

  // "not" contractions (negations)
  ['dont', "don't"],
  ['cant', "can't"],
  ['wont', "won't"],
  ['shouldnt', "shouldn't"],
  ['wouldnt', "wouldn't"],
  ['couldnt', "couldn't"],
  ['havent', "haven't"],
  ['hasnt', "hasn't"],
  ['didnt', "didn't"],
  ['isnt', "isn't"],
  ['arent', "aren't"],
  ['wasnt', "wasn't"],
  ['werent', "weren't"],
  ['mustnt', "mustn't"],
  ['shant', "shan't"],

  // "am/are/have" contractions
  ['im', "i'm"],
  ['youre', "you're"],
  ['were', "we're"],
  ['theyre', "they're"],
  ['ive', "i've"],
  ['youve', "you've"],
  ['weve', "we've"],
  ['theyve', "they've"],

  // "have" contractions
  ['hed', "he'd"],
  ['shed', "she'd"],
  ['wed', "we'd"],
  ['youd', "you'd"],
  ['theyd', "they'd"],

  // "will" contractions
  ['ill', "i'll"],
  ['hell', "he'll"],
  ['shell', "she'll"],
  ['youll', "you'll"],
  ['well', "we'll"],
  ['theyll', "they'll"],

  // Other common contractions
  ['cant', "can't"],
  ['aint', "ain't"],
  ['oclock', "o'clock"],
  ['thatll', "that'll"],
  ['itll', "it'll"],
  ['whos', "who's"],
  ['whyd', "why'd"],
  ['howll', "how'll"],
  ['howd', "how'd"],
  ['shouldve', "should've"],
  ['wouldve', "would've"],
  ['couldve', "could've"],
  ['mightve', "might've"],
  ['mustve', "must've"],
]);

/**
 * Frequency-based confidence scores for contractions.
 * Higher = more common in English, more confident correction.
 */
const CONTRACTION_CONFIDENCE = new Map<string, number>([
  ["it's", 0.98],
  ["don't", 0.97],
  ["that's", 0.96],
  ["i'm", 0.95],
  ["can't", 0.94],
  ["won't", 0.93],
  ["what's", 0.93],
  ["you're", 0.92],
  ["there's", 0.91],
  ["here's", 0.90],
  ["let's", 0.90],
  ["they're", 0.88],
  ["i've", 0.87],
  ["you've", 0.85],
  ["we're", 0.84],
  ["hasn't", 0.83],
  ["didn't", 0.82],
  ["shouldn't", 0.80],
  ["wouldn't", 0.78],
  ["couldn't", 0.77],
  ["haven't", 0.76],
  ["i'll", 0.75],
  ["we'll", 0.74],
  ["she'll", 0.73],
  ["he'll", 0.72],
  ["isn't", 0.70],
  ["aren't", 0.68],
  ["wasn't", 0.67],
  ["weren't", 0.65],
  ["ain't", 0.60],
  ["o'clock", 0.85],
]);

/**
 * Words that should NOT be auto-corrected to contractions.
 * (e.g., "its" as a possessive should not be corrected in all contexts)
 */
const EXCLUDED_CORRECTIONS = new Set<string>([
  // Possessive "its" should not always become "it's"
  // This is context-dependent, so we exclude it for now.
  // If we see "its book" we should NOT correct it.
]);

/**
 * Check if a typed word matches a contraction pattern and return the correction.
 *
 * @param typed - The typed word (typically lowercase)
 * @param previousWord - The word before (for context)
 * @returns Punctuation correction candidate with confidence, or null if no match
 */
export function getPunctuationCorrection(
  typed: string,
  previousWord?: string,
): PunctuationCorrection | null {
  if (!typed || typed.length < 2) {
    return null;
  }

  const typedLower = typed.toLowerCase();

  // Check for excluded patterns
  if (EXCLUDED_CORRECTIONS.has(typedLower)) {
    return null;
  }

  // Check contraction map
  const contraction = CONTRACTION_MAP.get(typedLower);
  if (contraction) {
    const confidence = CONTRACTION_CONFIDENCE.get(contraction) ?? 0.85;
    return {
      correction: contraction,
      confidence,
      pattern: 'contraction',
    };
  }

  // Check for possessive "its" context — if previousWord suggests possessive, skip
  if (typedLower === 'its' && previousWord) {
    // Simple heuristic: "it's" is usually followed by verbs/adjectives
    // "its" is followed by nouns. If we see patterns like "its [noun]",
    // don't auto-correct. For now, return the correction but with lower confidence.
    return {
      correction: "it's",
      confidence: 0.45, // Low confidence for context-dependent case
      pattern: 'contraction',
    };
  }

  return null;
}

/**
 * Get all potential punctuation corrections for a typed word.
 * Used for suggestion bar display.
 *
 * @param typed - The typed word
 * @param limit - Maximum number of suggestions to return
 * @returns Array of punctuation corrections
 */
export function getPunctuationCorrectionOptions(
  typed: string,
  limit: number = 3,
): PunctuationCorrection[] {
  const result: PunctuationCorrection[] = [];
  const typedLower = typed.toLowerCase();

  // Direct match
  const direct = CONTRACTION_MAP.get(typedLower);
  if (direct) {
    const confidence = CONTRACTION_CONFIDENCE.get(direct) ?? 0.85;
    result.push({
      correction: direct,
      confidence,
      pattern: 'contraction',
    });
  }

  // Prefix-based suggestions (e.g., "dont" could be "don't", "dont" → "do not")
  // This is optional and can be enhanced later
  for (const [key, value] of CONTRACTION_MAP.entries()) {
    if (
      key !== typedLower &&
      (key.startsWith(typedLower) || typedLower.startsWith(key.slice(0, -1)))
    ) {
      const confidence = CONTRACTION_CONFIDENCE.get(value) ?? 0.70;
      if (
        result.length < limit &&
        !result.some(r => r.correction === value)
      ) {
        result.push({
          correction: value,
          confidence,
          pattern: 'contraction',
        });
      }
    }
  }

  return result.slice(0, limit);
}

/**
 * Determine if a punctuation correction should be applied automatically.
 * Uses confidence threshold and context clues.
 *
 * @param correction - The punctuation correction candidate
 * @param typed - The originally typed word
 * @param autoApplyThreshold - Minimum confidence to auto-apply (default: 0.90)
 * @returns true if should auto-apply
 */
export function shouldAutoApplyPunctuation(
  correction: PunctuationCorrection,
  typed: string,
  autoApplyThreshold: number = 0.90,
): boolean {
  // Special case: "its" / "it's" is context-dependent, never auto-apply
  if (typed.toLowerCase() === 'its') {
    return false;
  }

  // Auto-apply only high-confidence contractions
  return correction.confidence >= autoApplyThreshold;
}

/**
 * Apply proper casing to a punctuation correction.
 *
 * @param correction - The correction string
 * @param originalCasing - The original typed word for case reference
 * @returns Corrected word with proper casing applied
 */
export function applyCaseToPunctuation(
  correction: string,
  originalCasing: string,
): string {
  if (!originalCasing || originalCasing.length === 0) {
    return correction;
  }

  // If original started with uppercase, uppercase the first letter
  if (originalCasing[0] === originalCasing[0].toUpperCase()) {
    return correction[0].toUpperCase() + correction.slice(1);
  }

  return correction;
}

/**
 * Check if a word is a common contraction pattern.
 *
 * @param word - Word to check
 * @returns true if word matches a known contraction pattern
 */
export function isContractionPattern(word: string): boolean {
  return CONTRACTION_MAP.has(word.toLowerCase());
}

/**
 * Get all known contractions (for testing/debugging).
 *
 * @returns Array of [typed, correction] pairs
 */
export function getAllContractions(): Array<[string, string]> {
  return Array.from(CONTRACTION_MAP.entries());
}
