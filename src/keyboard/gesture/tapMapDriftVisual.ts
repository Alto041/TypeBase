import type {TapMapEntry} from './tapMap';

export type TapDriftKeyLayout = {
  letter: string;
  centerX: number;
  centerY: number;
  keyWidth: number;
  keyHeight: number;
};

export type TapDriftPoint = {
  letter: string;
  centerX: number;
  centerY: number;
  endX: number;
  endY: number;
  distancePx: number;
  samples: number;
};

const MIN_SAMPLES = 4;

function cross(
  o: {x: number; y: number},
  a: {x: number; y: number},
  b: {x: number; y: number},
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Monotone-chain convex hull (for drift envelope outline). */
export function convexHull(
  points: ReadonlyArray<{x: number; y: number}>,
): Array<{x: number; y: number}> {
  if (points.length <= 2) {
    return [...points];
  }
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Array<{x: number; y: number}> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<{x: number; y: number}> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function hullPath(points: ReadonlyArray<{x: number; y: number}>): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x} ${p.y} m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0`;
  }
  if (points.length === 2) {
    const a = points[0]!;
    const b = points[1]!;
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  const hull = convexHull(points);
  if (hull.length === 0) {
    return '';
  }
  const [first, ...rest] = hull;
  return `M ${first!.x} ${first!.y} ${rest.map(p => `L ${p.x} ${p.y}`).join(' ')} Z`;
}

export function buildLetterKeyLayouts(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  keyWidth: number,
  keyHeight: number,
  gap: number,
): TapDriftKeyLayout[] {
  const maxCols = Math.max(...rows.map(row => row.length));
  const maxRowWidth = maxCols * keyWidth + (maxCols - 1) * gap;
  const layouts: TapDriftKeyLayout[] = [];

  rows.forEach((row, rowIndex) => {
    const rowWidth = row.length * keyWidth + (row.length - 1) * gap;
    const offsetX = (maxRowWidth - rowWidth) / 2;
    row.forEach((letter, colIndex) => {
      const centerX = offsetX + colIndex * (keyWidth + gap) + keyWidth / 2;
      const centerY = rowIndex * (keyHeight + gap) + keyHeight / 2;
      layouts.push({letter, centerX, centerY, keyWidth, keyHeight});
    });
  });

  return layouts;
}

export function buildTapDriftPoints(
  letters: Record<string, TapMapEntry>,
  keyLayouts: ReadonlyArray<TapDriftKeyLayout>,
  offsetScale: number,
): TapDriftPoint[] {
  const points: TapDriftPoint[] = [];
  for (const layout of keyLayouts) {
    const entry = letters[layout.letter];
    if (!entry || entry.samples < MIN_SAMPLES) {
      continue;
    }
    const dx = entry.dx * offsetScale;
    const dy = entry.dy * offsetScale;
    const endX = layout.centerX + dx;
    const endY = layout.centerY + dy;
    points.push({
      letter: layout.letter,
      centerX: layout.centerX,
      centerY: layout.centerY,
      endX,
      endY,
      distancePx: Math.sqrt(entry.dx * entry.dx + entry.dy * entry.dy),
      samples: entry.samples,
    });
  }
  return points;
}

export function maxRowWidth(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  keyWidth: number,
  gap: number,
): number {
  const maxCols = Math.max(...rows.map(row => row.length));
  return maxCols * keyWidth + (maxCols - 1) * gap;
}

export function trayHeight(
  rowCount: number,
  keyHeight: number,
  gap: number,
): number {
  return rowCount * keyHeight + (rowCount - 1) * gap;
}
