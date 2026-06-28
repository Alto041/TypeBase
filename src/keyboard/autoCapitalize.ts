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

type AutoCapitalizeShiftOptions = {
  /** EditorInfo requests sentence/word caps for this field. */
  inputRequestsInitialCaps?: boolean;
  /** User has typed at least once since this field gained focus. */
  hasTypedSinceFocus?: boolean;
  /**
   * When false, an empty `context` may be a chat-app quirk (always returns "").
   * In that case we avoid re-enabling shift on empty context mid-typing.
   */
  emptyContextTrustworthy?: boolean;
  /** A letter was committed very recently; context may not have caught up yet. */
  recentLetterCommit?: boolean;
  /** User explicitly cleared the field (e.g. backspaced to empty). */
  fieldWasCleared?: boolean;
};

/** Whether shift should be on for the next letter key. */
export function shouldAutoCapitalizeShift(
  context: string,
  options: AutoCapitalizeShiftOptions = {},
): boolean {
  const {
    inputRequestsInitialCaps = false,
    hasTypedSinceFocus = false,
    emptyContextTrustworthy = true,
    recentLetterCommit = false,
    fieldWasCleared = false,
  } = options;

  if (!inputRequestsInitialCaps) {
    return false;
  }

  if (context.length === 0) {
    if (fieldWasCleared) {
      return true;
    }
    if (recentLetterCommit) {
      return false;
    }
    // Some chat apps always return "" — don't re-enable shift mid-word.
    if (hasTypedSinceFocus && !emptyContextTrustworthy) {
      return false;
    }
    return true;
  }

  if (shouldAutoCapitalize(context)) {
    return true;
  }

  return false;
}
