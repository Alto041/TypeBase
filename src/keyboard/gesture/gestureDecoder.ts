import {
  getLearnedCounts,
  learnedSwipeBonus,
} from '../suggestions/learnedDictionary';
import {
  collapseTracePattern,
  getSwipeCandidatesSync,
  getWordsByFirstLetter,
  isCommitableSwipeWord,
  isKnownWord,
  isPatternSubsequence,
  isValidSwipeCommit,
  wordAlignsWithTrace,
} from './wordDictionary';
import type {KeyBounds, Point, TrailPoint} from './types';

export type TimedPoint = Point & { t: number };

const MIN_RESAMPLE_COUNT = 28;
const MAX_RESAMPLE_COUNT = 48;
const SWIPE_CANDIDATE_LIMIT = 120;
const SWIPE_SCORE_LIMIT = 200;
const SWIPE_PREVIEW_SCORE_LIMIT = 32;
const SWIPE_PREVIEW_CANDIDATE_LIMIT = 48;
const SWIPE_LENGTH_BAND_SEED_LIMIT = 80;

function resampleCountForPath(pointCount: number): number {
  return Math.min(
    MAX_RESAMPLE_COUNT,
    Math.max(MIN_RESAMPLE_COUNT, Math.round(pointCount * 0.55)),
  );
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
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / Math.max(count - 1, 1);
    while (segment < cumulative.length && cumulative[segment] < target) {
      segment += 1;
    }
    if (segment <= 0) {
      result.push({...points[0]});
      continue;
    }
    if (segment >= cumulative.length) {
      result.push({...points[points.length - 1]});
      continue;
    }

    const startLength = cumulative[segment - 1];
    const segmentLength = cumulative[segment] - startLength;
    const t =
      segmentLength === 0 ? 0 : (target - startLength) / segmentLength;
    const from = points[segment - 1];
    const to = points[segment];
    if (!from || !to) {
      continue;
    }
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

/**
 * Detects "pause" locations in a timed gesture (Gboard-like).
 * Returns an ordered list of letters that the user likely intended as anchors
 * by slowing down or pausing the finger (start + pause points + end).
 */
function extractPauseAnchors(
  timed: TimedPoint[],
  layouts: KeyBounds[],
  opts: { minPauseMs?: number; speedRatio?: number } = {},
): string[] {
  if (timed.length < 3) {
    return [];
  }

  const minPauseMs = opts.minPauseMs ?? 65;
  const speedRatio = opts.speedRatio ?? 0.35;

  // Compute local speeds (distance per ms)
  const speeds: number[] = [];
  for (let i = 0; i < timed.length - 1; i++) {
    const dt = Math.max(1, timed[i + 1].t - timed[i].t);
    const ds = distance(timed[i], timed[i + 1]);
    speeds.push(ds / dt);
  }

  if (speeds.length === 0) {
    return [];
  }

  // Robust low-speed threshold based on the distribution
  const sortedSpeeds = [...speeds].sort((a, b) => a - b);
  const median = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)] || 0.4;
  const pauseThreshold = median * speedRatio;

  const anchors: string[] = [];

  // Always anchor the start letter
  const startLetter = nearestTraceLetter(timed[0], layouts);
  if (startLetter) {
    anchors.push(startLetter);
  }

  let i = 0;
  while (i < speeds.length) {
    if (speeds[i] > pauseThreshold) {
      i += 1;
      continue;
    }

    // Entered a slow region
    const regionStart = i;
    let j = i;
    // Grow the region while speed stays relatively low
    while (j < speeds.length && speeds[j] <= pauseThreshold * 1.7) {
      j += 1;
    }
    const regionEnd = j;

    const durationMs = timed[regionEnd]?.t - timed[regionStart]?.t;
    if (durationMs >= minPauseMs) {
      // Pick a representative point in the middle of the dwell
      const mid = Math.floor((regionStart + regionEnd) / 2);
      const letter = nearestTraceLetter(timed[mid] ?? timed[regionStart], layouts);
      if (letter && anchors[anchors.length - 1] !== letter) {
        anchors.push(letter);
      }
    }

    i = regionEnd + 1;
  }

  // Always anchor the final lift position (unless duplicate)
  const endLetter = nearestTraceLetter(timed[timed.length - 1], layouts);
  if (endLetter && anchors[anchors.length - 1] !== endLetter) {
    anchors.push(endLetter);
  }

  // Deduplicate consecutive identical anchors (in case of micro-jitter)
  const deduped: string[] = [];
  for (const a of anchors) {
    if (deduped[deduped.length - 1] !== a) {
      deduped.push(a);
    }
  }
  return deduped;
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
  if (wordLength <= 10) {
    return 3;
  }
  if (wordLength <= 14) {
    return 4;
  }
  return 5;
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
  hasPauseAnchors = false,
): number | null {
  if (idealPathLength <= 0 || gesturePathLength <= 0) {
    return 0.35;
  }

  // Soft penalty only — long words are often shortcut-swiped.
  const gapAllowance = hasPauseAnchors
    ? 6
    : word.length >= 12
      ? 6
      : word.length >= 8
        ? 5
        : 4;
  const lengthRatio = hasPauseAnchors
    ? 1.7
    : word.length >= 12
      ? 1.65
      : word.length >= 8
        ? 1.5
        : 1.45;
  const longWordFromShortTrace = word.length > pattern.length + gapAllowance;
  const severelyShort =
    longWordFromShortTrace && idealPathLength > gesturePathLength * lengthRatio;

  const mismatch =
    Math.abs(idealPathLength - gesturePathLength) /
    Math.max(idealPathLength, gesturePathLength);
  const longWordPenalty = severelyShort
    ? 0.5
    : longWordFromShortTrace
      ? 0.22
      : 0;
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
  const collapsed = collapseTracePattern(trace);
  if (wordKeys === collapsed && isKnownWord(word)) {
    return -0.9;
  }

  if (isPatternSubsequence(wordKeys, collapsed)) {
    return -0.4;
  }

  const traceLetters = new Set(collapsed.split(''));
  let foreignKeys = 0;
  for (const char of wordKeys) {
    if (!traceLetters.has(char)) {
      foreignKeys += 1;
    }
  }

  return foreignKeys * 0.35 + Math.abs(wordKeys.length - collapsed.length) * 0.14;
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
  pauseAnchors: string[] = [],
  fastPreview = false,
): number | null {
  if (!isCommitableSwipeWord(word)) {
    return null;
  }
  const hasPauseAnchors = pauseAnchors.length >= 2;
  const relaxedTraceMatch =
    pattern.length >= 6 &&
    word.length >= pattern.length - 2 &&
    word.length <= pattern.length + 3;
  if (
    !fastPreview &&
    !hasPauseAnchors &&
    !relaxedTraceMatch &&
    !wordAlignsWithTrace(word, pattern)
  ) {
    return null;
  }

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
    hasPauseAnchors,
  );
  if (lengthPenalty == null) {
    return null;
  }

  if (
    !fastPreview &&
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
  const turns = fastPreview ? 0 : turningScore(word, gestureTurns, letterMap, scale);

  let shapeScore = proximity;
  if (!fastPreview && idealPath.length >= 2) {
    const idealResampled = resamplePath(idealPath, swipePath.length);
    const dtw = dtwAverageDistance(swipePath, idealResampled) / scale;
    shapeScore = proximity * 0.52 + dtw * 0.48;
  }

  let score =
    shapeScore * (fastPreview ? 0.9 : 0.78) +
    anchors * 0.42 +
    turns * (fastPreview ? 0 : 0.34) +
    lengthPenalty +
    (fastPreview ? 0 : shortWordPenalty(word, pattern)) +
    (fastPreview ? 0 : consumptionPenalty(word, pattern)) +
    (fastPreview ? 0 : traceTailPenalty(word, pattern)) +
    (fastPreview ? 0 : keySequencePenalty(word, pattern)) +
    Math.abs(word.length - pattern.length) *
      (word.length >= 10 ? 0.022 : 0.035) +
    rankBonus(rank, word.length, pattern.length) -
    learnedSwipeBonus(learnedUses);

  // Gboard-style pause anchors: if the user deliberately paused on certain letters,
  // the candidate must explain them in order. Missing anchors are heavily penalized.
  if (pauseAnchors.length > 2) {
    const internal = pauseAnchors.slice(1, -1); // ignore start + end (already anchored elsewhere)
    if (internal.length > 0) {
      let pos = 0;
      let misses = 0;
      for (const anchor of internal) {
        const hit = word.indexOf(anchor, pos);
        if (hit === -1) {
          // Strong rejection signal — user explicitly paused here.
          score += 3.2;
          misses += 1;
        } else {
          pos = hit + 1;
          score -= 0.55; // nice bonus for matching a deliberate pause
        }
      }
      // If the user paused on 2+ deliberate letters and the candidate misses any,
      // it's almost certainly wrong for this gesture.
      if (internal.length >= 2 && misses > 0) {
        return null;
      }
    }
  }

  return score;
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

  // Only break ties with learned history when scores are extremely close.
  return (
    Math.abs(score - bestScore) <= 0.025 && learnedUses > bestLearnedUses
  );
}

