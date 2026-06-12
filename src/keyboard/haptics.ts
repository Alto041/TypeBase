import {keyboardBridge} from './keyboardBridge';

let lastHapticAt = 0;
const MIN_HAPTIC_GAP_MS = 45;

export function triggerKeyHaptic() {
  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_GAP_MS) {
    return;
  }
  lastHapticAt = now;
  keyboardBridge.performKeyHaptic();
}
