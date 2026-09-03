import {keyboardBridge} from './keyboardBridge';
import {isZeroLatencyModeActive} from './zeroLatencyMode';

type TriggerKeyHapticOptions = {
  /** Native fast path already committed this key (skip duplicate tap sound). */
  nativeCommitted?: boolean;
};

/**
 * Fire haptic + tap sound for a key press.
 * Letter keys: native IME fires KEYBOARD_PRESS on touch-down before React.
 * This covers space, modifiers, and other Pressable keys.
 */
export function triggerKeyHaptic(
  pointerId?: number,
  options?: TriggerKeyHapticOptions,
) {
  const frameHapticHandled =
    pointerId != null && keyboardBridge.consumeNativeHapticPointer(pointerId);

  if (!frameHapticHandled) {
    if (isZeroLatencyModeActive()) {
      keyboardBridge.performSubtleKeyHaptic();
    } else {
      keyboardBridge.performKeyHaptic();
    }
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
