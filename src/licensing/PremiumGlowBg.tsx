import {useEffect, useState} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const YELLOW_SOURCE = require('../../assets/Animation/yellow.png');
const MAROON_SOURCE = require('../../assets/Animation/maroon.png');

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');

const YELLOW_MS = 620;
const WAIT_AFTER_YELLOW_MS = 260;
const MAROON_MS = 1180;
const LOOP_PAUSE_MS = 500;
const BLOB_WIDTH_FRAC = 0.72;

type Props = {
  style?: StyleProp<ViewStyle>;
};

export function PremiumGlowBg({style}: Props) {
  const yellowP = useState(() => new Animated.Value(0))[0];
  const maroonP = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    yellowP.setValue(0);
    maroonP.setValue(0);

    const cycle = Animated.loop(
      Animated.sequence([
        Animated.timing(yellowP, {
          toValue: 1,
          duration: YELLOW_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(WAIT_AFTER_YELLOW_MS),
        Animated.timing(maroonP, {
          toValue: 1,
          duration: MAROON_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(LOOP_PAUSE_MS),
        Animated.parallel([
          Animated.timing(yellowP, {toValue: 0, duration: 0, useNativeDriver: true}),
          Animated.timing(maroonP, {toValue: 0, duration: 0, useNativeDriver: true}),
        ]),
      ]),
    );

    cycle.start();
    return () => cycle.stop();
  }, [maroonP, yellowP]);

  const yellowAsset = Image.resolveAssetSource(YELLOW_SOURCE);
  const maroonAsset = Image.resolveAssetSource(MAROON_SOURCE);

  const yellowW = SCREEN_W * BLOB_WIDTH_FRAC;
  const yellowH = yellowW * ((yellowAsset.height || 1) / (yellowAsset.width || 1));
  const maroonW = SCREEN_W * BLOB_WIDTH_FRAC;
  const maroonH = maroonW * ((maroonAsset.height || 1) / (maroonAsset.width || 1));

  const yellowX = yellowP.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_W * 0.08, SCREEN_W + yellowW * 0.1],
  });
  const yellowY = yellowP.interpolate({
    inputRange: [0, 1],
    outputRange: [-yellowH * 0.9, SCREEN_H * 0.54 - yellowH * 0.42],
  });
  const yellowOpacity = yellowP.interpolate({
    inputRange: [0, 0.06, 0.88, 1],
    outputRange: [0, 0.9, 0.9, 0],
  });

  const maroonX = maroonP.interpolate({
    inputRange: [0, 1],
    outputRange: [-maroonW * 0.12, SCREEN_W * 0.72 - maroonW * 0.48],
  });
  const maroonY = maroonP.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H - maroonH * 0.8, SCREEN_H * 0.46 - maroonH * 0.5],
  });
  const maroonScale = maroonP.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 0.9, 0.78],
  });
  const maroonOpacity = maroonP.interpolate({
    inputRange: [0, 0.05, 0.8, 1],
    outputRange: [0, 0.78, 0.78, 0],
  });

  return (
    <View style={[styles.host, style]} pointerEvents="none">
      <Animated.View
        style={[
          styles.blob,
          {
            width: yellowW,
            height: yellowH,
            opacity: yellowOpacity,
            transform: [{translateX: yellowX}, {translateY: yellowY}],
          },
        ]}>
        <Image
          source={YELLOW_SOURCE}
          style={{width: yellowW, height: yellowH}}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.blob,
          {
            width: maroonW,
            height: maroonH,
            opacity: maroonOpacity,
            transform: [{translateX: maroonX}, {translateY: maroonY}, {scale: maroonScale}],
          },
        ]}>
        <Image
          source={MAROON_SOURCE}
          style={{width: maroonW, height: maroonH}}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