function prioritizeSwipeCandidates(
  candidates: Array<{word: string; rank: number}>,
  patternLength: number,
): Array<{word: string; rank: number}> {
  const anchorMin = Math.max(2, patternLength);
  const anchorMax = patternLength + 2;

  return [...candidates].sort((a, b) => {
    const aAnchor =
      a.word.length >= anchorMin && a.word.length <= anchorMax ? 0 : 1;
    const bAnchor =
      b.word.length >= anchorMin && b.word.length <= anchorMax ? 0 : 1;
    if (aAnchor !== bAnchor) {
      return aAnchor - bAnchor;
    }

    const aLenGap = Math.abs(a.word.length - patternLength);
    const bLenGap = Math.abs(b.word.length - patternLength);
    if (aLenGap !== bLenGap) {
      return aLenGap - bLenGap;
    }

    return a.rank - b.rank;
  });
}

function seedLengthBandCandidates(
  pattern: string,
  rawPoints: Point[],
  layouts: KeyBounds[],
  results: Array<{word: string; rank: number}>,
  seen: Set<string>,
  maxSeed = SWIPE_LENGTH_BAND_SEED_LIMIT,
): void {
  const startLetter =
    nearestTraceLetter(rawPoints[0], layouts) ?? pattern[0]?.toLowerCase();
  if (!startLetter) {
    return;
  }

  const targetLen = Math.max(2, pattern.length);
  const anchorMin = Math.max(2, targetLen);
  const anchorMax = targetLen + 2;
  const words = getWordsByFirstLetter(startLetter, 1200);

  for (const {word, rank} of words) {
    if (results.length >= maxSeed) {
      break;
    }
    if (word.length < anchorMin || word.length > anchorMax || seen.has(word)) {
      continue;
    }
    seen.add(word);
    results.push({word, rank});
  }
}

