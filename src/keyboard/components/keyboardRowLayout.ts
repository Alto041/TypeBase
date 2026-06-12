import type {KeyDefinition} from '../layouts/qwerty';

export function isBackspaceKeyType(keyDef: KeyDefinition): boolean {
  return (
    keyDef.type === 'backspace' ||
    keyDef.type === 'enter-backspace' ||
    keyDef.type === 'numpad-back'
  );
}
