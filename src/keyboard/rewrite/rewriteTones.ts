export type RewriteTone = {
  id: string;
  label: string;
  instruction: string;
};

export const REWRITE_TONES: RewriteTone[] = [
  {
    id: 'fix',
    label: 'Fix',
    instruction:
      'Fix grammar, spelling, and punctuation. Improve clarity while keeping the same meaning and tone.',
  },
  {
    id: 'professional',
    label: 'Pro',
    instruction:
      'Rewrite in a clear, professional tone suitable for work email or formal messages.',
  },
  {
    id: 'casual',
    label: 'Casual',
    instruction:
      'Rewrite in a natural, friendly, conversational tone while staying clear.',
  },
  {
    id: 'shorter',
    label: 'Short',
    instruction:
      'Make the text more concise. Remove filler words but keep the core meaning.',
  },
];

export const DEFAULT_REWRITE_TONE = 'fix';
