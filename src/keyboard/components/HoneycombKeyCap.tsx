import React from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Polygon} from 'react-native-svg';
import {flatTopHexPoints} from './honeycombLetterLayout';

type HoneycombKeyCapProps = {
  height: number;
  fill: string;
  stroke: string;
  onLayoutWidth?: (width: number) => void;
  children: React.ReactNode;
};

export function HoneycombKeyCap({
  height,
  fill,
  stroke,
  onLayoutWidth,
  children,
}: HoneycombKeyCapProps) {
  const [width, setWidth] = React.useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) {
      setWidth(next);
      onLayoutWidth?.(next);
    }
  };

  return (
    <View
      style={[styles.wrap, {minHeight: height}]}
      onLayout={handleLayout}>
      {width > 0 ? (
        <Svg
          width={width}
          height={height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none">
          <Polygon
            points={flatTopHexPoints(width, height)}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
          />
        </Svg>
      ) : null}
      <View style={[styles.content, {minHeight: height}]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
