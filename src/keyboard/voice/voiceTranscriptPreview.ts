export const VOICE_PREVIEW_MAX_WORDS = 4;

export function splitPartialWords(partial: string): {
  completeWords: string[];
  inProgressWord: string;
} {
  const trimmed = partial.trim();
  if (!trimmed) {
    return {completeWords: [], inProgressWord: ''};
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return {completeWords: [], inProgressWord: words[0]};
  }

  return {
    completeWords: words.slice(0, -1),
    inProgressWord: words[words.length - 1],
  };
}

export function rollingPreviewText(
  committedWords: string[],
  partial: string,
  maxWords = VOICE_PREVIEW_MAX_WORDS,
): string {
  const {completeWords, inProgressWord} = splitPartialWords(partial);
  const previewWords = [
    ...committedWords,
    ...completeWords,
    ...(inProgressWord ? [inProgressWord] : []),
  ];
  return previewWords.slice(-maxWords).join(' ');
}
