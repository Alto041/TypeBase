import {extractCurrentWord} from './suggestions/wordSuggestions';

/** True when the next typed letter should be capitalized (sentence / field start). */
export function shouldAutoCapitalize(context: string): boolean {
  if (extractCurrentWord(context).length > 0) {
    return false;
  }

  const trimmed = context.replace(/[^\S\n\r]+$/u, '');
  if (!trimmed) {
    return true;
  }

  const lastChar = trimmed[trimmed.length - 1];
  return (
    lastChar === '.' ||
    lastChar === '?' ||
    lastChar === '!' ||
    lastChar === '\n' ||
    lastChar === '\r'
  );
}
