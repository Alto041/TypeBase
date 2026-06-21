import {keyboardBridge} from './keyboardBridge';

let lastHapticAt = 0;
/** Minimum gap so rapid taps still get feedback without stacking native calls. */
const MIN_HAPTIC_GAP_MS = 8;

export function deferKeyboardSideEffect(run: () => void) {
  Promise.resolve().then(run);
}

export function triggerKeyHaptic() {
  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_GAP_MS) {
    return;
  }
  lastHapticAt = now;
  keyboardBridge.performKeyHaptic();
}
