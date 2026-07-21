import {getEnglishWordsByFrequency} from '../autocorrect/englishFrequencyDictionary';

/** Frequency-ordered English words (SymSpell dictionary). */
export function getEnglishWordsSource(): readonly string[] {
  return getEnglishWordsByFrequency();
}
