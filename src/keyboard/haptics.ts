import {keyboardBridge} from './keyboardBridge';

/** Fire haptic feedback immediately (no microtask deferral) for lowest latency. */
export function triggerKeyHaptic() {
  keyboardBridge.performKeyHaptic();
}

/** Deferred side effects for non-time-critical work (kept for compat). */
export function deferKeyboardSideEffect(run: () => void) {
  Promise.resolve().then(run);
}
