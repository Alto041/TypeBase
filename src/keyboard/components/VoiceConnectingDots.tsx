import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';

type VoiceConnectingDotsProps = {
  size?: number;
  color?: string;
};

export function VoiceConnectingDots({
  size = 20,
  color = '#000000',
}: VoiceConnectingDotsProps) {
  const dotSize = Math.max(2.5, size * 0.2);
  const gap = Math.max(2, size * 0.14);
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.28))).current;

  useEffect(() => {
    const loops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, {
            toValue: 1,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.28,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach(loop => loop.start());
    return () => {
      loops.forEach(loop => loop.stop());
    };
  }, [dots]);

  return (
    <View style={[styles.slot, {width: size, height: size}]}>
      <View style={[styles.row, {gap}]}>
        {dots.map((opacity, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: color,
                opacity,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {},
});
