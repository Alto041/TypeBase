import {getPrefixCompletions} from '../autocorrect/englishPrefixIndex';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyBounds} from './types';
import {getLetterBigramWeight} from './touchIntelligenceLetterBigrams';
import {recordTouchIntelligenceAnalysis} from './touchIntelligenceTelemetry';

export type TouchIntelligenceTypingContext = {
  wordPrefix: string;
  previousKeyLetter: string | null;
};

export type TouchSample = {
  localX: number;
  localY: number;
  timestampMs: number;
};

type KeyHitSlop = {
  horizontal: number;
  vertical: number;
};

export type TouchIntelligenceNativeConfig = {
  enabled: boolean;
  previousKeyLetter: string | null;
  wordPrefix: string;
  likelyNextLetters: string[];
  lastTapX: number;
  lastTapY: number;
  lastTapAtMs: number;
};

type LastTapRecord = {
  localX: number;
  localY: number;
  letter: string;
  timestampMs: number;
};

const WEIGHT_GEOMETRIC = 0.34;
const WEIGHT_VELOCITY = 0.1;
const WEIGHT_NEIGHBOR = 0.1;
const WEIGHT_BIGRAM = 0.12;
const WEIGHT_WORD_CONTINUATION = 0.26;
const CONFIDENT_STRICT_CENTER_RATIO = 0.22;
const MIN_RERANK_MARGIN = 0.018;
const CONTEXT_OVERRIDE_MARGIN = 0.08;

let typingContextProvider: (() => TouchIntelligenceTypingContext) | null = null;
let lastTap: LastTapRecord | null = null;
let neighborCacheKey = '';
let neighborCache = new Map<string, Set<string>>();

export function setTouchIntelligenceTypingContextProvider(
  provider: (() => TouchIntelligenceTypingContext) | null,
): void {
  typingContextProvider = provider;
}

export function getTouchIntelligenceTypingContext(): TouchIntelligenceTypingContext {
  return (
    typingContextProvider?.() ?? {
      wordPrefix: '',
      previousKeyLetter: null,
    }
  );
}

export function recordTouchIntelligenceTap(
  letter: string,
  localX: number,
  localY: number,
  timestampMs: number = Date.now(),
): void {
  const normalized = letter.trim().toLowerCase();
  if (normalized.length !== 1 || !/[a-z]/.test(normalized)) {
    return;
  }
  lastTap = {
    localX,
    localY,
    letter: normalized,
    timestampMs,
  };
}

