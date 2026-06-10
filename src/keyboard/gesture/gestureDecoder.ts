import {
  getLearnedCounts,
  learnedSwipeBonus,
} from '../suggestions/learnedDictionary';
import {
  getSwipeCandidates,
  getWordsByFirstLetter,
  isValidSwipeCommit,
  traceEditBudget,
  wordMatchesTrace,
} from './wordDictionary';
import type {KeyBounds, Point} from './types';

const MIN_RESAMPLE_COUNT = 48;
const MAX_RESAMPLE_COUNT = 80;

function resampleCountForPath(pointCount: number): number {
  return Math.min(
    MAX_RESAMPLE_COUNT,
    Math.max(MIN_RESAMPLE_COUNT, Math.round(pointCount * 0.55)),
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resamplePath(points: Point[], count: number): Point[] {
  if (points.length === 0) {
    return [];
  }
  if (points.length === 1) {
    return Array.from({length: count}, () => ({...points[0]}));
  }

  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  }

  const total = cumulative[cumulative.length - 1];
  if (total === 0) {
    return Array.from({length: count}, () => ({...points[0]}));
  }

  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / Math.max(count - 1, 1);
    let segment = cumulative.findIndex(length => length >= target);
    if (segment <= 0) {
      result.push({...points[0]});
      continue;
    }

    const startLength = cumulative[segment - 1];
    const segmentLength = cumulative[segment] - startLength;
    const t =
      segmentLength === 0 ? 0 : (target - startLength) / segmentLength;
    const from = points[segment - 1];
    const to = points[segment];
    result.push({
      x: from.x + t * (to.x - from.x),
      y: from.y + t * (to.y - from.y),
    });
  }

  return result;
}

function keyboardScale(layouts: KeyBounds[]): number {
  let maxX = 0;
  let maxY = 0;
  for (const layout of layouts) {
    maxX = Math.max(maxX, layout.x + layout.width);
    maxY = Math.max(maxY, layout.y + layout.height);
  }
  return Math.max(Math.hypot(maxX, maxY) * 0.35, 48);
}

function buildLetterMap(layouts: KeyBounds[]): Map<string, KeyBounds> {
  const letterMap = new Map<string, KeyBounds>();
  for (const layout of layouts) {
    if (layout.letter) {
      letterMap.set(layout.letter, layout);
    }
  }
  return letterMap;
}

export function hitTestKey(
  point: Point,
  layouts: KeyBounds[],
): KeyBounds | null {
  let match: KeyBounds | null = null;
  let smallestArea = Infinity;

  for (const layout of layouts) {
    const inside =
      point.x >= layout.x &&
      point.x <= layout.x + layout.width &&
      point.y >= layout.y &&
      point.y <= layout.y + layout.height;

    if (!inside) {
      continue;
    }

    const area = layout.width * layout.height;
    if (area < smallestArea) {
      smallestArea = area;
      match = layout;
    }
  }

  return match;
}

function letterLayouts(layouts: KeyBounds[]): KeyBounds[] {
  return layouts.filter(layout => layout.letter);
}

function letterAtPoint(
  point: Point,
  layouts: KeyBounds[],
  slopScale = 0.48,
): string | null {
  const directHit = hitTestKey(point, layouts);
  if (directHit?.letter) {
    return directHit.letter;
  }

  let bestLetter: string | null = null;
  let bestDistance = Infinity;

  for (const layout of letterLayouts(layouts)) {
    const dx = Math.max(
      layout.x - point.x,
      0,
      point.x - (layout.x + layout.width),
    );
    const dy = Math.max(
      layout.y - point.y,
      0,
      point.y - (layout.y + layout.height),
    );
    const dist = Math.hypot(dx, dy);
    const slop = Math.max(layout.width, layout.height) * slopScale;

    if (dist <= slop && dist < bestDistance) {
      bestDistance = dist;
      bestLetter = layout.letter;
    }
  }

  return bestLetter;
}

