import {keyboardBridge} from '../keyboardBridge';
import {
  getLearnedCounts,
  reloadLearnedDictionaryFromStorage,
  resetLearnedDictionaryCache,
} from '../suggestions/learnedDictionary';
import {
  getLearnedPhraseCounts,
  reloadLearnedPhrasesFromStorage,
  resetLearnedPhrasesCache,
} from './learnedPhrases';

export async function resetLearnedAutocorrectData(): Promise<void> {
  resetLearnedDictionaryCache();
  resetLearnedPhrasesCache();

  let cleared = await keyboardBridge.clearLearnedAutocorrectData();
  if (!cleared) {
    const [wordsCleared, phrasesCleared] = await Promise.all([
      keyboardBridge.clearLearnedWords(),
      keyboardBridge.clearLearnedPhrases(),
    ]);
    cleared = wordsCleared && phrasesCleared;
  }

  if (!cleared) {
    throw new Error('Failed to reset learned autocorrect data');
  }
}

export async function loadLearnedAutocorrectCounts(): Promise<{
  wordCount: number;
  phraseCount: number;
}> {
  await Promise.all([
    reloadLearnedDictionaryFromStorage(),
    reloadLearnedPhrasesFromStorage(),
  ]);

  return {
    wordCount: getLearnedCounts().size,
    phraseCount: getLearnedPhraseCounts().size,
  };
}
