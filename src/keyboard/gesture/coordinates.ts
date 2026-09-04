import type {Point} from './types';

export type PagePoint = {pageX: number; pageY: number};
export type AreaOrigin = {pageX: number; pageY: number};

export function pageToLocal(
  page: PagePoint,
  origin: AreaOrigin,
): Point {
  return {
    x: page.pageX - origin.pageX,
    y: page.pageY - origin.pageY,
  };
}

export function pageWithDelta(page: PagePoint, dx: number, dy: number): PagePoint {
  return {
    pageX: page.pageX + dx,
    pageY: page.pageY + dy,
  };
}

export function clampPoint(
  point: Point,
  width: number,
  height: number,
): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isValidTrailStep(
  last: Point,
  next: Point,
  maxJump: number,
): boolean {
  return distance(last, next) <= maxJump;
}

function turningAngleDegrees(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) {
    return 180;
  }
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return Math.acos(cos) * (180 / Math.PI);
}

/** Keep endpoints and sharp turns (e.g. top→bottom→top) when capping point count. */
export function decimatePoints(points: Point[], maxCount: number): Point[] {
  if (points.length <= maxCount) {
    return points;
  }

  const keep = new Set<number>([0, points.length - 1]);
  const curvature: Array<{index: number; value: number}> = [];

  for (let index = 1; index < points.length - 1; index++) {
    const angle = turningAngleDegrees(
      points[index - 1],
      points[index],
      points[index + 1],
    );
    const value = 180 - angle;
    curvature.push({index, value});
    if (value > 22) {
      keep.add(index);
    }
  }

  curvature.sort((a, b) => b.value - a.value);
  for (const entry of curvature) {
    if (keep.size >= maxCount) {
      break;
    }
    keep.add(entry.index);
  }

  for (let slot = 1; keep.size < maxCount && slot < points.length - 1; slot++) {
    const index = Math.round((slot * (points.length - 1)) / maxCount);
    keep.add(index);
  }

  if (keep.size > maxCount) {
    const droppable = curvature
      .filter(entry => entry.index !== 0 && entry.index !== points.length - 1)
      .sort((a, b) => a.value - b.value);
    let size = keep.size;
    for (const entry of droppable) {
      if (size <= maxCount) {
        break;
      }
      if (keep.delete(entry.index)) {
        size -= 1;
      }
    }
  }

  return [...keep].sort((a, b) => a - b).map(index => points[index]);
}

/** Preserve endpoints, sharp turns, and evenly spaced samples when capping path length. */
export function compactPointsWithLandmarks(
  points: Point[],
  maxCount: number,
): Point[] {
  return decimatePoints(points, maxCount);
}

export class PointBuffer {
  private points: Point[] = [];

  constructor(
    private readonly maxPoints: number,
    private readonly compactTarget: number,
  ) {}

  reset(): void {
    this.points = [];
  }

  get length(): number {
    return this.points.length;
  }

  toArray(): Point[] {
    return this.points;
  }

  snapshot(): Point[] {
    return this.points.map(point => ({...point}));
  }

  push(next: Point): void {
    this.points.push(next);
    if (this.points.length > this.maxPoints) {
      this.points = compactPointsWithLandmarks(this.points, this.compactTarget);
    }
  }
}

export type TimedSample = Point & {t: number};

export class TimedPointBuffer {
  private points: TimedSample[] = [];

  constructor(private readonly maxPoints: number) {}

  reset(): void {
    this.points = [];
  }

  get length(): number {
    return this.points.length;
  }

  toArray(): TimedSample[] {
    return this.points;
  }

  snapshot(): TimedSample[] {
    return this.points.map(point => ({...point}));
  }

  push(next: TimedSample): void {
    this.points.push(next);
    if (this.points.length > this.maxPoints) {
      this.points = compactTimedPoints(this.points, this.maxPoints);
    }
  }
}

function compactTimedPoints(
  points: TimedSample[],
  maxCount: number,
): TimedSample[] {
  if (points.length <= maxCount) {
    return points;
  }

  const speeds: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const dt = Math.max(1, points[index + 1]!.t - points[index]!.t);
    const ds = distance(points[index]!, points[index + 1]!);
    speeds.push(ds / dt);
  }
  const sorted = [...speeds].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.4;
  const pauseThreshold = median * 0.35;

  const keep = new Set<number>([0, points.length - 1]);
  for (let index = 1; index < speeds.length; index += 1) {
    if (speeds[index]! <= pauseThreshold) {
      keep.add(index);
      keep.add(index + 1);
    }
  }

  while (keep.size < maxCount) {
    const stride = Math.max(1, Math.floor(points.length / maxCount));
    for (let index = 0; index < points.length && keep.size < maxCount; index += stride) {
      keep.add(index);
    }
    if (keep.size < maxCount) {
      keep.add(Math.floor(points.length / 2));
    }
    break;
  }

  return [...keep]
    .sort((a, b) => a - b)
    .slice(0, maxCount)
    .map(index => points[index]!);
}

/**
 * Fast chained glides often include a brief dwell between words without a full lift.
 * Keep only the segment after the last pause so consecutive words do not merge.
 */
export function trimGestureAtLastPause(
  spatialPoints: Point[],
  timedPoints: Array<Point & {t: number}>,
  pauseGapMs = 110,
): {spatial: Point[]; timed: Array<Point & {t: number}>} {
  if (timedPoints.length < 4) {
    return {spatial: spatialPoints, timed: timedPoints};
  }

  let lastGapIndex = 0;
  for (let index = 1; index < timedPoints.length; index += 1) {
    const gap = timedPoints[index]!.t - timedPoints[index - 1]!.t;
    if (gap >= pauseGapMs) {
      lastGapIndex = index;
    }
  }

  if (lastGapIndex === 0) {
    return {spatial: spatialPoints, timed: timedPoints};
  }

  const timed = timedPoints.slice(lastGapIndex);
  if (timed.length < 2 || spatialPoints.length < 2) {
    return {spatial: spatialPoints, timed: timedPoints};
  }

  const ratio = lastGapIndex / timedPoints.length;
  const spatialStart = Math.min(
    spatialPoints.length - 2,
    Math.max(0, Math.floor(spatialPoints.length * ratio)),
  );
  const spatial = spatialPoints.slice(spatialStart);
  if (spatial.length < 2) {
    return {spatial: spatialPoints, timed: timedPoints};
  }
  return {spatial, timed};
}
