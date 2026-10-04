import {buildTapDriftPoints, convexHull, hullPath} from './tapMapDriftVisual';

describe('tapMapDriftVisual', () => {
  it('builds a closed hull path from drift endpoints', () => {
    const layouts = [
      {letter: 'a', centerX: 20, centerY: 20, keyWidth: 10, keyHeight: 12},
      {letter: 's', centerX: 40, centerY: 20, keyWidth: 10, keyHeight: 12},
      {letter: 'd', centerX: 60, centerY: 20, keyWidth: 10, keyHeight: 12},
    ];
    const letters = {
      a: {dx: 4, dy: -2, samples: 5},
      s: {dx: 0, dy: 5, samples: 6},
      d: {dx: -5, dy: 1, samples: 4},
    };
    const points = buildTapDriftPoints(letters, layouts, 1);
    expect(points).toHaveLength(3);
    const hull = convexHull(points.map(p => ({x: p.endX, y: p.endY})));
    expect(hull.length).toBeGreaterThanOrEqual(3);
    expect(hullPath(hull)).toMatch(/^M .+ Z$/);
  });
});
