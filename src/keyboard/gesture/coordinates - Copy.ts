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
