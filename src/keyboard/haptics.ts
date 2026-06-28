import {keyboardBridge} from './keyboardBridge';

export function deferKeyboardSideEffect(run: () => void) {
  Promise.resolve().then(run);
}

export function triggerKeyHaptic() {
  keyboardBridge.performKeyHaptic();
}
