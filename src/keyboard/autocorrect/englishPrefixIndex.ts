import {
  ENGLISH_ACCURACY_BOOTSTRAP_WORDS,
  getEnglishWordsByFrequency,
} from './englishFrequencyDictionary';
import {getOrCreatePrefixIndex, type PrefixIndex} from '../gesture/prefixIndex';

const MAX_WORDS_PER_NODE = 24;

let englishIndex: PrefixIndex | null = null;

function getEnglishIndex(): PrefixIndex {
  if (!englishIndex) {
    englishIndex = getOrCreatePrefixIndex(
      'en',
      getEnglishWordsByFrequency(),
      ENGLISH_ACCURACY_BOOTSTRAP_WORDS,
    );
  }
  return englishIndex;
}

/** Runs after SymSpell seed — never in parallel with it. */
export function scheduleEnglishPrefixIndexBuild(): void {
  getEnglishIndex();
}

export function isEnglishPrefixIndexReady(): boolean {
  return true;
}

export function getPrefixCompletions(prefix: string, limit = 8): string[] {
  return getEnglishIndex().getPrefixCompletions(prefix, limit);
}

export function hasLongerPrefixMatch(typed: string): boolean {
  const lower = typed.toLowerCase();
  if (lower.length < 2) {
    return false;
  }
  const [next] = getPrefixCompletions(lower, 1);
  return next != null && next.length > lower.length;
}

export {MAX_WORDS_PER_NODE};
