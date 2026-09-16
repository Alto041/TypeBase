import {getActiveLanguage, getPrefixIndexWordList} from './dictionaryManager';
import {getPrefixCompletions} from './englishPrefixIndex';
import {getOrCreatePrefixIndex} from '../gesture/prefixIndex';

/** Prefix completions for the active (or given) autocorrect language. */
export function getLanguagePrefixCompletions(
  prefix: string,
  limit = 8,
  lang?: string,
): string[] {
  const active = lang ?? getActiveLanguage();
  if (active === 'en') {
    return getPrefixCompletions(prefix, limit);
  }

  const words = getPrefixIndexWordList(active);
  if (words.length === 0) {
    return [];
  }

  const index = getOrCreatePrefixIndex(active, words);
  return index.getPrefixCompletions(prefix, limit);
}

export function hasLanguageLongerPrefixMatch(typed: string, lang?: string): boolean {
  const lower = typed.toLowerCase();
  if (lower.length < 2) {
    return false;
  }
  const [next] = getLanguagePrefixCompletions(lower, 1, lang);
  return next != null && next.length > lower.length;
}
