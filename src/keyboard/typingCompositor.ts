import {extractPreviousWordFromContext} from './autocorrect/autocorrectEngine';
import {extractCurrentWord} from './suggestions/wordSuggestions';

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/**
 * True when the keyboard's in-flight buffer may be ahead of the editor (native lag),
 * not when it still holds text from a previous message.
 */
export function wordsAlignForInFlightCommit(
  contextWord: string,
  trackedWord: string,
): boolean {
  const context = normalizeWord(contextWord);
  const tracked = normalizeWord(trackedWord);
  if (!context || !tracked) {
    return false;
  }
  if (context === tracked) {
    return true;
  }
  return (
    tracked.startsWith(context) &&
    tracked.length - context.length <= 4
  );
}

/** Editor context wins unless the tracked word is a short in-flight extension. */
export function pickTypedWordForBoundary(
  fromContext: string,
  tracked: string,
): string {
  const contextWord = extractCurrentWord(fromContext).trim();
  const trackedWord = tracked.trim();
  if (!trackedWord) {
    return contextWord;
  }
  if (!contextWord) {
    return trackedWord;
  }
  if (wordsAlignForInFlightCommit(contextWord, trackedWord)) {
    return trackedWord.length >= contextWord.length
      ? trackedWord
      : contextWord;
  }
  return contextWord;
}

/** Keep live prefix aligned with the editor — never carry stale text across messages. */
export function reconcileLivePrefixFromContext(
  context: string,
  tracked: string,
  recentlyCommitted: boolean,
): string {
  const contextPrefix = extractCurrentWord(context);
  if (!contextPrefix) {
    if (recentlyCommitted) {
      return '';
    }
    if (!tracked) {
      return '';
    }
    if (!context.trim()) {
      return '';
    }
    if (/\s$/.test(context)) {
      return '';
    }
    return tracked;
  }
  if (!tracked) {
    return contextPrefix;
  }
  if (wordsAlignForInFlightCommit(contextPrefix, tracked)) {
    return tracked.length >= contextPrefix.length ? tracked : contextPrefix;
  }
  return contextPrefix;
}

export function derivePreviousWordFromEditor(
  context: string,
  prefix: string,
): string {
  return extractPreviousWordFromContext(context, prefix);
}
