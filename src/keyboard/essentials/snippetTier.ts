export const FREE_SNIPPET_LIMIT = 3;

export type SaveEssentialFailureReason =
  | 'invalid_keyword'
  | 'duplicate'
  | 'limit'
  | 'placeholders';

export function snippetSuggestionLimit(isPremium: boolean): number {
  return isPremium ? 5 : 3;
}

export function saveEssentialFailureMessage(
  reason: SaveEssentialFailureReason,
): string {
  switch (reason) {
    case 'invalid_keyword':
      return 'Use letters, numbers, or underscores for the keyword.';
    case 'duplicate':
      return 'That keyword is already used.';
    case 'limit':
      return `Free tier allows ${FREE_SNIPPET_LIMIT} snippets. Unlock premium for unlimited.`;
    case 'placeholders':
      return 'Placeholders like ;date and ;time require premium.';
    default:
      return 'Could not save snippet.';
  }
}
