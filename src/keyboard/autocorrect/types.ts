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
  'Words you type, pick, or keep on purpose',
  'Rejected autocorrections and manual fixes',
  'Phrases, slang, names, and punctuation habits',
] as const;
