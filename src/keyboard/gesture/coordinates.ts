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
