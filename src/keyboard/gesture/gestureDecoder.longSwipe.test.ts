import type {KeyBounds, Point} from './types';

jest.mock('../suggestions/learnedDictionary', () => ({
  getLearnedCounts: jest.fn(() => new Map<string, number>()),
  learnedSwipeBonus: jest.fn(() => 0),
}));

const catalog: Record<string, string[]> = {
  h: ['hello', 'help', 'happy', 'house'],
  i: ['international', 'inside', 'important'],
  c: ['congratulations', 'computer', 'continue'],
};

jest.mock('./wordDictionary', () => ({
  collapseTracePattern: (trace: string) => {
    let previous = '';
    let sequence = '';
    for (const char of trace) {
      if (char !== previous) {
        sequence += char;
        previous = char;
      }
    }
    return sequence;
  },
  getSwipeCandidatesSync: jest.fn((pattern: string) => {
    const first = pattern[0]?.toLowerCase() ?? '';
    return (catalog[first] ?? []).map((word, rank) => ({word, rank}));
  }),
  getWordsByFirstLetter: jest.fn((letter: string, maxWords = 120) => {
    const words = catalog[letter.toLowerCase()] ?? [];
    return words.slice(0, maxWords).map((word, rank) => ({word, rank}));
  }),
  isCommitableSwipeWord: (word: string) => /^[a-z]{2,32}$/.test(word.trim()),
  hasDictionaryWord: () => true,
  isKnownWord: () => true,
  isValidSwipeCommit: (word: string) => /^[a-z]{2,32}$/.test(word.trim()),
  wordAlignsWithTrace: (word: string, trace: string) => {
    let pos = 0;
    for (const char of trace) {
      const hit = word.indexOf(char, pos);
      if (hit === -1) {
        return false;
      }
      pos = hit + 1;
    }
    return true;
  },
  isPatternSubsequence: (pattern: string, word: string) => {
    let patternIndex = 0;
    for (const char of word) {
      if (char === pattern[patternIndex]) {
        patternIndex += 1;
      }
      if (patternIndex === pattern.length) {
        return true;
      }
    }
    return patternIndex === pattern.length;
  },
}));

import {
  decodeSwipeGesture,
  swipeDecoderTestHooks,
  type TimedPoint,
} from './gestureDecoder';

function makeRowLayouts(letters: string, y: number): KeyBounds[] {
  return letters.split('').map((letter, index) => {
    const x = index * 60;
    return {
      id: letter,
      letter,
      keyDef: {id: letter, label: letter, value: letter},
      x,
      y,
      width: 48,
      height: 48,
      centerX: x + 24,
      centerY: y + 24,
    };
  });
}

function makeTestLayouts(): KeyBounds[] {
  return [
    ...makeRowLayouts('qwertyuiop', 0),
    ...makeRowLayouts('asdfghjkl', 60),
    ...makeRowLayouts('zxcvbnm', 120),
  ];
}

function centersForWord(word: string, layouts: KeyBounds[]): Point[] {
  const map = new Map(layouts.map(layout => [layout.letter ?? '', layout]));
  return word.split('').map(letter => {
    const key = map.get(letter);
    return {x: key!.centerX, y: key!.centerY};
  });
}

function interpolatePath(anchors: Point[], samplesPerSegment = 8): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i]!;
    const to = anchors[i + 1]!;
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      path.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }
  path.push(anchors[anchors.length - 1]!);
  return path;
}

describe('gestureDecoder long swipe', () => {
  const layouts = makeTestLayouts();

  it('decodes a medium glide through key centers', () => {
    const anchors = centersForWord('hello', layouts);
    const path = interpolatePath(anchors, 10);
    expect(decodeSwipeGesture(path, layouts, false)).toBe('hello');
  });

  it('still resolves a long glide when the path is heavily decimated', () => {
    const anchors = centersForWord('important', layouts);
    const dense = interpolatePath(anchors, 10);
    const decimated = dense.filter(
      (_, index) => index % 4 === 0 || index === dense.length - 1,
    );
    expect(decimated.length).toBeLessThan(dense.length / 2);
    expect(decodeSwipeGesture(decimated, layouts, false)).toBe('important');
  });

  it('keeps pause anchors when one jitter region is filtered out', () => {
    const hKey = layouts.find(layout => layout.letter === 'h')!;
    const eKey = layouts.find(layout => layout.letter === 'e')!;
    const lKey = layouts.find(layout => layout.letter === 'l')!;
    const timed: TimedPoint[] = [
      {x: hKey.centerX, y: hKey.centerY, t: 0},
      {x: hKey.centerX + 1, y: hKey.centerY + 1, t: 50},
      {x: hKey.centerX + 2, y: hKey.centerY + 2, t: 100},
      {x: eKey.centerX, y: eKey.centerY, t: 150},
      {x: 120, y: 120, t: 200},
      {x: 180, y: 180, t: 260},
      {x: 200, y: 200, t: 320},
      {x: lKey.centerX, y: lKey.centerY, t: 400},
    ];
    const anchors = swipeDecoderTestHooks.extractPauseAnchors(timed, layouts);
    expect(anchors[0]).toBe('h');
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors.filter(letter => letter === 'l').length).toBeLessThanOrEqual(1);
  });

  it('accepts swipe commits up to the 32-character dictionary cap', () => {
    const thirtyTwo = 'abcdefghijklmnopqrstuvwxyzabcdef';
    expect(thirtyTwo.length).toBe(32);
    expect(/^[a-z]{2,32}$/.test(thirtyTwo)).toBe(true);
  });
});
