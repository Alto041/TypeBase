import type {AutocorrectIntensity} from '../autocorrect/types';

/** Slightly looser neighbor-key autocorrect while walking; still avoids rewriting valid words. */
export function walkModeAutocorrectScale(intensity: AutocorrectIntensity): number {
  switch (intensity) {
    case 'low':
      return 0.92;
    case 'high':
      return 0.78;
    default:
      return 0.85;
  }
}

export const WALK_MODE_HIT_SLOP_MULTIPLIER = 1.22;