type BroadSwipeCandidateOptions = {
  fast?: boolean;
};

function getBroadSwipeCandidates(
  pattern: string,
  rawPoints: Point[],
  layouts: KeyBounds[],
  pauseAnchors: string[] = [],
  options: BroadSwipeCandidateOptions = {},
): Array<{word: string; rank: number}> {
  const fast = options.fast === true;
  const seen = new Set<string>();
  const results: Array<{word: string; rank: number}> = [];

  seedLengthBandCandidates(
    pattern,
    rawPoints,
    layouts,
    results,
    seen,
    fast ? 36 : SWIPE_LENGTH_BAND_SEED_LIMIT,
  );

  const addCandidates = (candidatePattern: string) => {
    if (!candidatePattern || !/^[a-z]/.test(candidatePattern)) {
      return;
    }
    const candidates = getSwipeCandidatesSync(
      candidatePattern,
      fast ? SWIPE_PREVIEW_CANDIDATE_LIMIT : SWIPE_CANDIDATE_LIMIT,
    );
    for (const candidate of candidates) {
      if (seen.has(candidate.word)) {
        continue;
      }
      seen.add(candidate.word);
      results.push(candidate);
      if (fast && results.length >= SWIPE_PREVIEW_CANDIDATE_LIMIT * 2) {
        break;
      }
    }
  };

  addCandidates(pattern);

  if (!fast) {
    const startLetter = nearestTraceLetter(rawPoints[0], layouts);
    if (startLetter && startLetter !== pattern[0]) {
      addCandidates(`${startLetter}${pattern.slice(1)}`);
    }

    if (pauseAnchors.length >= 2) {
      const anchorPattern = pauseAnchors.join('');
      if (anchorPattern && anchorPattern !== pattern) {
        addCandidates(anchorPattern);
      }
      const aFirst = pauseAnchors[0];
      const aLast = pauseAnchors[pauseAnchors.length - 1];
      if (aFirst && aLast && pattern.length >= 1) {
        addCandidates(
          `${aFirst}${pattern.slice(1)}${aLast !== pattern[pattern.length - 1] ? aLast : ''}`.replace(
            /(.)\1+$/,
            '$1',
          ),
        );
      }
    }
  }

  return fast ? results : prioritizeSwipeCandidates(results, pattern.length);
}

