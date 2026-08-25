import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useKeyboardTheme} from '../KeyboardThemeContext';

const YELLOW_BLOB = require('../../../assets/blur/yellow.png');
const MAROON_BLOB = require('../../../assets/blur/maroon.png');
const ELLIPSE_BLOB = require('../../../assets/blur/Ellipse 59.png');

const LOOP_MS = 12000;

/** Extra room so soft blur edges are not clipped at the key grid bounds. */
export const FROSTED_BLOB_BLEED = {
  top: 18,
  bottom: 56,
  left: 16,
  right: 16,
} as const;

type FrostedKeyBackdropProps = {
  style?: StyleProp<ViewStyle>;
  /** Height of the visible key grid — tray matches this, blobs bleed past it. */
  contentHeight: number;
};

type Size = {
  width: number;
  height: number;
};

type DriftPath = 'yellow' | 'maroon' | 'ellipse';

type Point = {
  x: number;
  y: number;
};

type DriftConfig = {
  scale: number;
  opacity: number;
  zIndex: number;
  anchor: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  /** Normalized offsets from the anchor across one loop. */
  points: [Point, Point, Point, Point];
  /** Stagger so blobs visit the same screen area at different times. */
  phaseOffset: number;
};

/**
 * Each blob stays in its own lane so the glows do not stack on top of each other.
 * - Green: left column
 * - Yellow: top-right band
 * - Maroon: center-right vertical loop
 */
const DRIFT_PATHS: Record<DriftPath, DriftConfig> = {
  ellipse: {
    scale: 0.89,
    opacity: 0.9,
    zIndex: 1,
    anchor: {left: -0.16, top: -0.06},
    points: [
      {x: 0, y: 0},
      {x: 0.05, y: 0.46},
      {x: 0.02, y: 0.2},
      {x: 0, y: 0},
    ],
    phaseOffset: 0,
  },
  yellow: {
    scale: 0.77,
    opacity: 1,
    zIndex: 2,
    anchor: {right: -0.14, top: -0.06},
    points: [
      {x: 0, y: 0},
      {x: -0.18, y: 0.04},
      {x: -0.08, y: 0},
      {x: 0, y: 0},
    ],
    phaseOffset: 0.33,
  },
  maroon: {
    scale: 0.6,
    opacity: 1,
    zIndex: 3,
    anchor: {left: 0.36, top: -0.08},
    points: [
      {x: 0, y: 0},
      {x: 0, y: 0.5},
      {x: 0.12, y: 0.24},
      {x: 0, y: 0},
    ],
    phaseOffset: 0.66,
  },
};

const DriftingBlurBlob = React.memo(function DriftingBlurBlob({
  source,
  size,
  path,
}: {
  source: ImageSourcePropType;
  size: Size;
  path: DriftPath;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const config = DRIFT_PATHS[path];

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: LOOP_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    const startTimer = setTimeout(
      () => {
        animation.start();
      },
      config.phaseOffset * LOOP_MS,
    );
    return () => {
      clearTimeout(startTimer);
      animation.stop();
    };
  }, [config.phaseOffset, progress]);

  const blobWidth = size.width * config.scale;
  const blobHeight = size.height * config.scale;

  const anchorStyle: ViewStyle = {
    width: blobWidth,
    height: blobHeight,
    position: 'absolute',
  };

  if (config.anchor.left != null) {
    anchorStyle.left = config.anchor.left * size.width;
  }
  if (config.anchor.right != null) {
    anchorStyle.right = config.anchor.right * size.width;
  }
  if (config.anchor.top != null) {
    anchorStyle.top = config.anchor.top * size.height;
  }
  if (config.anchor.bottom != null) {
    anchorStyle.bottom = config.anchor.bottom * size.height;
  }

  const translateX = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: config.points.map(point => point.x * size.width) as [
      number,
      number,
      number,
      number,
    ],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: config.points.map(point => point.y * size.height) as [
      number,
      number,
      number,
      number,
    ],
  });

  return (
    <Animated.View
      style={[
        anchorStyle,
        {
          opacity: config.opacity,
          zIndex: config.zIndex,
          transform: [{translateX}, {translateY}],
        },
      ]}>
      <Image
        source={source}
        resizeMode="contain"
        fadeDuration={0}
        style={styles.blobImage}
      />
    </Animated.View>
  );
});

/**
 * Nothing key stack (bottom → top):
 * 1. Solid tray
 * 2. All three transparent blur PNGs drifting in separate lanes
 * 3. Frosted keys render in a sibling view above this layer
 */
export const FrostedKeyBackdrop = React.memo(function FrostedKeyBackdrop({
  style,
  contentHeight,
}: FrostedKeyBackdropProps) {
  const theme = useKeyboardTheme();
  const [size, setSize] = useState<Size>({width: 0, height: 0});

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) {
      return;
    }
    setSize(current =>
      current.width === width && current.height === height
        ? current
        : {width, height},
    );
  }, []);

  return (
    <View
      collapsable={false}
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.root, style]}>
      <View
        style={[
          styles.tray,
          {
            backgroundColor: theme.container,
            top: FROSTED_BLOB_BLEED.top,
            left: 0,
            right: 0,
            height: contentHeight,
          },
        ]}
      />

      {size.width > 0 && size.height > 0 ? (
        <View style={styles.blobField}>
          <DriftingBlurBlob source={ELLIPSE_BLOB} size={size} path="ellipse" />
          <DriftingBlurBlob source={YELLOW_BLOB} size={size} path="yellow" />
          <DriftingBlurBlob source={MAROON_BLOB} size={size} path="maroon" />
        </View>
      ) : null}
    </View>
  );
});

export function frostedKeyboardBlockHeight(
  keyHeight: number,
  keyRowMargin: number,
  extraRows = 0,
): number {
  const rows = 4 + extraRows;
  return keyHeight * rows + keyRowMargin * Math.max(0, rows - 1);
}

export function frostedKeyboardBackdropLayout(
  keyHeight: number,
  keyRowMargin: number,
  imeStripClearance: number,
  extraRows = 0,
) {
  const contentHeight = frostedKeyboardBlockHeight(
    keyHeight,
    keyRowMargin,
    extraRows,
  );

  return {
    contentHeight,
    backdropHeight:
      contentHeight + FROSTED_BLOB_BLEED.top + FROSTED_BLOB_BLEED.bottom,
    backdropBottom: imeStripClearance - FROSTED_BLOB_BLEED.bottom,
  };
}

const styles = StyleSheet.create({
  root: {
    overflow: 'visible',
  },
  tray: {
    position: 'absolute',
  },
  blobField: {
    ...StyleSheet.absoluteFill,
    overflow: 'visible',
  },
  blobImage: {
    width: '100%',
    height: '100%',
  },
});
