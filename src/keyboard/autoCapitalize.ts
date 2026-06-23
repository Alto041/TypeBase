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
};

/** Whether shift should be on for the next letter key. */
export function shouldAutoCapitalizeShift(
  context: string,
  options: AutoCapitalizeShiftOptions = {},
): boolean {
  const {inputRequestsInitialCaps = false, hasTypedSinceFocus = false} = options;

  // Many chat apps return empty context even after typing — don't re-enable shift.
  if (hasTypedSinceFocus && context.length === 0) {
    return false;
  }

  if (!hasTypedSinceFocus && context.length === 0) {
    return inputRequestsInitialCaps;
  }

  if (shouldAutoCapitalize(context)) {
    return true;
  }

  return false;
}
