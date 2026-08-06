import {keyboardBridge} from './keyboardBridge';
import {isZeroLatencyModeActive} from './zeroLatencyMode';

type TriggerKeyHapticOptions = {
  /** Native fast path already committed this key (skip duplicate tap sound). */
  nativeCommitted?: boolean;
};

/**
 * Fire haptic + tap sound for a key press.
 * IME fires haptic on touch-down before React; this fills in tap sound / JS-only keys.
 */
export function triggerKeyHaptic(
  pointerId?: number,
  options?: TriggerKeyHapticOptions,
) {
  const frameHapticHandled =
    pointerId != null && keyboardBridge.consumeNativeHapticPointer(pointerId);

  if (!frameHapticHandled) {
    keyboardBridge.performLightKeyHaptic();
  }

  if (
    !isZeroLatencyModeActive() &&
    !frameHapticHandled &&
    !options?.nativeCommitted
  ) {
    keyboardBridge.playKeyTapSound();
  }
}

/** Deferred side effects for non-time-critical work (kept for compat). */
export function deferKeyboardSideEffect(run: () => void) {
  Promise.resolve().then(run);
}
