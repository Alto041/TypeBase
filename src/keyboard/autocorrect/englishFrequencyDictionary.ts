import englishWords from '../gesture/data/englishWords.json';

/** SymSpell-ordered word list (~82k). Single parse — no duplicate arrays. */
const WORDS: readonly string[] = englishWords as string[];

let wordSet: Set<string> | null = null;
let wordSetPartial: Set<string> | null = null;
let wordSetBuilding = false;
let rankByWord: Map<string, number> | null = null;
let rankMapReady = false;
let rankMapBuilding = false;

const WORD_SET_CHUNK = 6_000;
const WORD_SET_DELAY_MS = 20;

export function getEnglishWordsByFrequency(): readonly string[] {
  return WORDS;
}

/** Build word Set in idle chunks — never block the keyboard on 82k inserts. */
export function scheduleEnglishWordSetBuild(): void {
  if (wordSet || wordSetBuilding || WORDS.length === 0) {
    return;
  }
  wordSetBuilding = true;
  const partial = new Set<string>();
  wordSetPartial = partial;
  let index = 0;

  const step = (): void => {
    const end = Math.min(index + WORD_SET_CHUNK, WORDS.length);
    for (; index < end; index += 1) {
      partial.add(WORDS[index]!);
    }
    if (index < WORDS.length) {
      setTimeout(step, WORD_SET_DELAY_MS);
      return;
    }
    wordSet = partial;
    wordSetPartial = null;
    wordSetBuilding = false;
  };

  setTimeout(step, 400);
}

export function isEnglishWordSetReady(): boolean {
  return wordSet != null;
}

export function isEnglishDictionaryWord(word: string): boolean {
  const lower = word.toLowerCase();
  if (wordSet) {
    return wordSet.has(lower);
  }
  if (wordSetPartial) {
    return wordSetPartial.has(lower);
  }
  return false;
}

/** Synthetic SymSpell count from frequency list position. */
export function syntheticFrequencyCount(index: number): number {
  return Math.max(1, 10_000_000_000 - index * 120_000_000);
}

export function isEnglishRankMapReady(): boolean {
  return rankMapReady;
}

/** Build word→rank map in idle chunks (optional — SymSpell counts work without this). */
export function scheduleEnglishRankMapBuild(): void {
  if (rankMapReady || rankMapBuilding || WORDS.length === 0) {
    return;
  }
  rankMapBuilding = true;
  rankByWord = new Map();
  let index = 0;
  const chunk = 4_000;

  const step = (): void => {
    const end = Math.min(index + chunk, WORDS.length);
    for (; index < end; index += 1) {
      rankByWord!.set(WORDS[index]!, index);
    }
    if (index < WORDS.length) {
      setTimeout(step, 48);
      return;
    }
    rankMapReady = true;
    rankMapBuilding = false;
  };

  setTimeout(step, 2_500);
}

/** Lower rank = more common. Undefined until rank map finishes building. */
export function getEnglishStaticRank(word: string): number | undefined {
  if (!rankMapReady || !rankByWord) {
    return undefined;
  }
  return rankByWord.get(word.toLowerCase());
}

export function rankFromSymSpellFrequency(
  word: string,
  count?: number,
  edits = 0,
): number {
  if (count != null && count > 0) {
    return (
      Math.max(0, 120_000 - Math.floor(Math.log10(count + 1) * 12_000)) +
      edits * 45
    );
  }
  const rank = getEnglishStaticRank(word);
  if (rank != null) {
    return rank + edits * 45;
  }
  return 65_000 + edits * 45;
}

export const englishDictionarySize = (): number => WORDS.length;
