export function normalizeLearnedWord(word: string): string {
  return word.trim().toLowerCase();
}

export function isLearnableWord(word: string): boolean {
  const normalized = normalizeLearnedWord(word);
  return (
    normalized.length >= 2 &&
    /^[\p{L}\p{M}']+$/u.test(normalized) &&
    !normalized.includes("''")
  );
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isLearnablePhrase(phrase: string): boolean {
  const normalized = normalizePhrase(phrase);
  const words = normalized.split(' ');
  if (words.length < 2 || words.length > 4) {
    return false;
  }
  return words.every(word => word.length >= 2 && /^[\p{L}\p{M}]+$/u.test(word));
}
