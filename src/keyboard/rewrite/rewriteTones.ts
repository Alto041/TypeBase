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
      'Fix grammar, spelling, punctuation, and awkward wording only. Keep the original tone, length, sentence style, and wording as much as possible. Do not make it more formal, more casual, or shorter unless needed for correctness.',
  },
  {
    id: 'professional',
    label: 'Pro',
    instruction:
      'Rewrite in a polished professional tone suitable for work messages. Use complete sentences, clear wording, respectful phrasing, and confident language. Remove slang and overly casual wording, but do not add greetings or sign-offs.',
  },
  {
    id: 'casual',
    label: 'Casual',
    instruction:
      'Rewrite in a relaxed, friendly, conversational tone. Prefer natural phrasing, simple words, and contractions where they fit. Keep it clear and human, not corporate or overly polished.',
  },
  {
    id: 'shorter',
    label: 'Short',
    instruction:
      'Make the text significantly shorter while preserving the core meaning. Remove filler, repeated ideas, hedging, and unnecessary detail. Aim for about half the original length when possible.',
  },
];

export const DEFAULT_REWRITE_TONE = 'fix';
