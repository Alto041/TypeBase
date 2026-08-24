export type LearningSource =
  | 'typed'
  | 'picked'
  | 'kept'
  | 'corrected'
  | 'manual';

export type LearnedWordEntry = {
  uses: number;
  confidence: number;
  rejections: number;
  lastUsed: number;
  source?: LearningSource;
};

export type LearnedPhraseEntry = {
  uses: number;
  confidence: number;
  rejections: number;
  lastUsed: number;
};

export type CorrectionPairEntry = {
  from: string;
  to: string;
  accepts: number;
  rejections: number;
  confidence: number;
  lastUsed: number;
};

export type PersonalTypingProfile = {
  version: 1;
  words: Record<string, LearnedWordEntry>;
  phrases: Record<string, LearnedPhraseEntry>;
  corrections: Record<string, CorrectionPairEntry>;
  punctuation: Record<string, number>;
  updatedAt: number;
};

export type PersonalTypingWordSnapshot = {
  word: string;
  uses: number;
  confidence: number;
  rejections: number;
  lastUsed: number;
};

export type PersonalTypingPhraseSnapshot = {
  phrase: string;
  uses: number;
  confidence: number;
  rejections: number;
  lastUsed: number;
};

export type PersonalTypingCorrectionSnapshot = {
  from: string;
  to: string;
  accepts: number;
  rejections: number;
  confidence: number;
};

export type PersonalTypingSnapshot = {
  words: PersonalTypingWordSnapshot[];
  phrases: PersonalTypingPhraseSnapshot[];
  corrections: PersonalTypingCorrectionSnapshot[];
  punctuation: Array<{pattern: string; uses: number}>;
  wordCount: number;
  phraseCount: number;
  correctionCount: number;
};
