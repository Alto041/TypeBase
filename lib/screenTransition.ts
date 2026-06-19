import {useCallback, useRef} from 'react';
import {Animated, type ViewStyle} from 'react-native';

const EXIT_MS = 170;
const ENTER_MS = 240;
const SLIDE_OUT = 32;
const SLIDE_IN = 32;

const ENTER_SPRING = {
  damping: 24,
  stiffness: 290,
  mass: 0.75,
  useNativeDriver: true as const,
};

export function useScreenTransition() {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const transitionTo = useCallback(
    (apply: () => void) => {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SLIDE_OUT,
          duration: EXIT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_MS,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (!finished) {
          return;
        }
        apply();
        translateX.setValue(SLIDE_IN);
        opacity.setValue(0);
        Animated.parallel([
          Animated.spring(translateX, {...ENTER_SPRING, toValue: 0}),
          Animated.timing(opacity, {
            toValue: 1,
            duration: ENTER_MS,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [opacity, translateX],
  );

  const animatedStyle: Animated.WithAnimatedValue<ViewStyle> = {
    flex: 1,
    opacity,
    transform: [{translateX}],
  };

  return {animatedStyle, transitionTo};
}
