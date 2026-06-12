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

function buildPreviewWords(
  committedWords: string[],
  partial: string,
): string[] {
  const {completeWords, inProgressWord} = splitPartialWords(partial);
  return [
    ...committedWords,
    ...completeWords,
    ...(inProgressWord ? [inProgressWord] : []),
  ];
}

export function finalsToWords(finals: string[]): string[] {
  return finals.join(' ').split(/\s+/).filter(Boolean);
}

export function getRollingPreviewWords(
  finals: string[],
  partial: string,
  maxWords = VOICE_PREVIEW_MAX_WORDS,
): string[] {
  const committedText = finals.join(' ').trim();
  const partialTrim = partial.trim();
  let livePartial = partialTrim;

  if (committedText && partialTrim.startsWith(committedText)) {
    livePartial = partialTrim.slice(committedText.length).trimStart();
  }

  return buildPreviewWords(finalsToWords(finals), livePartial).slice(-maxWords);
}

export function rollingPreviewText(
  committedWords: string[],
  partial: string,
  maxWords = VOICE_PREVIEW_MAX_WORDS,
): string {
  return buildPreviewWords(committedWords, partial)
    .slice(-maxWords)
    .join(' ');
}
