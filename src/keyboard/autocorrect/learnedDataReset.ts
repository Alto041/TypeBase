import {
  clearPersonalTypingProfile,
  ensurePersonalTypingLoaded,
} from '../personalTyping/personalTypingEngine';
import {getLearnedCounts} from '../suggestions/learnedDictionary';
import {getLearnedPhraseCounts} from './learnedPhrases';

export async function resetLearnedAutocorrectData(): Promise<void> {
  await clearPersonalTypingProfile();
}

export async function loadLearnedAutocorrectCounts(): Promise<{
  wordCount: number;
  phraseCount: number;
}> {
  await ensurePersonalTypingLoaded();

  return {
    wordCount: getLearnedCounts().size,
    phraseCount: getLearnedPhraseCounts().size,
  };
}
