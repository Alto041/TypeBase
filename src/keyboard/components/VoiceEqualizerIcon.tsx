import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import GraphicEqIcon from '../../../assets/graphic_eq.svg';
import {keyboardTheme} from '../theme';

const BAR_WIDTH = 2.4;
const BAR_GAP = 2;
const BAR_RADIUS = 1;

const BARS = [
  {maxHeight: 10, min: 0.72, peak: 0.88, duration: 320, delay: 0},
  {maxHeight: 17, min: 0.3, peak: 1, duration: 410, delay: 70},
  {maxHeight: 22, min: 0.25, peak: 1, duration: 290, delay: 140},
  {maxHeight: 17, min: 0.3, peak: 1, duration: 380, delay: 35},
  {maxHeight: 10, min: 0.72, peak: 0.88, duration: 340, delay: 105},
] as const;

const SLOT_HEIGHT = Math.max(...BARS.map(bar => bar.maxHeight));

type VoiceEqualizerIconProps = {
  active: boolean;
  size?: number;
  color?: string;
};

export function VoiceEqualizerIcon({
  active,
  size = 22,
  color = keyboardTheme.suggestionDivider,
}: VoiceEqualizerIconProps) {
  const anims = useRef(BARS.map(bar => new Animated.Value(bar.min))).current;

  useEffect(() => {
    if (!active) {
      anims.forEach((anim, index) => {
        anim.setValue(BARS[index].min);
      });
      return;
    }

    const loops = anims.map((anim, index) => {
      const {min, peak, duration, delay} = BARS[index];
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: peak,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: min,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    });

    loops.forEach(loop => loop.start());
    return () => {
      loops.forEach(loop => loop.stop());
    };
  }, [active, anims]);

  if (!active) {
    return <GraphicEqIcon width={size} height={size} fill={color} />;
  }

  return (
    <View style={[styles.container, {width: size, height: size}]}>
      {anims.map((anim, index) => {
        const {maxHeight} = BARS[index];

        return (
          <View
            key={index}
            style={[
              styles.barSlot,
              {
                height: SLOT_HEIGHT,
                marginLeft: index > 0 ? BAR_GAP : 0,
              },
            ]}>
            <Animated.View
              style={[
                styles.bar,
                {
                  width: BAR_WIDTH,
                  height: maxHeight,
                  backgroundColor: color,
                  transform: [{scaleY: anim}],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barSlot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bar: {
    borderRadius: BAR_RADIUS,
  },
});
