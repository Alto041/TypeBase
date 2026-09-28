import type {KeyDefinition} from './layouts/qwerty';

/** True while compact native session is armed (letters commit in Kotlin, RN touches skipped). */
let compactNativeTypingActive = false;

export function setCompactNativeTypingActive(active: boolean): void {
  compactNativeTypingActive = active;
}

export function isCompactNativeTypingActive(): boolean {
  return compactNativeTypingActive;
}

/** Keys that use pointerEvents none — only letter keys (IME already blocks RN on native hit). */
export function isKeyHandledByCompactNative(keyDef: KeyDefinition): boolean {
  const value = keyDef.value ?? '';
  return value.length === 1 && /[a-z]/i.test(value);
}

export function compactNativeBlocksKeyTouches(
  keyDef: KeyDefinition,
  sessionActive: boolean,
): boolean {
  return sessionActive && isKeyHandledByCompactNative(keyDef);
}
