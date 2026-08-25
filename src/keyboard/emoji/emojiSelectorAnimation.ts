import {Animated} from 'react-native';

const SELECTOR_SPRING = {
  tension: 260,
  friction: 26,
  useNativeDriver: true,
} as const;

export function animateSelectorTranslate(
  value: Animated.Value,
  toValue: number,
): void {
  value.stopAnimation();
  Animated.spring(value, {
    ...SELECTOR_SPRING,
    toValue,
  }).start();
}
