export type AutocorrectIntensity = 'low' | 'medium' | 'high';

export type AutocorrectSettings = {
  enabled: boolean;
  /** When false, suggestions are tap-only — space keeps what you typed. */
  autoApplyOnSpace: boolean;
  /** Runs a conservative AI proofread after pauses/boundaries. */
  aiAutoCorrectEnabled: boolean;
  /** Uses sentence bigrams + personal history to pick better typo fixes. */
  contextCorrectionEnabled: boolean;
  /** How aggressively typo fixes auto-apply and appear in the bar. */
  intensity: AutocorrectIntensity;
};

export const DEFAULT_AUTOCORRECT_SETTINGS: AutocorrectSettings = {
  enabled: true,
  autoApplyOnSpace: true,
  aiAutoCorrectEnabled: false,
  contextCorrectionEnabled: true,
  intensity: 'medium',
};

const VALID_INTENSITIES: ReadonlySet<AutocorrectIntensity> = new Set([
  'low',
  'medium',
  'high',
]);

export function normalizeAutocorrectIntensity(
  value: unknown,
): AutocorrectIntensity {
  if (typeof value === 'string' && VALID_INTENSITIES.has(value as AutocorrectIntensity)) {
    return value as AutocorrectIntensity;
  }
  return DEFAULT_AUTOCORRECT_SETTINGS.intensity;
}

export const AUTOCORRECT_REMEMBERS = [
  'Words you type, pick, or keep on purpose',
  'Rejected autocorrections and manual fixes',
  'Phrases, slang, names, and punctuation habits',
] as const;
