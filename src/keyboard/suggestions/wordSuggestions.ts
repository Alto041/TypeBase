import englishWords from '../gesture/data/englishWords.json';
import {getLearnedCounts} from './learnedDictionary';

const WORDS = englishWords as string[];
const STATIC_RANK = new Map<string, number>(
  WORDS.map((word, index) => [word, index]),
);
const LEARNED_SCORE_BOOST = 12;
const STATIC_SCAN_LIMIT = 40;

export function extractCurrentWord(text: string): string {
  const match = text.match(/[a-zA-Z]+$/);
  return match ? match[0] : '';
}

export function applyCaseToWord(word: string, prefix: string): string {
  if (!prefix) {
    return word;
  }
  if (prefix === prefix.toUpperCase()) {
    return word.toUpperCase();
  }
  if (prefix[0] === prefix[0].toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

function scoreCandidate(word: string, learned: ReadonlyMap<string, number>): number {
  const staticRank = STATIC_RANK.get(word) ?? 50_000;
  const learnedUses = learned.get(word) ?? 0;
  return staticRank - learnedUses * LEARNED_SCORE_BOOST;
}

export function getWordSuggestions(prefix: string, limit = 3): string[] {
  if (!prefix || prefix.length < 1) {
    return [];
  }

  const lower = prefix.toLowerCase();
  if (!/^[a-z]+$/.test(lower)) {
    return [];
  }

  const learned = getLearnedCounts();
  const candidates = new Set<string>();

  let scanned = 0;
  for (const word of WORDS) {
    if (word.length < 2 || !/^[a-z]+$/.test(word)) {
      continue;
    }
    if (word.startsWith(lower) && word !== lower) {
      candidates.add(word);
      scanned += 1;
      if (scanned >= STATIC_SCAN_LIMIT) {
        break;
      }
    }
  }

  for (const [word, count] of learned.entries()) {
    if (count > 0 && word.startsWith(lower) && word !== lower) {
      candidates.add(word);
    }
  }

  return Array.from(candidates)
    .sort((a, b) => scoreCandidate(a, learned) - scoreCandidate(b, learned))
    .slice(0, limit);
}
