import type {KeyDefinition} from '../layouts/qwerty';
import type {StyleProp, ViewStyle} from 'react-native';

export function isBackspaceKeyType(keyDef: KeyDefinition): boolean {
  return (
    keyDef.type === 'backspace' ||
    keyDef.type === 'enter-backspace' ||
    keyDef.type === 'numpad-back'
  );
}

/** Comma/period use Pressable long-press gestures — never multi-touch dispatch. */
export function isGesturePunctuationKey(keyDef: KeyDefinition): boolean {
  return keyDef.type === 'comma' || keyDef.type === 'period';
}

const keyFlexStyleCache = new Map<number, ViewStyle>();

/** Stable flex wrapper per key — avoids re-rendering every letter key on each keystroke. */
export function keyFlexStyle(flex: number): StyleProp<ViewStyle> {
  const rounded = flex ?? 1;
  let style = keyFlexStyleCache.get(rounded);
  if (!style) {
    style = {flex: rounded, minWidth: 0};
    keyFlexStyleCache.set(rounded, style);
  }
  return style;
}
