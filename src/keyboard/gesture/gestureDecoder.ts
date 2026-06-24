import {
  getLearnedCounts,
  learnedSwipeBonus,
} from '../suggestions/learnedDictionary';
import {keyboardBridge} from '../keyboardBridge';
import {
  getSwipeCandidates,
  getWordsByFirstLetter,
  isValidSwipeCommit,
} from './wordDictionary';
import type {KeyBounds, Point} from './types';

const MIN_RESAMPLE_COUNT = 36;
const MAX_RESAMPLE_COUNT = 60;
const SWIPE_CANDIDATE_LIMIT = 650;

function resampleCountForPath(pointCount: number): number {
  return Math.min(
    MAX_RESAMPLE_COUNT,
    Math.max(MIN_RESAMPLE_COUNT, Math.round(pointCount * 0.55)),
  );
}

async function decodeSwipeGestureNative(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
): Promise<string | null> {
  try {
    const layoutPayload = layouts
      .filter(layout => layout.letter)
      .map(layout => ({
        letter: layout.letter,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        centerX: layout.centerX,
        centerY: layout.centerY,
      }));
    const word = await keyboardBridge.decodeSwipeGesture(
      JSON.stringify(rawPoints),
      JSON.stringify(layoutPayload),
      isUppercase,
    );
    return word && isValidSwipeCommit(word) ? word : null;
  } catch {
    return null;
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
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
      bestLetter = layout.letter ?? null;
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

function angleBetween(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const ab = Math.hypot(abx, aby);
  const cb = Math.hypot(cbx, cby);
  if (ab === 0 || cb === 0) {
    return 0;
  }
  const cosine = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (ab * cb)));
  return Math.acos(cosine);
}

function turnAmount(a: Point, b: Point, c: Point): number {
  return Math.PI - angleBetween(a, b, c);
}

function minKeySize(letterMap: Map<string, KeyBounds>): number {
  const sizes = [...letterMap.values()].map(key => Math.min(key.width, key.height));
  return sizes.length > 0 ? Math.max(24, Math.min(...sizes)) : 48;
}

function extractGestureTurningPoints(
  path: Point[],
  letterMap: Map<string, KeyBounds>,
): Point[] {
  if (path.length <= 2) {
    return [];
  }

  const minSpacing = minKeySize(letterMap) * 0.45;
  const threshold = 0.48; // ~27.5deg direction change.
  const turns: Array<{point: Point; amount: number; index: number}> = [];

  for (let i = 2; i < path.length - 2; i++) {
    const prev = path[i - 2];
    const point = path[i];
    const next = path[i + 2];
    const amount = turnAmount(prev, point, next);
    if (amount < threshold) {
      continue;
    }

    const previousTurn = turns[turns.length - 1];
    if (previousTurn && distance(previousTurn.point, point) < minSpacing) {
      if (amount > previousTurn.amount) {
        turns[turns.length - 1] = {point, amount, index: i};
      }
      continue;
    }

    turns.push({point, amount, index: i});
  }

  return turns
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index)
    .map(turn => turn.point);
}

function idealPathForWord(
  word: string,
  letterMap: Map<string, KeyBounds>,
): Point[] {
  return buildIdealPath(word, letterMap);
}

function extractIdealTurningPoints(idealPath: Point[]): Point[] {
  if (idealPath.length <= 2) {
    return [];
  }

  const threshold = 0.42; // Ideal paths are clean, so smaller turns matter.
  const turns: Point[] = [];
  for (let i = 1; i < idealPath.length - 1; i++) {
    if (turnAmount(idealPath[i - 1], idealPath[i], idealPath[i + 1]) >= threshold) {
      turns.push(idealPath[i]);
    }
  }

  // Short words often rely on every intermediate key as a landmark.
  if (turns.length === 0 && idealPath.length <= 5) {
    return idealPath.slice(1, -1);
  }

  return turns;
}

