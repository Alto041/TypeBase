import {keyboardBridge} from './keyboardBridge';

let zeroLatencyModeActive = false;
let burstTypingActive = false;

export function isZeroLatencyModeActive(): boolean {
  return zeroLatencyModeActive;
}

export function setZeroLatencyModeActive(active: boolean): void {
  zeroLatencyModeActive = active;
  if (active) {
    burstTypingActive = false;
  }
}

export function isBurstTypingActive(): boolean {
  return burstTypingActive;
}

/** Tracks fast typing for suggestion/AI deferral only — never affects previews. */
export function setBurstTypingActive(active: boolean): void {
  burstTypingActive = active;
}

/** Only explicit user zero-latency mode disables previews and press tint. */
export function shouldSkipKeyPressEffects(): boolean {
  return zeroLatencyModeActive;
}

export function shouldSkipKeyPreviewEffects(): boolean {
  return zeroLatencyModeActive;
}