/** Looser nearest-key lookup for building swipe traces across row gaps. */
function nearestTraceLetter(point: Point, layouts: KeyBounds[]): string | null {
  const hit = letterAtPoint(point, layouts, 0.62);
  if (hit) {
    return hit;
  }

  let bestLetter: string | null = null;
  let bestDistance = Infinity;

  for (const layout of letterLayouts(layouts)) {
    const dist = distance(point, {x: layout.centerX, y: layout.centerY});
    if (dist < bestDistance) {
      bestDistance = dist;
      bestLetter = layout.letter ?? null;
    }
  }

  const letters = letterLayouts(layouts);
  const keySize =
    letters.length > 0
      ? Math.max(
          ...letters.map(layout => Math.max(layout.width, layout.height)),
        )
      : 48;

  return bestDistance <= keySize * 0.66 ? bestLetter : null;
}

function directHitLetter(point: Point, layouts: KeyBounds[]): string | null {
  const hit = hitTestKey(point, layouts);
  if (hit?.letter) {
    return hit.letter;
  }

  const pad = 6;
  let match: KeyBounds | null = null;
  let smallestArea = Infinity;

  for (const layout of letterLayouts(layouts)) {
    const inside =
      point.x >= layout.x - pad &&
      point.x <= layout.x + layout.width + pad &&
      point.y >= layout.y - pad &&
      point.y <= layout.y + layout.height + pad;

    if (!inside) {
      continue;
    }

    const area = layout.width * layout.height;
    if (area < smallestArea) {
      smallestArea = area;
      match = layout;
    }
  }

  return match?.letter ?? null;
}

/** Only count keys the finger actually crosses (inside key bounds). */
function tracePatternByCrossing(points: Point[], layouts: KeyBounds[]): string {
  const keys: string[] = [];
  let last: string | null = null;

  for (const point of points) {
    const letter = directHitLetter(point, layouts);
    if (letter && letter !== last) {
      keys.push(letter);
      last = letter;
    }
  }

  return keys.join('');
}

function buildTracePattern(
  rawPoints: Point[],
  swipePath: Point[],
  layouts: KeyBounds[],
): string {
  const fromRaw = tracePatternByCrossing(rawPoints, layouts);
  const fromSwipe = tracePatternByCrossing(swipePath, layouts);

  if (fromRaw.length >= 2 && fromSwipe.length >= 2) {
    return fromRaw.length <= fromSwipe.length ? fromRaw : fromSwipe;
  }

  return fromRaw.length >= 2 ? fromRaw : fromSwipe;
}

function finalizeSwipeWord(word: string | null): string | null {
  if (!word || !isValidSwipeCommit(word)) {
    return null;
  }
  return word;
}

function pathVerticalSpan(path: Point[]): number {
  if (path.length === 0) {
    return 0;
  }
  let minY = path[0].y;
  let maxY = path[0].y;
  for (const point of path) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return maxY - minY;
}