type SwipeDecodeMode = 'preview' | 'commit';

function decodeSwipeGestureCore(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
  timedPoints: TimedPoint[] = [],
  mode: SwipeDecodeMode = 'commit',
): string | null {
  const isPreview = mode === 'preview';
  const points = sanitizeGesturePoints(rawPoints);
  if (points.length < 2 || layouts.length === 0) {
    return null;
  }

  const scale = keyboardScale(layouts);
  const resampleCount = isPreview
    ? Math.min(24, resampleCountForPath(points.length))
    : resampleCountForPath(points.length);
  const swipePath = resamplePath(points, resampleCount);
  const letterMap = buildLetterMap(layouts);
  const keyboardHeight = layouts.reduce(
    (maxY, layout) => Math.max(maxY, layout.y + layout.height),
    0,
  );
  const verticalSpan = pathVerticalSpan(points);
  const pattern = buildTracePattern(points, swipePath, layouts);
  const gestureTurns = isPreview
    ? []
    : extractGestureTurningPoints(swipePath, letterMap);
  const gesturePathLength = pathLength(points);
  const pauseAnchors = isPreview
    ? []
    : extractPauseAnchors(
        timedPoints.length >= 3
          ? timedPoints
          : points.map((p, i) => ({...p, t: i})),
        layouts,
      );
  const learned = getLearnedCounts();

  const pathShapeFallback = () =>
    decodeByPathShape(
      points,
      swipePath,
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
      keyboardHeight,
      verticalSpan,
      isUppercase,
      pauseAnchors,
      pattern.length >= 2 ? pattern : undefined,
    );

  if (pattern.length < 2) {
    return finalizeSwipeWord(isPreview ? null : pathShapeFallback());
  }

  const candidates = (
    isPreview
      ? getBroadSwipeCandidates(pattern, points, layouts, pauseAnchors, {
          fast: true,
        })
      : prioritizeSwipeCandidates(
          getBroadSwipeCandidates(pattern, points, layouts, pauseAnchors),
          pattern.length,
        )
  ).slice(0, isPreview ? SWIPE_PREVIEW_SCORE_LIMIT : SWIPE_SCORE_LIMIT);

  let bestWord: string | null = null;
  let bestScore = Infinity;
  let bestLearnedUses = 0;

  for (const {word, rank} of candidates) {
    const learnedUses = learned.get(word) ?? 0;
    const score = scoreCandidate(
      word,
      pattern,
      swipePath,
      points,
      gestureTurns,
      letterMap,
      scale,
      gesturePathLength,
      rank,
      learnedUses,
      verticalSpan,
      keyboardHeight,
      pauseAnchors,
      isPreview,
    );
    if (score == null) {
      continue;
    }

    if (shouldPreferCandidate(score, learnedUses, bestScore, bestLearnedUses)) {
      bestScore = score;
      bestWord = word;
      bestLearnedUses = learnedUses;
    }
  }

  if (!isPreview) {
    const pathShapeWord = pathShapeFallback();
    if (pathShapeWord) {
      const pathScore = scoreCandidate(
        pathShapeWord.toLowerCase(),
        pattern,
        swipePath,
        points,
        gestureTurns,
        letterMap,
        scale,
        gesturePathLength,
        500,
        learned.get(pathShapeWord.toLowerCase()) ?? 0,
        verticalSpan,
        keyboardHeight,
        pauseAnchors,
        false,
      );
      if (
        pathScore != null &&
        (bestWord == null || pathScore < bestScore - 0.05)
      ) {
        bestWord = pathShapeWord.toLowerCase();
        bestScore = pathScore;
      }
    }
  }

  if (!bestWord) {
    return finalizeSwipeWord(
      pickByProximityOnly(
        pattern,
        swipePath,
        points,
        gestureTurns,
        letterMap,
        scale,
        gesturePathLength,
        keyboardHeight,
        verticalSpan,
        isUppercase,
        pauseAnchors,
      ) ?? pathShapeWord,
    );
  }

  return finalizeSwipeWord(formatWord(bestWord, isUppercase));
}

