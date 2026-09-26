import {isEmojiInCatalog} from './gboardEmojiData';

/** Context emoji preface for the emoji grid (no separate UI section). */

export type SubtoneMoodId =
  | 'warm'
  | 'grateful'
  | 'playful'
  | 'sorry'
  | 'hype'
  | 'thinking'
  | 'professional';

const PREFACE_EMOJI_COUNT = 9;
const MIN_SCORE_TO_SHOW = 3;

type LexicalHint = {
  pattern: RegExp;
  emojis: readonly string[];
  weight: number;
};

/** Words/phrases in recent context → emoji (checked on last ~400 chars). */
const LEXICAL_HINTS: readonly LexicalHint[] = [
  {
    pattern: /\b(thanks|thank you|thx|appreciate|grateful|much obliged)\b/i,
    emojis: ['🙏', '🫶', '😊', '❤️', '✨'],
    weight: 6,
  },
  {
    pattern: /\b(sorry|apolog|my bad|didn't mean|forgive)\b/i,
    emojis: ['😔', '🥺', '🙏', '🫂', '💙'],
    weight: 6,
  },
  {
    pattern: /\b(love you|love this|miss you|xoxo|darling|sweetheart)\b/i,
    emojis: ['❤️', '🥰', '😘', '💕', '🫶'],
    weight: 6,
  },
  {
    pattern: /\b(congrats|congratulations|proud of you|well done|nailed it)\b/i,
    emojis: ['🎉', '👏', '🥳', '💪', '✨'],
    weight: 6,
  },
  {
    pattern: /\b(lol|lmao|haha|hehe|rofl|funny|hilarious)\b/i,
    emojis: ['😂', '🤣', '💀', '😅', '🙃'],
    weight: 5,
  },
  {
    pattern: /\b(birthday|bday|happy birthday)\b/i,
    emojis: ['🎂', '🎉', '🥳', '🎈', '🎁'],
    weight: 7,
  },
  {
    pattern: /\b(wedding|anniversary|engaged)\b/i,
    emojis: ['💍', '🥂', '🎊', '❤️', '✨'],
    weight: 6,
  },
  {
    pattern: /\b(coffee|espresso|latte|caffeine)\b/i,
    emojis: ['☕', '😴', '✨', '👍'],
    weight: 5,
  },
  {
    pattern: /\b(pizza|burger|food|lunch|dinner|breakfast|hungry|eat)\b/i,
    emojis: ['🍕', '🍔', '😋', '🍽️', '👌'],
    weight: 4,
  },
  {
    pattern: /\b(beer|drinks|wine|cheers|toast)\b/i,
    emojis: ['🍻', '🥂', '🍷', '🎉'],
    weight: 5,
  },
  {
    pattern: /\b(flight|airport|travel|vacation|holiday|trip|beach)\b/i,
    emojis: ['✈️', '🏖️', '🌴', '🧳', '😎'],
    weight: 5,
  },
  {
    pattern: /\b(meeting|deadline|project|work|office|email|sent the)\b/i,
    emojis: ['💼', '📎', '✅', '👍', '🙂'],
    weight: 4,
  },
  {
    pattern: /\b(idea|brainstorm|think|thoughts|wondering|what if)\b/i,
    emojis: ['💡', '🤔', '💭', '👀'],
    weight: 4,
  },
  {
    pattern: /\b(fire|lit|amazing|awesome|incredible|lets go|let's go)\b/i,
    emojis: ['🔥', '💯', '🚀', '👏', '🎉'],
    weight: 5,
  },
  {
    pattern: /\b(sad|upset|cry|crying|heartbroken|tough day|rough day)\b/i,
    emojis: ['😢', '🫂', '💙', '🥺', '😔'],
    weight: 5,
  },
  {
    pattern: /\b(angry|mad|furious|annoyed|ugh)\b/i,
    emojis: ['😤', '🙄', '😒', '💢'],
    weight: 5,
  },
  {
    pattern: /\b(tired|exhausted|sleepy|good night|goodnight|gn)\b/i,
    emojis: ['😴', '🌙', '💤', '🫶'],
    weight: 5,
  },
  {
    pattern: /\b(good morning|morning|gm)\b/i,
    emojis: ['☀️', '🌅', '☕', '🙂'],
    weight: 5,
  },
  {
    pattern: /\b(music|concert|song|playlist)\b/i,
    emojis: ['🎵', '🎶', '🎧', '🎤'],
    weight: 4,
  },
  {
    pattern: /\b(game|gaming|played|match|won|lost)\b/i,
    emojis: ['🎮', '🏆', '👾', '🔥'],
    weight: 4,
  },
  {
    pattern: /\b(please|would you|could you|kindly)\b/i,
    emojis: ['🙏', '🙂', '👍', '✨'],
    weight: 3,
  },
  {
    pattern: /\b(introduce|launch|release|shipped|live now)\b/i,
    emojis: ['🚀', '✨', '🎉', '👏', '🔥'],
    weight: 4,
  },
  {
    pattern: /\b(weather|rain|snow|cold|hot outside)\b/i,
    emojis: ['🌧️', '❄️', '🌡️', '☀️'],
    weight: 4,
  },
  {
    pattern: /\b(dog|puppy|cat|kitten|pet)\b/i,
    emojis: ['🐶', '🐱', '🐾', '🥰'],
    weight: 4,
  },
  {
    pattern: /\b(money|paid|invoice|price|\$\d)/i,
    emojis: ['💰', '💸', '🤑', '👍'],
    weight: 3,
  },
  {
    pattern: /\b(yes|yeah|yep|sure|sounds good|works for me|perfect|great)\b/i,
    emojis: ['👍', '🙂', '✅', '🙌', '💯'],
    weight: 3,
  },
  {
    pattern: /\b(no|nope|can't|cannot|won't|never mind)\b/i,
    emojis: ['👎', '🙂', '🙏', '😅'],
    weight: 3,
  },
];

function scoreEmojisFromContext(tail: string): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (emoji: string, points: number) => {
    scores.set(emoji, (scores.get(emoji) ?? 0) + points);
  };

  for (const hint of LEXICAL_HINTS) {
    if (!hint.pattern.test(tail)) {
      continue;
    }
    for (const emoji of hint.emojis) {
      add(emoji, hint.weight);
    }
  }

  const lastChunk = tail.slice(-120);
  if (/\?/.test(lastChunk)) {
    for (const emoji of ['🤔', '👀', '🙂', '🙏']) {
      add(emoji, 2);
    }
  }
  if (/!{1,}/.test(lastChunk)) {
    for (const emoji of ['😄', '✨', '🎉', '👍']) {
      add(emoji, 1);
    }
  }

  return scores;
}

/** Leading emojis for the main grid — none when the field is empty or nothing matches. */
export function getContextPrefaceEmojis(context: string): readonly string[] {
  const tail = context.slice(-400).trim();
  if (tail.length === 0) {
    return [];
  }

  const scores = scoreEmojisFromContext(tail);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || (ranked[0]?.[1] ?? 0) < MIN_SCORE_TO_SHOW) {
    return [];
  }

  const picked: string[] = [];
  for (const [emoji, score] of ranked) {
    if (score < MIN_SCORE_TO_SHOW) {
      break;
    }
    if (!picked.includes(emoji) && isEmojiInCatalog(emoji)) {
      picked.push(emoji);
    }
    if (picked.length >= PREFACE_EMOJI_COUNT) {
      break;
    }
  }
  return picked;
}

/** @deprecated kept for tests/tools — use getContextPrefaceEmojis in UI. */
export function analyzeSubtone(context: string): {
  id: SubtoneMoodId;
  label: string;
  emojis: readonly string[];
} {
  const emojis = getContextPrefaceEmojis(context);
  return {
    id: 'professional',
    label: 'Context',
    emojis: emojis.length > 0 ? emojis : ['🙂', '👍'],
  };
}
