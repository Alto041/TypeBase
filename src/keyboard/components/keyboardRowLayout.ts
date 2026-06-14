import type {KeyDefinition} from '../layouts/qwerty';

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
