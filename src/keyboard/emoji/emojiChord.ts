import {isEmojiInCatalog, searchEmojis} from './gboardEmojiData';

export type EmojiChordMatch = {
  /** Normalized chord token (e.g. ":)"). */
  token: string;
  label: string;
  emojis: readonly string[];
};

const EMOJI_CHORDS: ReadonlyArray<{
  patterns: readonly string[];
  label: string;
  emojis: readonly string[];
}> = [
  {
    patterns: [':)', ':-)', '=)'],
    label: 'Smile',
    emojis: ['🙂', '😊', '😄', '☺️', '😌', '🫠'],
  },
  {
    patterns: [':D', ':-D', '=D', ':d'],
    label: 'Grin',
    emojis: ['😀', '😃', '😄', '😁', '🤩'],
  },
  {
    patterns: [':(', ':-(', '=('],
    label: 'Down',
    emojis: ['☹️', '😞', '😢', '🥺', '😔'],
  },
  {
    patterns: [":'(", ":'-(", ':,(', 'T_T'],
    label: 'Tearful',
    emojis: ['😢', '😭', '🥲', '💔'],
  },
  {
    patterns: [':/', ':-/', ':\\', ':-\\'],
    label: 'Unsure',
    emojis: ['😕', '😐', '😑', '🫤'],
  },
  {
    patterns: [';)', ';-)', ';)'],
    label: 'Wink',
    emojis: ['😉', '😜', '😏'],
  },
  {
    patterns: ['<3', '<33'],
    label: 'Heart',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖'],
  },
  {
    patterns: [':p', ':-p', ':P', ':-P', ':b'],
    label: 'Playful',
    emojis: ['😛', '😝', '😜'],
  },
  {
    patterns: [':o', ':-o', ':O', ':-O'],
    label: 'Surprised',
    emojis: ['😮', '😯', '😲', '🫨'],
  },
  {
    patterns: ['(y)', '(Y)', '+1', ':+1:'],
    label: 'Thumbs up',
    emojis: ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'],
  },
  {
    patterns: ['(n)', '(N)', '-1', ':-1:'],
    label: 'Thumbs down',
    emojis: ['👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿'],
  },
  {
    patterns: [':*', ':-*'],
    label: 'Kiss',
    emojis: ['😘', '😗', '💋', '🥰'],
  },
];

const SORTED_PATTERN_ENTRIES: ReadonlyArray<{
  pattern: string;
  label: string;
  emojis: readonly string[];
}> = EMOJI_CHORDS.flatMap(entry =>
  entry.patterns.map(pattern => ({
    pattern,
    label: entry.label,
    emojis: entry.emojis,
  })),
).sort((a, b) => b.pattern.length - a.pattern.length);

export function resolveEmojiChord(query: string): EmojiChordMatch | null {
  const trimmed = query.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  for (const entry of SORTED_PATTERN_ENTRIES) {
    if (lower === entry.pattern.toLowerCase()) {
      return {
        token: entry.pattern,
        label: entry.label,
        emojis: entry.emojis,
      };
    }
  }
  return null;
}

/** Chord matches win; otherwise fall back to keyword search. */
export function searchEmojisWithChord(
  query: string,
  limit = 180,
): {chord: EmojiChordMatch | null; emojis: string[]} {
  const chord = resolveEmojiChord(query);
  if (chord) {
    return {
      chord,
      emojis: chord.emojis.filter(isEmojiInCatalog),
    };
  }
  return {chord: null, emojis: searchEmojis(query, limit)};
}

export function isLikelyEmojiChordInput(query: string): boolean {
  const t = query.trim();
  if (!t || t.length > 8) {
    return false;
  }
  return /^[:;=<>('8oOpPbB\\\/yYnN+\-T_]+$/i.test(t);
}