function sanitizeGesturePoints(points: Point[]): Point[] {
  return points.filter(
    point =>
      point != null &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
}

/** Fast in-progress decode for the suggestion bar while the finger is still down. */
export function previewSwipeGesture(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
  timedPoints: TimedPoint[] = [],
): string | null {
  return decodeSwipeGestureCore(
    rawPoints,
    layouts,
    isUppercase,
    timedPoints,
    'preview',
  );
}

export function decodeSwipeGesture(
  rawPoints: Point[],
  layouts: KeyBounds[],
  isUppercase: boolean,
  timedPoints: TimedPoint[] = [],
): string | null {
  return decodeSwipeGestureCore(
    rawPoints,
    layouts,
    isUppercase,
    timedPoints,
    'commit',
  );
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
  pauseAnchors: string[] = [],
  patternHint?: string,
): string | null {
  const startLetter = nearestTraceLetter(rawPoints[0], [...letterMap.values()]);
  if (!startLetter) {
    return null;
  }

  const layouts = [...letterMap.values()];
  const fallbackPattern = buildTracePattern(rawPoints, swipePath, layouts);
  const patternLength =
    patternHint?.length ??
    (fallbackPattern.length >= 2 ? fallbackPattern.length : 6);
  const candidates = prioritizeSwipeCandidates(
    getWordsByFirstLetter(startLetter, 2500),
    patternLength,
  );
  const scoreCutoff = patternLength >= 7 ? 2.65 : 2.05;
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
      pauseAnchors,
    );
    if (score == null || score > scoreCutoff) {
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
  gestureTurns: Point[],
  letterMap: Map<string, KeyBounds>,
  scale: number,
  gesturePathLength: number,
  keyboardHeight: number,
  verticalSpan: number,
  isUppercase: boolean,
  pauseAnchors: string[] = [],
): string | null {
  if (pattern.length < 2) {
    return null;
  }

  const candidates = prioritizeSwipeCandidates(
    getSwipeCandidatesSync(pattern, SWIPE_CANDIDATE_LIMIT),
    pattern.length,
  ).slice(0, SWIPE_SCORE_LIMIT);
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
      pauseAnchors,
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
  pauseAnchors: string[] = [],
): string | null {
  const first = pattern[0]?.toLowerCase();
  if (!first) {
    return null;
  }

  const candidates = prioritizeSwipeCandidates(
    getWordsByFirstLetter(first, SWIPE_CANDIDATE_LIMIT),
    pattern.length,
  );
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
      pauseAnchors,
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
