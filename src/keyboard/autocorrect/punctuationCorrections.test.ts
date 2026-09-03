/**
 * Tests for Punctuation Corrections Engine
 */

import {
  getPunctuationCorrection,
  getPunctuationCorrectionOptions,
  shouldAutoApplyPunctuation,
  applyCaseToPunctuation,
  isContractionPattern,
  getAllContractions,
} from './punctuationCorrections';

describe('Punctuation Corrections', () => {
  describe('getPunctuationCorrection', () => {
    it('should correct common contractions', () => {
      expect(getPunctuationCorrection('dont')).toEqual({
        correction: "don't",
        confidence: 0.97,
        pattern: 'contraction',
      });

      expect(getPunctuationCorrection('cant')).toEqual({
        correction: "can't",
        confidence: 0.94,
        pattern: 'contraction',
      });

      expect(getPunctuationCorrection('im')).toEqual({
        correction: "i'm",
        confidence: 0.95,
        pattern: 'contraction',
      });

      expect(getPunctuationCorrection('youre')).toEqual({
        correction: "you're",
        confidence: 0.92,
        pattern: 'contraction',
      });
    });

    it('should correct "is" contractions', () => {
      expect(getPunctuationCorrection('thats')).toEqual({
        correction: "that's",
        confidence: 0.96,
        pattern: 'contraction',
      });

      expect(getPunctuationCorrection('whats')).toEqual({
        correction: "what's",
        confidence: 0.93,
        pattern: 'contraction',
      });
    });

    it('should correct "have" contractions', () => {
      expect(getPunctuationCorrection('ive')).toEqual({
        correction: "i've",
        confidence: 0.87,
        pattern: 'contraction',
      });

      expect(getPunctuationCorrection('youve')).toEqual({
        correction: "you've",
        confidence: 0.85,
        pattern: 'contraction',
      });
    });

    it('should handle case-insensitive input', () => {
      const result = getPunctuationCorrection('DONT');
      expect(result?.correction).toBe("don't");
    });

    it('should return null for non-contraction patterns', () => {
      expect(getPunctuationCorrection('hello')).toBeNull();
      expect(getPunctuationCorrection('world')).toBeNull();
      expect(getPunctuationCorrection('a')).toBeNull();
    });

    it('should handle special cases like "its"', () => {
      // "its" is context-dependent, so confidence should be low
      const result = getPunctuationCorrection('its');
      expect(result?.correction).toBe("it's");
      expect(result?.confidence).toBeLessThan(0.5);
    });

    it('should return null for empty input', () => {
      expect(getPunctuationCorrection('')).toBeNull();
    });
  });

  describe('shouldAutoApplyPunctuation', () => {
    it('should auto-apply high-confidence contractions', () => {
      const correction = getPunctuationCorrection('dont')!;
      expect(shouldAutoApplyPunctuation(correction, 'dont')).toBe(true);
    });

    it('should NOT auto-apply "its" contraction (context-dependent)', () => {
      const correction = getPunctuationCorrection('its')!;
      expect(shouldAutoApplyPunctuation(correction, 'its')).toBe(false);
    });

    it('should respect custom threshold', () => {
      const correction = getPunctuationCorrection('dont')!;
      expect(shouldAutoApplyPunctuation(correction, 'dont', 0.98)).toBe(false);
      expect(shouldAutoApplyPunctuation(correction, 'dont', 0.90)).toBe(true);
    });
  });

  describe('applyCaseToPunctuation', () => {
    it('should preserve case from original', () => {
      expect(applyCaseToPunctuation("don't", 'dont')).toBe("don't");
      expect(applyCaseToPunctuation("don't", 'Dont')).toBe("Don't");
    });

    it('should handle all uppercase', () => {
      expect(applyCaseToPunctuation("don't", 'DONT')).toBe("Don't");
    });

    it('should handle empty original', () => {
      expect(applyCaseToPunctuation("don't", '')).toBe("don't");
    });
  });

  describe('getPunctuationCorrectionOptions', () => {
    it('should return correction options for typo', () => {
      const options = getPunctuationCorrectionOptions('dont', 5);
      expect(options.length).toBeGreaterThan(0);
      expect(options[0].correction).toBe("don't");
    });

    it('should respect limit parameter', () => {
      const options = getPunctuationCorrectionOptions('dont', 1);
      expect(options.length).toBeLessThanOrEqual(1);
    });
  });

  describe('isContractionPattern', () => {
    it('should identify valid contraction patterns', () => {
      expect(isContractionPattern('dont')).toBe(true);
      expect(isContractionPattern('cant')).toBe(true);
      expect(isContractionPattern('im')).toBe(true);
    });

    it('should reject non-contractions', () => {
      expect(isContractionPattern('hello')).toBe(false);
      expect(isContractionPattern('world')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isContractionPattern('DONT')).toBe(true);
      expect(isContractionPattern('DoNt')).toBe(true);
    });
  });

  describe('getAllContractions', () => {
    it('should return array of contraction pairs', () => {
      const contractions = getAllContractions();
      expect(Array.isArray(contractions)).toBe(true);
      expect(contractions.length).toBeGreaterThan(0);
      // Check for some known contractions
      expect(contractions.some(([k]) => k === 'dont')).toBe(true);
      expect(contractions.some(([k]) => k === 'im')).toBe(true);
    });
  });

  describe('Common English Contractions', () => {
    const commonPatterns = [
      ['its', "it's"],
      ['thats', "that's"],
      ['dont', "don't"],
      ['cant', "can't"],
      ['wont', "won't"],
      ['im', "i'm"],
      ['youre', "you're"],
      ['theyre', "they're"],
      ['heres', "here's"],
      ['wheres', "where's"],
      ['ive', "i've"],
      ['youve', "you've"],
      ['weve', "we've"],
      ['havent', "haven't"],
      ['hasnt', "hasn't"],
      ['didnt', "didn't"],
    ];

    commonPatterns.forEach(([typed, expected]) => {
      it(`should correct "${typed}" to "${expected}"`, () => {
        const result = getPunctuationCorrection(typed);
        expect(result?.correction).toBe(expected);
      });
    });
  });
});
