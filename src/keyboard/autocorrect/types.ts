export type AutocorrectSettings = {
  enabled: boolean;
  /** When false, suggestions are tap-only — space keeps what you typed. */
  autoApplyOnSpace: boolean;
  /** Runs a conservative AI proofread after pauses/boundaries. */
  aiAutoCorrectEnabled: boolean;
};

export const DEFAULT_AUTOCORRECT_SETTINGS: AutocorrectSettings = {
  enabled: true,
  autoApplyOnSpace: true,
  aiAutoCorrectEnabled: false,
};

export const AUTOCORRECT_REMEMBERS = [
  'Names, slang, and technical terms',
  'Company and product names',
  'Phrases you use often',
] as const;
