import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';

import type {TapMapEntry} from './tapMap';
import {
  buildLetterKeyLayouts,
  buildTapDriftPoints,
  hullPath,
  maxRowWidth,
  trayHeight,
} from './tapMapDriftVisual';

type TapDriftOutlineGraphProps = {
  rows: ReadonlyArray<ReadonlyArray<string>>;
  letters: Record<string, TapMapEntry>;
  /** Scales stored px offsets into the preview (matches tap map bubbles). */
  offsetScale?: number;
  width: number;
  keyWidth?: number;
  keyHeight?: number;
  gap?: number;
  padding?: number;
};

const C = {
  border: '#e8e8ea',
  sub: '#b0b0b5',
  green: '#2CC642',
  greenSoft: 'rgba(44, 198, 66, 0.12)',
} as const;

export function TapDriftOutlineGraph({
  rows,
  letters,
  offsetScale = 0.65,
  width,
  keyWidth = 28,
  keyHeight = 32,
  gap = 5,
  padding = 10,
}: TapDriftOutlineGraphProps) {
  const layout = useMemo(() => {
    const keyLayouts = buildLetterKeyLayouts(rows, keyWidth, keyHeight, gap);
    const driftPoints = buildTapDriftPoints(letters, keyLayouts, offsetScale);
    const innerW = maxRowWidth(rows, keyWidth, gap);
    const innerH = trayHeight(rows.length, keyHeight, gap);
    const svgW = innerW + padding * 2;
    const svgH = innerH + padding * 2;
    const scale = width > 0 ? width / svgW : 1;
    const hull = hullPath(driftPoints.map(p => ({x: p.endX + padding, y: p.endY + padding})));
    return {
      keyLayouts,
      driftPoints,
      svgW,
      svgH,
      scale,
      hull,
    };
  }, [rows, letters, offsetScale, keyWidth, keyHeight, gap, padding, width]);

  const height = layout.svgH * layout.scale;

  return (
    <View style={[styles.wrap, {width, height}]}>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}>
        {layout.keyLayouts.map(key => {
          const x = key.centerX - key.keyWidth / 2 + padding;
          const y = key.centerY - key.keyHeight / 2 + padding;
          const r = Math.round(key.keyHeight * 0.26);
          return (
            <Rect
              key={`std-${key.letter}`}
              x={x}
              y={y}
              width={key.keyWidth}
              height={key.keyHeight}
              rx={r}
              ry={r}
              fill="none"
              stroke={C.border}
              strokeWidth={1}
            />
          );
        })}

        {layout.hull ? (
          <Path
            d={layout.hull}
            fill={C.greenSoft}
            stroke={C.green}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ) : null}

        {layout.driftPoints.map(point => {
          const cx = point.centerX + padding;
          const cy = point.centerY + padding;
          const ex = point.endX + padding;
          const ey = point.endY + padding;
          return (
            <React.Fragment key={`drift-${point.letter}`}>
              <Line
                x1={cx}
                y1={cy}
                x2={ex}
                y2={ey}
                stroke={C.sub}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <Circle cx={ex} cy={ey} r={2.6} fill={C.green} />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
});
