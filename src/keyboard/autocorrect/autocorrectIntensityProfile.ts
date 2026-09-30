import {getAutocorrectSettings} from './autocorrectStore';
import type {AutocorrectIntensity} from './types';

/** Legacy baseline — medium intensity must match these exactly. */
export const LEGACY_MIN_AUTO_CONFIDENCE = 0.55;
export const LEGACY_MIN_SUGGESTION_BAR_CONFIDENCE = 0.51;
export const LEGACY_MIN_CONTEXT_CONFIDENCE = 0.48;
export const LEGACY_MIN_CONTEXT_CONFIDENCE_BOUNDARY = 0.52;
export const LEGACY_PUNCTUATION_AUTO_APPLY = 0.9;
export const LEGACY_PROPER_NOUN_AUTO_APPLY_MIN = 0.88;
export const LEGACY_AI_PREFLIGHT_SKIP_MIN = 0.82;

export type AutocorrectIntensityProfile = {
  minAutoConfidence: number;
  minSuggestionBarConfidence: number;
  minContextConfidence: number;
  minContextConfidenceBoundary: number;
  punctuationAutoApplyThreshold: number;
  properNounAutoApplyMinConfidence: number;
  aiPreflightSkipMinConfidence: number;
  fuzzyStrictness: 'relaxed' | 'normal' | 'strict';
};

const PROFILES: Record<AutocorrectIntensity, AutocorrectIntensityProfile> = {
  low: {
    minAutoConfidence: 0.7,
    minSuggestionBarConfidence: 0.6,
    minContextConfidence: 0.56,
    minContextConfidenceBoundary: 0.6,
    punctuationAutoApplyThreshold: 0.95,
    properNounAutoApplyMinConfidence: 0.92,
    aiPreflightSkipMinConfidence: 0.88,
    fuzzyStrictness: 'strict',
  },
  medium: {
    minAutoConfidence: LEGACY_MIN_AUTO_CONFIDENCE,
    minSuggestionBarConfidence: LEGACY_MIN_SUGGESTION_BAR_CONFIDENCE,
    minContextConfidence: LEGACY_MIN_CONTEXT_CONFIDENCE,
    minContextConfidenceBoundary: LEGACY_MIN_CONTEXT_CONFIDENCE_BOUNDARY,
    punctuationAutoApplyThreshold: LEGACY_PUNCTUATION_AUTO_APPLY,
    properNounAutoApplyMinConfidence: LEGACY_PROPER_NOUN_AUTO_APPLY_MIN,
    aiPreflightSkipMinConfidence: LEGACY_AI_PREFLIGHT_SKIP_MIN,
    fuzzyStrictness: 'normal',
  },
  high: {
    minAutoConfidence: 0.48,
    minSuggestionBarConfidence: 0.46,
    minContextConfidence: 0.42,
    minContextConfidenceBoundary: 0.46,
    punctuationAutoApplyThreshold: 0.85,
    properNounAutoApplyMinConfidence: 0.82,
    aiPreflightSkipMinConfidence: 0.78,
    fuzzyStrictness: 'relaxed',
  },
};

export function getAutocorrectIntensityProfile(): AutocorrectIntensityProfile {
  const intensity = getAutocorrectSettings().intensity;
  return PROFILES[intensity] ?? PROFILES.medium;
}

export function getMinAutoConfidence(): number {
  return getAutocorrectIntensityProfile().minAutoConfidence;
}

export function getMinSuggestionBarConfidence(): number {
  return getAutocorrectIntensityProfile().minSuggestionBarConfidence;
}

export function getContextConfidenceMin(boundary: boolean): number {
  const profile = getAutocorrectIntensityProfile();
  return boundary
    ? profile.minContextConfidenceBoundary
    : profile.minContextConfidence;
}

export function getPunctuationAutoApplyThreshold(): number {
  return getAutocorrectIntensityProfile().punctuationAutoApplyThreshold;
}

export function getProperNounAutoApplyMinConfidence(): number {
  return getAutocorrectIntensityProfile().properNounAutoApplyMinConfidence;
}

export function getAiPreflightSkipMinConfidence(): number {
  return getAutocorrectIntensityProfile().aiPreflightSkipMinConfidence;
}

/**
 * Extra fuzzy rejection on top of shouldRejectFuzzyCorrection for low/high intensity.
 */
export function shouldRejectFuzzyForIntensity(
  edits: number,
  learnedUses: number,
  boundary: boolean,
  confidence: number,
): boolean {
  const {fuzzyStrictness, minAutoConfidence} = getAutocorrectIntensityProfile();
  if (learnedUses > 0) {
    return false;
  }
  if (fuzzyStrictness === 'strict') {
    if (edits >= 2 && !boundary) {
      return true;
    }
    if (edits >= 2 && boundary && confidence < minAutoConfidence + 0.12) {
      return true;
    }
    return false;
  }
  if (fuzzyStrictness === 'relaxed') {
    if (edits >= 3 && !boundary) {
      return true;
    }
    return false;
  }
  return false;
}