function nearestPathDistance(point: Point, swipePath: Point[]): number {
  let best = Infinity;
  for (const pathPoint of swipePath) {
    const d = distance(pathPoint, point);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

function keySequence(word: string): string {
  let previous = '';
  let sequence = '';
  for (const char of word) {
    if (char !== previous) {
      sequence += char;
      previous = char;
    }
  }
  return sequence;
}

function proximityGateRadius(
  key: KeyBounds,
  pathPointCount: number,
  verticalSpan: number,
  keyboardHeight: number,
): number {
  const base = Math.max(key.width, key.height) * 0.72;
  const stretch = Math.min(0.22, pathPointCount * 0.0035);
  const verticalBoost =
    keyboardHeight > 0 && verticalSpan > keyboardHeight * 0.42 ? 0.2 : 0;
  return base * (1 + stretch + verticalBoost);
}

/** Every distinct key in the word must be visited by the swipe path. */
function passesLetterProximityGate(
  word: string,
  swipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  pathPointCount: number,
  verticalSpan: number,
  keyboardHeight: number,
): boolean {
  let previousLetter: string | null = null;

  for (const char of word) {
    if (char === previousLetter) {
      continue;
    }
    const key = letterMap.get(char);
    if (!key) {
      return false;
    }

    const best = nearestPathDistance(
      {x: key.centerX, y: key.centerY},
      swipePath,
    );
    if (
      best >
      proximityGateRadius(
        key,
        pathPointCount,
        verticalSpan,
        keyboardHeight,
      )
    ) {
      return false;
    }

    previousLetter = char;
  }

  return true;
}

/** Gboard-style: each letter in the word should pass near its key on the swipe path. */
function proximityScore(
  word: string,
  swipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
): number {
  let total = 0;
  let hits = 0;
  let previousLetter: string | null = null;

  for (const char of word) {
    if (char === previousLetter) {
      continue;
    }
    const key = letterMap.get(char);
    if (!key) {
      return Infinity;
    }

    const best = nearestPathDistance(
      {x: key.centerX, y: key.centerY},
      swipePath,
    );
    const keyRadius = Math.max(key.width, key.height) * 0.55;
    total += Math.max(0, best - keyRadius * 0.15);
    hits += 1;
    previousLetter = char;
  }

  return hits > 0 ? total / hits / scale : Infinity;
}

function dtwAverageDistance(pathA: Point[], pathB: Point[]): number {
  const n = pathA.length;
  const m = pathB.length;
  if (!n || !m) {
    return Infinity;
  }

  const dp = Array.from({length: n + 1}, () =>
    Array.from({length: m + 1}, () => Infinity),
  );
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = distance(pathA[i - 1], pathB[j - 1]);
      dp[i][j] =
        cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[n][m] / (n + m);
}

function buildIdealPath(
  word: string,
  letterMap: Map<string, KeyBounds>,
): Point[] {
  const points: Point[] = [];
  let previousLetter: string | null = null;

  for (const letter of word) {
    if (letter === previousLetter) {
      continue;
    }
    const key = letterMap.get(letter);
    if (key) {
      points.push({x: key.centerX, y: key.centerY});
    }
    previousLetter = letter;
  }

  return points;
}

/** How much of the traced key path the candidate explains (0–1). */
function traceConsumptionRatio(word: string, trace: string): number {
  let wordIndex = 0;
  let lastTraceIndex = -1;

  for (let traceIndex = 0; traceIndex < trace.length; traceIndex++) {
    if (wordIndex >= word.length) {
      break;
    }
    if (trace[traceIndex] !== word[wordIndex]) {
      continue;
    }
    lastTraceIndex = traceIndex;
    wordIndex += 1;
    while (
      wordIndex < word.length &&
      word[wordIndex] === word[wordIndex - 1] &&
      trace[traceIndex] === word[wordIndex - 1]
    ) {
      wordIndex += 1;
    }
  }

  if (wordIndex < word.length) {
    return 0;
  }

  return trace.length > 0 ? (lastTraceIndex + 1) / trace.length : 0;
}

function traceTailPenalty(word: string, trace: string): number {
  const traceLast = trace[trace.length - 1];
  const wordLast = word[word.length - 1];
  if (traceLast === wordLast) {
    return 0;
  }

  return trace.length >= 3 ? 0.35 : 0.2;
}

function keySequencePenalty(word: string, trace: string): number {
  const wordKeys = keySequence(word);
  if (wordKeys === trace) {
    return -0.35;
  }

  const traceLetters = new Set(trace.split(''));
  let foreignKeys = 0;
  for (const char of wordKeys) {
    if (!traceLetters.has(char)) {
      foreignKeys += 1;
    }
  }

  return foreignKeys * 0.4 + Math.abs(wordKeys.length - trace.length) * 0.1;
}

function shortWordPenalty(word: string, trace: string): number {
  if (trace.length < 4 || word.length >= trace.length) {
    return 0;
  }

  const gap = trace.length - word.length;
  return gap * 0.11;
}

function consumptionPenalty(word: string, trace: string): number {
  if (trace.length < 4) {
    return 0;
  }

  const ratio = traceConsumptionRatio(word, trace);
  const target = trace.length >= 7 ? 0.62 : trace.length >= 5 ? 0.7 : 0.78;
  if (ratio >= target) {
    return 0;
  }

  return (target - ratio) * (trace.length >= 7 ? 0.9 : 1.35);
}

function formatWord(word: string, isUppercase: boolean): string {
  if (!isUppercase) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function rankBonus(rank: number, wordLength: number, traceLength: number): number {
  const base = Math.log10(rank + 10) * 0.045;
  if (wordLength < traceLength - 1) {
    return base * 0.2;
  }
  return base;
}

function scoreCandidate(
  word: string,
  pattern: string,
  swipePath: Point[],
  rawSwipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  rank: number,
  learnedUses: number,
  verticalSpan: number,
  keyboardHeight: number,
): number | null {
  if (
    !passesLetterProximityGate(
      word,
      rawSwipePath,
      letterMap,
      rawSwipePath.length,
      verticalSpan,
      keyboardHeight,
    )
  ) {
    return null;
  }

  const proximity = proximityScore(word, swipePath, letterMap, scale);
  if (!Number.isFinite(proximity)) {
    return null;
  }

  const idealPath = buildIdealPath(word, letterMap);
  let shapeScore = proximity;
  if (idealPath.length >= 2) {
    const idealResampled = resamplePath(idealPath, swipePath.length);
    const dtw = dtwAverageDistance(swipePath, idealResampled) / scale;
    shapeScore = proximity * 0.68 + dtw * 0.32;
  }

  return (
    shapeScore +
    shortWordPenalty(word, pattern) +
    consumptionPenalty(word, pattern) +
    traceTailPenalty(word, pattern) +
    keySequencePenalty(word, pattern) +
    Math.abs(word.length - pattern.length) * 0.035 +
    rankBonus(rank, word.length, pattern.length) -
    learnedSwipeBonus(learnedUses)
  );
}

function shouldPreferCandidate(
  score: number,
  learnedUses: number,
  bestScore: number,
  bestLearnedUses: number,
): boolean {
  if (score < bestScore - 0.001) {
    return true;
  }

  return (
    Math.abs(score - bestScore) <= 0.07 && learnedUses > bestLearnedUses
  );
}

export function decodeSwipeGesture(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
): string | null {
  if (rawPoints.length < 2 || layouts.length === 0) {
    return null;
  }

  const scale = keyboardScale(layouts);
  const resampleCount = resampleCountForPath(rawPoints.length);
  const swipePath = resamplePath(rawPoints, resampleCount);
  const letterMap = buildLetterMap(layouts);
  const keyboardHeight = layouts.reduce(
    (maxY, layout) => Math.max(maxY, layout.y + layout.height),
    0,
  );
  const verticalSpan = pathVerticalSpan(rawPoints);
  const pattern = buildTracePattern(rawPoints, swipePath, layouts);

  if (pattern.length < 2) {
    return finalizeSwipeWord(
      decodeByPathShape(
      rawPoints,
      swipePath,
      letterMap,
      scale,
      keyboardHeight,
      verticalSpan,
      isUppercase,
      ),
    );
  }

  const candidates = getSwipeCandidates(pattern);
  const learned = getLearnedCounts();
  const maxEdits = traceEditBudget(pattern);

  let bestWord: string | null = null;
  let bestScore = Infinity;
  let bestLearnedUses = 0;
  let secondScore = Infinity;

  for (const {word, rank} of candidates) {
    if (!wordMatchesTrace(word, pattern, maxEdits)) {
      continue;
    }

    const learnedUses = learned.get(word) ?? 0;
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawPoints,
      letterMap,
      scale,
      rank,
      learnedUses,
      verticalSpan,
      keyboardHeight,
    );
    if (score == null) {
      continue;
    }

    if (shouldPreferCandidate(score, learnedUses, bestScore, bestLearnedUses)) {
      secondScore = bestScore;
      bestScore = score;
      bestWord = word;
      bestLearnedUses = learnedUses;
    } else if (score < secondScore) {
      secondScore = score;
    }
  }

  if (!bestWord) {
    return finalizeSwipeWord(
      pickByProximityOnly(
        pattern,
        swipePath,
        rawPoints,
        letterMap,
        scale,
        keyboardHeight,
        verticalSpan,
        isUppercase,
      ) ??
        decodeByPathShape(
          rawPoints,
          swipePath,
          letterMap,
          scale,
          keyboardHeight,
          verticalSpan,
          isUppercase,
        ),
    );
  }

  const margin =
    secondScore === Infinity ? 1 : Math.max(0, secondScore - bestScore);
  const rejectThreshold = pattern.length >= 7 ? 1.85 : 1.6;
  if (
    bestScore > rejectThreshold ||
    (bestScore > 1.12 && margin < 0.008 && pattern.length < 7)
  ) {
    return finalizeSwipeWord(
      pickByProximityOnly(
        pattern,
        swipePath,
        rawPoints,
        letterMap,
        scale,
        keyboardHeight,
        verticalSpan,
        isUppercase,
      ) ??
        decodeByPathShape(
          rawPoints,
          swipePath,
          letterMap,
          scale,
          keyboardHeight,
          verticalSpan,
          isUppercase,
        ) ??
        formatWord(bestWord, isUppercase),
    );
  }

  return finalizeSwipeWord(formatWord(bestWord, isUppercase));
}

function decodeByPathShape(
  rawPoints: Point[],
  swipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
): string | null {
  const startLetter = nearestTraceLetter(rawPoints[0], [...letterMap.values()]);
  if (!startLetter) {
    return null;
  }

  const layouts = [...letterMap.values()];
  const fallbackPattern = buildTracePattern(rawPoints, swipePath, layouts);
  const candidates = getWordsByFirstLetter(startLetter, 500);
  let bestWord: string | null = null;
  let bestScore = Infinity;

  for (const {word, rank} of candidates) {
    const score = scoreCandidate(
      word,
      fallbackPattern.length >= 2 ? fallbackPattern : keySequence(word),
      swipePath,
      rawPoints,
      letterMap,
      scale,
      rank,
      0,
      verticalSpan,
      keyboardHeight,
    );
    if (score == null || score > 1.9) {
      continue;
    }
    if (score < bestScore) {
      bestScore = score;
      bestWord = word;
    }
  }

  return bestWord ? formatWord(bestWord, isUppercase) : null;
}

function pickByProximityOnly(
  pattern: string,
  swipePath: Point[],
  rawSwipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
): string | null {
  if (pattern.length < 2) {
    return null;
  }

  const candidates = getSwipeCandidates(pattern);
  let bestWord: string | null = null;
  let bestScore = Infinity;

  for (const {word, rank} of candidates) {
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawSwipePath,
      letterMap,
      scale,
      rank,
      0,
      verticalSpan,
      keyboardHeight,
    );
    if (score == null || score > 1.55) {
      continue;
    }
    if (score < bestScore) {
      bestScore = score;
      bestWord = word;
    }
  }

  if (bestWord) {
    return formatWord(bestWord, isUppercase);
  }

  return pickByFirstLetterProximity(
    pattern,
    swipePath,
    rawSwipePath,
    letterMap,
    scale,
    keyboardHeight,
    verticalSpan,
    isUppercase,
  );
}

function pickByFirstLetterProximity(
  pattern: string,
  swipePath: Point[],
  rawSwipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
): string | null {
  const first = pattern[0]?.toLowerCase();
  if (!first) {
    return null;
  }

  const candidates = getWordsByFirstLetter(first);
  let bestWord: string | null = null;
  let bestScore = Infinity;

  for (const {word, rank} of candidates) {
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawSwipePath,
      letterMap,
      scale,
      rank,
      0,
      verticalSpan,
      keyboardHeight,
    );
    if (score == null || score > 1.75) {
      continue;
    }
    if (score < bestScore) {
      bestScore = score;
      bestWord = word;
    }
  }

  return bestWord ? formatWord(bestWord, isUppercase) : null;
}