function orderedLandmarkDistance(
  gestureTurns: Point[],
  idealTurns: Point[],
  scale: number,
): number {
  if (idealTurns.length === 0) {
    return 0;
  }
  if (gestureTurns.length === 0) {
    return 0.45 + idealTurns.length * 0.08;
  }

  let total = 0;
  let searchFrom = 0;
  for (const ideal of idealTurns) {
    let bestIndex = -1;
    let best = Infinity;
    for (let i = searchFrom; i < gestureTurns.length; i++) {
      const d = distance(gestureTurns[i], ideal);
      if (d < best) {
        best = d;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      total += 0.55;
      continue;
    }
    total += best / scale;
    searchFrom = bestIndex + 1;
  }

  return total / idealTurns.length;
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

function proximityMissBudget(wordLength: number): number {
  if (wordLength <= 4) {
    return 0;
  }
  if (wordLength <= 7) {
    return 1;
  }
  return 2;
}

/** Most distinct keys should be visited; start/end stay anchored. */
function passesLetterProximityGate(
  word: string,
  swipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  pathPointCount: number,
  verticalSpan: number,
  keyboardHeight: number,
): boolean {
  let previousLetter: string | null = null;
  let distinctIndex = 0;
  let misses = 0;
  const distinctLetters = keySequence(word);
  const missBudget = proximityMissBudget(distinctLetters.length);

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
    const radius = proximityGateRadius(
      key,
      pathPointCount,
      verticalSpan,
      keyboardHeight,
    );
    const isEndpoint =
      distinctIndex === 0 || distinctIndex === distinctLetters.length - 1;
    if (best > radius * (isEndpoint ? 1.2 : 1)) {
      if (isEndpoint) {
        return false;
      }
      misses += 1;
      if (misses > missBudget) {
        return false;
      }
    }

    previousLetter = char;
    distinctIndex += 1;
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

function anchorScore(
  word: string,
  rawSwipePath: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
): number {
  if (rawSwipePath.length === 0) {
    return 0.8;
  }

  const sequence = keySequence(word);
  const firstKey = letterMap.get(sequence[0]);
  const lastKey = letterMap.get(sequence[sequence.length - 1]);
  if (!firstKey || !lastKey) {
    return 0.8;
  }

  const start = rawSwipePath[0];
  const end = rawSwipePath[rawSwipePath.length - 1];
  const startDistance = distance(start, {x: firstKey.centerX, y: firstKey.centerY}) / scale;
  const endDistance = distance(end, {x: lastKey.centerX, y: lastKey.centerY}) / scale;

  // The first and last letters are the strongest user intention signals.
  return startDistance * 0.62 + endDistance * 0.72;
}

function turningScore(
  word: string,
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
): number {
  const idealPath = idealPathForWord(word, letterMap);
  const idealTurns = extractIdealTurningPoints(idealPath);
  return orderedLandmarkDistance(gestureTurns, idealTurns, scale);
}

function lengthMismatchPenalty(
  word: string,
  pattern: string,
  idealPathLength: number,
  gesturePathLength: number,
): number | null {
  if (idealPathLength <= 0 || gesturePathLength <= 0) {
    return 0.35;
  }

  const longWordFromShortTrace = word.length > pattern.length + 4;
  if (longWordFromShortTrace && idealPathLength > gesturePathLength * 1.45) {
    return null;
  }

  const mismatch =
    Math.abs(idealPathLength - gesturePathLength) /
    Math.max(idealPathLength, gesturePathLength);
  const longWordPenalty = longWordFromShortTrace ? 0.28 : 0;
  return mismatch * 0.9 + longWordPenalty;
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

  return foreignKeys * 0.18 + Math.abs(wordKeys.length - trace.length) * 0.06;
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

  return (target - ratio) * (trace.length >= 7 ? 0.45 : 0.75);
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
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  gesturePathLength: number,
  rank: number,
  learnedUses: number,
  verticalSpan: number,
  keyboardHeight: number,
): number | null {
  const idealPath = buildIdealPath(word, letterMap);
  if (idealPath.length < 2) {
    return null;
  }
  const idealLength = pathLength(idealPath);
  const lengthPenalty = lengthMismatchPenalty(
    word,
    pattern,
    idealLength,
    gesturePathLength,
  );
  if (lengthPenalty == null) {
    return null;
  }

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
  const anchors = anchorScore(word, rawSwipePath, letterMap, scale);
  const turns = turningScore(word, gestureTurns, letterMap, scale);

  let shapeScore = proximity;
  if (idealPath.length >= 2) {
    const idealResampled = resamplePath(idealPath, swipePath.length);
    const dtw = dtwAverageDistance(swipePath, idealResampled) / scale;
    // Give the global path shape more say than the noisy crossed-key trace.
    shapeScore = proximity * 0.52 + dtw * 0.48;
  }

  return (
    shapeScore * 0.78 +
    anchors * 0.42 +
    turns * 0.34 +
    lengthPenalty +
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

async function getBroadSwipeCandidates(
  pattern: string,
  rawPoints: Point[],
  layouts: KeyBounds[],
): Promise<Array<{word: string; rank: number}>> {
  const seen = new Set<string>();
  const results: Array<{word: string; rank: number}> = [];

  const addCandidates = async (candidatePattern: string) => {
    if (!candidatePattern || !/^[a-z]/.test(candidatePattern)) {
      return;
    }
    const candidates = await getSwipeCandidates(
      candidatePattern,
      SWIPE_CANDIDATE_LIMIT,
    );
    for (const candidate of candidates) {
      if (seen.has(candidate.word)) {
        continue;
      }
      seen.add(candidate.word);
      results.push(candidate);
    }
  };

  await addCandidates(pattern);

  const startLetter = nearestTraceLetter(rawPoints[0], layouts);
  if (startLetter && startLetter !== pattern[0]) {
    await addCandidates(`${startLetter}${pattern.slice(1)}`);
  }

  return results;
}

export async function decodeSwipeGesture(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
): Promise<string | null> {
  if (rawPoints.length < 2 || layouts.length === 0) {
    return null;
  }

  const nativeWord = await decodeSwipeGestureNative(
    rawPoints,
    layouts,
    isUppercase,
  );
  if (nativeWord) {
    return nativeWord;
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
  const gestureTurns = extractGestureTurningPoints(swipePath, letterMap);
  const gesturePathLength = pathLength(rawPoints);

  if (pattern.length < 2) {
    return finalizeSwipeWord(
      decodeByPathShape(
        rawPoints,
        swipePath,
        gestureTurns,
        letterMap,
        scale,
        gesturePathLength,
        keyboardHeight,
        verticalSpan,
        isUppercase,
      ),
    );
  }

  const candidates = await getBroadSwipeCandidates(pattern, rawPoints, layouts);
  const learned = getLearnedCounts();

  let bestWord: string | null = null;
  let bestScore = Infinity;
  let bestLearnedUses = 0;
  let secondScore = Infinity;

  for (const {word, rank} of candidates) {
    const learnedUses = learned.get(word) ?? 0;
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawPoints,
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
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
      (await pickByProximityOnly(
        pattern,
        swipePath,
        rawPoints,
        gestureTurns,
        letterMap,
        scale,
        gesturePathLength,
        keyboardHeight,
        verticalSpan,
        isUppercase,
      )) ??
        decodeByPathShape(
          rawPoints,
          swipePath,
          gestureTurns,
          letterMap,
          scale,
          gesturePathLength,
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
      (await pickByProximityOnly(
        pattern,
        swipePath,
        rawPoints,
        gestureTurns,
        letterMap,
        scale,
        gesturePathLength,
        keyboardHeight,
        verticalSpan,
        isUppercase,
      )) ??
        decodeByPathShape(
          rawPoints,
          swipePath,
          gestureTurns,
          letterMap,
          scale,
          gesturePathLength,
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
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  gesturePathLength: number,
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
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
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

async function pickByProximityOnly(
  pattern: string,
  swipePath: Point[],
  rawSwipePath: Point[],
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  gesturePathLength: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
): Promise<string | null> {
  if (pattern.length < 2) {
    return null;
  }

  const candidates = await getSwipeCandidates(pattern, SWIPE_CANDIDATE_LIMIT);
  let bestWord: string | null = null;
  let bestScore = Infinity;

  for (const {word, rank} of candidates) {
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawSwipePath,
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
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
    gestureTurns,
    letterMap,
    scale,
    gesturePathLength,
    keyboardHeight,
    verticalSpan,
    isUppercase,
  );
}

function pickByFirstLetterProximity(
  pattern: string,
  swipePath: Point[],
  rawSwipePath: Point[],
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  gesturePathLength: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
): string | null {
  const first = pattern[0]?.toLowerCase();
  if (!first) {
    return null;
  }

  const candidates = getWordsByFirstLetter(first, SWIPE_CANDIDATE_LIMIT);
  let bestWord: string | null = null;
  let bestScore = Infinity;

  for (const {word, rank} of candidates) {
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      rawSwipePath,
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
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
