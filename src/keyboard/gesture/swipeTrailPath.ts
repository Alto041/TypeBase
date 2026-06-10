import type {Point, TrailPoint} from './types';

export type FadingTrailSegment = {
  d: string;
  strokeWidth: number;
  opacity: number;
};

function widthAt(t: number, tailWidth: number, headWidth: number): number {
  const eased = t * t * (3 - 2 * t);
  return tailWidth + (headWidth - tailWidth) * eased;
}

function fadeOpacity(ageMs: number, fadeDurationMs: number): number {
  if (ageMs >= fadeDurationMs) {
    return 0;
  }
  const t = ageMs / fadeDurationMs;
  return 1 - t * t;
}

/** Thin stroke segments with per-age opacity so the tail dissolves while drawing. */
export function buildFadingTrailSegments(
  points: TrailPoint[],
  tailWidth: number,
  headWidth: number,
  nowMs: number,
  fadeDurationMs: number,
): FadingTrailSegment[] {
  if (points.length < 2) {
    return [];
  }

  const n = points.length;
  const segments: FadingTrailSegment[] = [];

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const opacity = Math.min(
      fadeOpacity(nowMs - p0.timestampMs, fadeDurationMs),
      fadeOpacity(nowMs - p1.timestampMs, fadeDurationMs),
    );
    if (opacity < 0.02) {
      continue;
    }

    const t0 = i / (n - 1);
    const t1 = (i + 1) / (n - 1);
    const strokeWidth = (widthAt(t0, tailWidth, headWidth) + widthAt(t1, tailWidth, headWidth)) / 2;

    segments.push({
      d: `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
      strokeWidth,
      opacity: opacity * 0.9,
    });
  }

  return segments;
}

function fmt(p: Point): string {
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}

function arcMidpointOnCircle(
  center: Point,
  radius: number,
  from: Point,
  to: Point,
  sweep: 0 | 1,
): Point {
  let a0 = Math.atan2(from.y - center.y, from.x - center.x);
  let a1 = Math.atan2(to.y - center.y, to.x - center.x);

  if (sweep === 1) {
    while (a1 > a0) {
      a1 -= Math.PI * 2;
    }
    while (a1 <= a0 - Math.PI * 2) {
      a1 += Math.PI * 2;
    }
  } else {
    while (a1 < a0) {
      a1 += Math.PI * 2;
    }
  }

  const mid = (a0 + a1) / 2;
  return {
    x: center.x + radius * Math.cos(mid),
    y: center.y + radius * Math.sin(mid),
  };
}

function pickArcSweep(
  center: Point,
  from: Point,
  to: Point,
  bulgeDir: Point,
): 0 | 1 {
  const radius = Math.hypot(from.x - center.x, from.y - center.y);
  if (radius < 0.05) {
    return 1;
  }

  let bestSweep: 0 | 1 = 1;
  let bestDot = -Infinity;
  for (const sweep of [0, 1] as const) {
    const mid = arcMidpointOnCircle(center, radius, from, to, sweep);
    const dot =
      (mid.x - center.x) * bulgeDir.x + (mid.y - center.y) * bulgeDir.y;
    if (dot > bestDot) {
      bestDot = dot;
      bestSweep = sweep;
    }
  }
  return bestSweep;
}

function capArc(
  center: Point,
  from: Point,
  to: Point,
  radius: number,
  bulgeDir: Point,
): string {
  if (radius < 0.05) {
    return `L ${fmt(to)}`;
  }

  const sweep = pickArcSweep(center, from, to, bulgeDir);
  return `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 ${sweep} ${fmt(to)}`;
}

// ─── buildTaperedTrailPath ────────────────────────────────────────────────────
//
// Replaces the old rebuildSmoothPath (two uniform-width strokes) with a proper
// tapered ribbon. The trail is drawn as a FILLED POLYGON whose width narrows
// linearly from tailWidth (oldest point) to headWidth (newest point).
//
// Algorithm:
//   For each segment between consecutive points, compute a perpendicular offset
//   vector scaled to the segment's target half-width. Build left-side and
//   right-side vertex arrays, then join them into a closed SVG path.
//
// This gives the "comet" look: fat glowing head, razor-thin tail.
//
export function buildTaperedTrailPath(
  points: Point[],
  tailWidth: number,  // stroke width at index 0 (oldest)
  headWidth: number,  // stroke width at last index (newest)
  _glowWidth: number, // unused here but kept for signature clarity
): {corePath: string; glowPath: string} {
  if (points.length < 2) {
    return {corePath: '', glowPath: ''};
  }

  const n = points.length;

  // Half-width at each point, eased tail→head for a softer comet profile
  const halfWidths = points.map((_, i) => {
    const t = i / (n - 1);
    const eased = t * t * (3 - 2 * t);
    return (tailWidth + (headWidth - tailWidth) * eased) / 2;
  });

  // Per-segment direction vectors (normalised)
  const dirs: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dirs.push({x: dx / len, y: dy / len});
  }

  // Per-point normal (average of adjacent segment directions for smooth joints)
  const normals: Point[] = [];
  for (let i = 0; i < n; i++) {
    let nx: number;
    let ny: number;
    if (i === 0) {
      nx = -dirs[0].y;
      ny = dirs[0].x;
    } else if (i === n - 1) {
      nx = -dirs[n - 2].y;
      ny = dirs[n - 2].x;
    } else {
      // average the two adjacent segment normals
      const ax = -dirs[i - 1].y + -dirs[i].y;
      const ay = dirs[i - 1].x + dirs[i].x;
      const len = Math.sqrt(ax * ax + ay * ay) || 1;
      nx = ax / len;
      ny = ay / len;
    }
    normals.push({x: nx, y: ny});
  }

  // Build left and right offset vertices
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const hw = halfWidths[i];
    left.push({
      x: points[i].x + normals[i].x * hw,
      y: points[i].y + normals[i].y * hw,
    });
    right.push({
      x: points[i].x - normals[i].x * hw,
      y: points[i].y - normals[i].y * hw,
    });
  }

  // SVG path: left edge forward → rounded head → right edge backward → rounded tail
  let d = `M ${fmt(left[0])}`;
  for (let i = 1; i < n; i++) {
    const prev = left[i - 1];
    const curr = left[i];
    const mid: Point = {x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2};
    d += ` Q ${fmt(prev)} ${fmt(mid)}`;
  }
  d += ` L ${fmt(left[n - 1])}`;

  d += capArc(
    points[n - 1],
    left[n - 1],
    right[n - 1],
    halfWidths[n - 1],
    dirs[n - 2],
  );

  for (let i = n - 2; i >= 0; i--) {
    const prev = right[i + 1];
    const curr = right[i];
    const mid: Point = {x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2};
    d += ` Q ${fmt(prev)} ${fmt(mid)}`;
  }
  d += ` L ${fmt(right[0])}`;

  d += capArc(
    points[0],
    right[0],
    left[0],
    halfWidths[0],
    {x: -dirs[0].x, y: -dirs[0].y},
  );

  d += ' Z';

  // Glow path is just the centreline smooth curve (used as a wide blurred stroke)
  let glowD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mid: Point = {x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2};
    glowD += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
  }
  glowD += ` L ${points[n - 1].x.toFixed(1)} ${points[n - 1].y.toFixed(1)}`;

  return {corePath: d, glowPath: glowD};
}

// Keep old export for any other callers
export function rebuildSmoothPath(points: Point[]): string {
  if (points.length < 2) {
    return '';
  }
  const first = points[0];
  let path = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  if (points.length === 2) {
    const second = points[1];
    return `${path} L ${second.x.toFixed(1)} ${second.y.toFixed(1)}`;
  }
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) * 0.5;
    const midY = (previous.y + current.y) * 0.5;
    path += ` Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}