export function getLikelyNextLetters(prefix: string, limit = 8): string[] {
  const lower = prefix.trim().toLowerCase();
  if (lower.length < 2 || !/^[a-z]+$/.test(lower)) {
    return [];
  }

  const completions = getPrefixCompletions(lower, 16);
  const counts = new Map<string, number>();
  for (const word of completions) {
    if (word.length <= lower.length) {
      continue;
    }
    const next = word[lower.length]?.toLowerCase();
    if (next && /[a-z]/.test(next)) {
      counts.set(next, (counts.get(next) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([letter]) => letter);
}

export function getTouchIntelligenceNativeConfig(): TouchIntelligenceNativeConfig {
  const typing = getTouchIntelligenceTypingContext();
  return {
    enabled: true,
    previousKeyLetter: typing.previousKeyLetter,
    wordPrefix: typing.wordPrefix,
    likelyNextLetters: getLikelyNextLetters(typing.wordPrefix),
    lastTapX: lastTap?.localX ?? 0,
    lastTapY: lastTap?.localY ?? 0,
    lastTapAtMs: lastTap?.timestampMs ?? 0,
  };
}

export function syncTouchIntelligenceToNative(): void {
  keyboardBridge.updateTouchIntelligenceContext(
    JSON.stringify(getTouchIntelligenceNativeConfig()),
  );
}

function keyLetter(layout: KeyBounds): string | null {
  const value = layout.keyDef.value ?? layout.letter ?? '';
  if (value.length !== 1) {
    return null;
  }
  const lower = value.toLowerCase();
  return /[a-z]/.test(lower) ? lower : null;
}

function pointInsideRect(
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}

function distanceToRect(
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  const dx = x < left ? left - x : x > right ? x - right : 0;
  const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
}

function expandedBounds(layout: KeyBounds, slop: KeyHitSlop) {
  return {
    left: layout.x - slop.horizontal,
    right: layout.x + layout.width + slop.horizontal,
    top: layout.y - slop.vertical,
    bottom: layout.y + layout.height + slop.vertical,
  };
}

function buildNeighborCacheKey(layouts: readonly KeyBounds[]): string {
  return layouts
    .map(layout => `${layout.id}:${layout.centerX.toFixed(1)},${layout.centerY.toFixed(1)}`)
    .join('|');
}

function buildSpatialNeighborMap(
  layouts: readonly KeyBounds[],
): Map<string, Set<string>> {
  const cacheKey = buildNeighborCacheKey(layouts);
  if (cacheKey === neighborCacheKey) {
    return neighborCache;
  }

  const letters = layouts
    .map(layout => ({letter: keyLetter(layout), layout}))
    .filter(
      (
        entry,
      ): entry is {letter: string; layout: KeyBounds} => entry.letter != null,
    );

  const avgKeySize =
    letters.length > 0
      ? letters.reduce(
          (sum, entry) =>
            sum + Math.max(entry.layout.width, entry.layout.height),
          0,
        ) / letters.length
      : 48;
  const neighborRadius = avgKeySize * 1.35;
  const map = new Map<string, Set<string>>();

  for (const left of letters) {
    const neighbors = new Set<string>();
    for (const right of letters) {
      if (left.letter === right.letter) {
        continue;
      }
      const dist = Math.hypot(
        left.layout.centerX - right.layout.centerX,
        left.layout.centerY - right.layout.centerY,
      );
      if (dist <= neighborRadius) {
        neighbors.add(right.letter);
      }
    }
    map.set(left.letter, neighbors);
  }

  neighborCacheKey = cacheKey;
  neighborCache = map;
  return map;
}

function geometricScore(
  layout: KeyBounds,
  x: number,
  y: number,
  slop: KeyHitSlop,
): number {
  const right = layout.x + layout.width;
  const bottom = layout.y + layout.height;
  const inside = pointInsideRect(x, y, layout.x, layout.y, right, bottom);

  const halfW = Math.max(layout.width / 2, 1);
  const halfH = Math.max(layout.height / 2, 1);
  const normDist = Math.hypot(
    (x - layout.centerX) / halfW,
    (y - layout.centerY) / halfH,
  );

  if (inside) {
    return 1 - normDist * 0.32;
  }

  const edgeDistance = distanceToRect(x, y, layout.x, layout.y, right, bottom);
  const maxSlop = Math.max(slop.horizontal, slop.vertical) + 4;
  if (edgeDistance > maxSlop) {
    return -Infinity;
  }

  return Math.max(0, 0.58 - (edgeDistance / maxSlop) * 0.45);
}

function velocityScore(
  layout: KeyBounds,
  x: number,
  y: number,
  velocity: {vx: number; vy: number} | null,
): number {
  if (!velocity) {
    return 0.5;
  }

  const speed = Math.hypot(velocity.vx, velocity.vy);
  if (speed < 120) {
    return 0.5;
  }

  const leadMs = Math.min(0.11, speed / 6000);
  const predictedX = x + velocity.vx * leadMs;
  const predictedY = y + velocity.vy * leadMs;
  const keySize = Math.max(layout.width, layout.height, 1);
  const dist = Math.hypot(
    predictedX - layout.centerX,
    predictedY - layout.centerY,
  );
  return Math.max(0, 1 - dist / (keySize * 1.25));
}

function neighborScore(
  candidateLetter: string | null,
  references: Array<string | null>,
  neighborMap: Map<string, Set<string>>,
): number {
  if (!candidateLetter) {
    return 0.45;
  }

  for (const reference of references) {
    if (!reference) {
      continue;
    }
    if (reference === candidateLetter) {
      return 1;
    }
    if (neighborMap.get(reference)?.has(candidateLetter)) {
      return 0.86;
    }
  }

  return 0.42;
}

function bigramScore(
  candidateLetter: string | null,
  previousKeyLetter: string | null,
  wordPrefix: string,
): number {
  if (!candidateLetter) {
    return 0.45;
  }

  let best = 0.45;
  if (previousKeyLetter) {
    best = Math.max(
      best,
      getLetterBigramWeight(previousKeyLetter, candidateLetter),
    );
  }

  const prefixLast = wordPrefix.trim().toLowerCase().slice(-1);
  if (prefixLast && /[a-z]/.test(prefixLast) && prefixLast !== previousKeyLetter) {
    best = Math.max(best, getLetterBigramWeight(prefixLast, candidateLetter));
  }

  return best;
}

function likelyNextLetterScore(
  candidateLetter: string | null,
  likelyNextLetters: readonly string[],
): number {
  if (!candidateLetter || likelyNextLetters.length === 0) {
    return 0.4;
  }

  const index = likelyNextLetters.indexOf(candidateLetter.toLowerCase());
  if (index < 0) {
    return 0.32;
  }

  return Math.max(0.55, 1 - index * 0.12);
}

function wordContinuationScore(
  candidateLetter: string | null,
  wordPrefix: string,
  likelyNextLetters: readonly string[],
): number {
  const likely = likelyNextLetterScore(candidateLetter, likelyNextLetters);
  const lower = wordPrefix.trim().toLowerCase();
  if (!candidateLetter || lower.length < 2 || !/^[a-z]+$/.test(lower)) {
    return likely;
  }

  const completions = getPrefixCompletions(lower, 12);
  if (completions.length === 0) {
    return likely;
  }

  let hits = 0;
  for (const word of completions) {
    if (word.length > lower.length && word[lower.length] === candidateLetter) {
      hits += 1;
    }
  }

  if (hits === 0) {
    return likely;
  }

  const completionScore = Math.min(1, 0.5 + hits / completions.length * 0.5);
  return Math.max(likely, completionScore);
}

function timingFactor(msSinceLastTap: number): number {
  if (msSinceLastTap < 0) {
    return 1;
  }
  if (msSinceLastTap < 130) {
    return 1.22;
  }
  if (msSinceLastTap < 260) {
    return 1.08;
  }
  if (msSinceLastTap > 900) {
    return 0.9;
  }
  return 1;
}

function deriveVelocity(
  sample: TouchSample,
): {vx: number; vy: number} | null {
  if (!lastTap) {
    return null;
  }

  const dt = sample.timestampMs - lastTap.timestampMs;
  if (dt <= 0 || dt > 900) {
    return null;
  }

  return {
    vx: ((sample.localX - lastTap.localX) / dt) * 1000,
    vy: ((sample.localY - lastTap.localY) / dt) * 1000,
  };
}

function isConfidentStrictHit(
  layout: KeyBounds,
  x: number,
  y: number,
): boolean {
  const right = layout.x + layout.width;
  const bottom = layout.y + layout.height;
  if (!pointInsideRect(x, y, layout.x, layout.y, right, bottom)) {
    return false;
  }

  const halfW = Math.max(layout.width / 2, 1);
  const halfH = Math.max(layout.height / 2, 1);
  const normDist = Math.hypot(
    (x - layout.centerX) / halfW,
    (y - layout.centerY) / halfH,
  );
  return normDist <= CONFIDENT_STRICT_CENTER_RATIO;
}

function layoutByLetter(
  layouts: readonly KeyBounds[],
): Map<string, KeyBounds> {
  const map = new Map<string, KeyBounds>();
  for (const layout of layouts) {
    const letter = keyLetter(layout);
    if (letter) {
      map.set(letter, layout);
    }
  }
  return map;
}

function collectCandidates(
  x: number,
  y: number,
  layouts: readonly KeyBounds[],
  slop: KeyHitSlop,
  geometricHit: KeyBounds | null,
  neighborMap: Map<string, Set<string>>,
): KeyBounds[] {
  const candidates = new Map<string, KeyBounds>();
  const maxSnap = Math.max(slop.horizontal, slop.vertical) + 4;
  const letterLayouts = layoutByLetter(layouts);

  const addCandidate = (layout: KeyBounds | null | undefined) => {
    if (layout) {
      candidates.set(layout.id, layout);
    }
  };

  for (const layout of layouts) {
    const right = layout.x + layout.width;
    const bottom = layout.y + layout.height;
    const inside = pointInsideRect(x, y, layout.x, layout.y, right, bottom);
    const bounds = expandedBounds(layout, slop);
    const inSlop =
      x >= bounds.left &&
      x <= bounds.right &&
      y >= bounds.top &&
      y <= bounds.bottom;
    const edgeDistance = distanceToRect(x, y, layout.x, layout.y, right, bottom);

    if (inside || inSlop || edgeDistance <= maxSnap) {
      addCandidate(layout);
    }
  }

  const geometricLetter = geometricHit ? keyLetter(geometricHit) : null;
  if (geometricLetter) {
    for (const neighbor of neighborMap.get(geometricLetter) ?? []) {
      addCandidate(letterLayouts.get(neighbor));
    }
  }

  return [...candidates.values()];
}

function languageScore(
  candidateLetter: string | null,
  typing: TouchIntelligenceTypingContext,
  likelyNextLetters: readonly string[],
): number {
  return (
    bigramScore(
      candidateLetter,
      typing.previousKeyLetter,
      typing.wordPrefix,
    ) * 0.35 +
    wordContinuationScore(
      candidateLetter,
      typing.wordPrefix,
      likelyNextLetters,
    ) * 0.65
  );
}

function scoreCandidate(
  layout: KeyBounds,
  x: number,
  y: number,
  slop: KeyHitSlop,
  velocity: {vx: number; vy: number} | null,
  typing: TouchIntelligenceTypingContext,
  neighborMap: Map<string, Set<string>>,
  rawHitLetter: string | null,
  timingScale: number,
  likelyNextLetters: readonly string[],
): number {
  const candidateLetter = keyLetter(layout);
  const geo = geometricScore(layout, x, y, slop);
  if (!Number.isFinite(geo)) {
    return -Infinity;
  }

  const references = [
    typing.previousKeyLetter,
    rawHitLetter,
    lastTap?.letter ?? null,
  ];

  const score =
    geo * WEIGHT_GEOMETRIC +
    velocityScore(layout, x, y, velocity) * WEIGHT_VELOCITY +
    neighborScore(candidateLetter, references, neighborMap) * WEIGHT_NEIGHBOR +
    bigramScore(
      candidateLetter,
      typing.previousKeyLetter,
      typing.wordPrefix,
    ) *
      WEIGHT_BIGRAM +
    wordContinuationScore(
      candidateLetter,
      typing.wordPrefix,
      likelyNextLetters,
    ) *
      WEIGHT_WORD_CONTINUATION;

  return score * timingScale;
}

function geometricOnlyHit(
  x: number,
  y: number,
  candidates: readonly KeyBounds[],
  slop: KeyHitSlop,
): KeyBounds | null {
  let strictMatch: KeyBounds | null = null;
  let smallestArea = Infinity;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const layout = candidates[index]!;
    const inside = pointInsideRect(
      x,
      y,
      layout.x,
      layout.y,
      layout.x + layout.width,
      layout.y + layout.height,
    );
    if (!inside) {
      continue;
    }
    const area = layout.width * layout.height;
    if (area < smallestArea) {
      smallestArea = area;
      strictMatch = layout;
    }
  }

  if (strictMatch) {
    return strictMatch;
  }

  let gapMatch: KeyBounds | null = null;
  let nearestCenter = Infinity;
  for (const layout of candidates) {
    const bounds = expandedBounds(layout, slop);
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    ) {
      continue;
    }
    const centerDistance = Math.hypot(
      x - layout.centerX,
      y - layout.centerY,
    );
    if (centerDistance < nearestCenter) {
      nearestCenter = centerDistance;
      gapMatch = layout;
    }
  }

  if (gapMatch) {
    return gapMatch;
  }

  const maxSnap = Math.max(slop.horizontal, slop.vertical) + 4;
  let snapMatch: KeyBounds | null = null;
  let nearestEdge = Infinity;
  for (const layout of candidates) {
    const edgeDistance = distanceToRect(
      x,
      y,
      layout.x,
      layout.y,
      layout.x + layout.width,
      layout.y + layout.height,
    );
    if (edgeDistance < nearestEdge) {
      nearestEdge = edgeDistance;
      snapMatch = layout;
    }
  }

  return snapMatch && nearestEdge <= maxSnap ? snapMatch : null;
}

function maybeEmitTouchHitTelemetry(
  recordTelemetry: boolean,
  localX: number,
  localY: number,
  geometricHit: KeyBounds | null,
  predictedHit: KeyBounds | null,
  options: {
    confidentFastPath: boolean;
    reranked: boolean;
    appliedRerank: boolean;
    scoreMargin: number;
    msSinceLastTap: number;
    velocityPxPerSec: number;
    wordPrefix: string;
    previousKeyLetter: string | null;
  },
): void {
  if (!recordTelemetry) {
    return;
  }
  recordTouchIntelligenceAnalysis({
    localX,
    localY,
    geometricKeyId: geometricHit?.id ?? null,
    geometricLetter: geometricHit ? keyLetter(geometricHit) : null,
    predictedKeyId: predictedHit?.id ?? null,
    predictedLetter: predictedHit ? keyLetter(predictedHit) : null,
    reranked: options.reranked,
    appliedRerank: options.appliedRerank,
    confidentFastPath: options.confidentFastPath,
    scoreMargin: options.scoreMargin,
    msSinceLastTap: options.msSinceLastTap,
    velocityPxPerSec: options.velocityPxPerSec,
    wordPrefix: options.wordPrefix,
    previousKeyLetter: options.previousKeyLetter,
  });
}

/** Predict the intended key using touch kinematics and typing context. */
export function intelligentHitTestKey(
  localX: number,
  localY: number,
  layouts: readonly KeyBounds[],
  slop: KeyHitSlop,
  touchSample?: TouchSample,
  recordTelemetry = false,
): KeyBounds | null {
  if (layouts.length === 0) {
    return null;
  }

  const sample: TouchSample = touchSample ?? {
    localX,
    localY,
    timestampMs: Date.now(),
  };

  const neighborMap = buildSpatialNeighborMap(layouts);
  const geometricHit = geometricOnlyHit(
    localX,
    localY,
    collectCandidates(localX, localY, layouts, slop, null, neighborMap),
    slop,
  );
  const candidates = collectCandidates(
    localX,
    localY,
    layouts,
    slop,
    geometricHit,
    neighborMap,
  );
  if (candidates.length === 0) {
    return null;
  }

  const velocity = deriveVelocity(sample);
  const speed = velocity ? Math.hypot(velocity.vx, velocity.vy) : 0;
  const typing = getTouchIntelligenceTypingContext();
  const likelyNextLetters = getLikelyNextLetters(typing.wordPrefix);
  const msSinceLastTap = lastTap
    ? sample.timestampMs - lastTap.timestampMs
    : -1;
  const hasWordContext = typing.wordPrefix.trim().length >= 2;

  if (
    !hasWordContext &&
    geometricHit &&
    isConfidentStrictHit(geometricHit, localX, localY) &&
    speed < 900
  ) {
    maybeEmitTouchHitTelemetry(
      recordTelemetry,
      localX,
      localY,
      geometricHit,
      geometricHit,
      {
      confidentFastPath: true,
      reranked: false,
      appliedRerank: false,
      scoreMargin: 0,
      msSinceLastTap,
      velocityPxPerSec: speed,
      wordPrefix: typing.wordPrefix,
      previousKeyLetter: typing.previousKeyLetter,
    });
    return geometricHit;
  }

  const rawHitLetter = geometricHit ? keyLetter(geometricHit) : null;
  const timingScale = timingFactor(msSinceLastTap);

  let bestLayout: KeyBounds | null = null;
  let bestScore = -Infinity;
  let geometricScoreValue = -Infinity;
  let bestLanguageScore = -Infinity;
  let geometricLanguageScore = -Infinity;

  for (const layout of candidates) {
    const candidateLetter = keyLetter(layout);
    const language = languageScore(candidateLetter, typing, likelyNextLetters);
    const score = scoreCandidate(
      layout,
      localX,
      localY,
      slop,
      velocity,
      typing,
      neighborMap,
      rawHitLetter,
      timingScale,
      likelyNextLetters,
    );
    if (layout === geometricHit) {
      geometricScoreValue = score;
      geometricLanguageScore = language;
    }
    if (language > bestLanguageScore) {
      bestLanguageScore = language;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLayout = layout;
    }
  }

  if (!bestLayout) {
    maybeEmitTouchHitTelemetry(
      recordTelemetry,
      localX,
      localY,
      geometricHit,
      geometricHit,
      {
      confidentFastPath: false,
      reranked: false,
      appliedRerank: false,
      scoreMargin: 0,
      msSinceLastTap,
      velocityPxPerSec: speed,
      wordPrefix: typing.wordPrefix,
      previousKeyLetter: typing.previousKeyLetter,
    });
    return geometricHit;
  }

  const reranked =
    geometricHit != null &&
    bestLayout.id !== geometricHit.id;
  const contextOverride =
    hasWordContext &&
    reranked &&
    bestLanguageScore - geometricLanguageScore >= CONTEXT_OVERRIDE_MARGIN;
  const marginRejected =
    !contextOverride &&
    geometricHit != null &&
    bestLayout.id !== geometricHit.id &&
    bestScore - geometricScoreValue < MIN_RERANK_MARGIN;
  const finalHit = marginRejected ? geometricHit : bestLayout;

  maybeEmitTouchHitTelemetry(
    recordTelemetry,
    localX,
    localY,
    geometricHit,
    finalHit,
    {
    confidentFastPath: false,
    reranked,
    appliedRerank: reranked && !marginRejected,
    scoreMargin: Math.max(0, bestScore - geometricScoreValue),
    msSinceLastTap,
    velocityPxPerSec: speed,
    wordPrefix: typing.wordPrefix,
    previousKeyLetter: typing.previousKeyLetter,
  });

  return finalHit;
}
