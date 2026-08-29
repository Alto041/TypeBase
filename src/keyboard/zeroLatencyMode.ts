import {keyboardBridge} from './keyboardBridge';

let zeroLatencyModeActive = false;
let burstTypingActive = false;
let gamePerformanceModeActive = false;

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

/** Only explicit user zero-latency disables previews and press tint. */
export function shouldSkipKeyPressEffects(): boolean {
  return zeroLatencyModeActive;
}

export function shouldSkipKeyPreviewEffects(): boolean {
  return zeroLatencyModeActive;
}

export function isGamePerformanceModeActive(): boolean {
  return gamePerformanceModeActive;
}

export function setGamePerformanceModeActive(active: boolean): void {
  gamePerformanceModeActive = active;
}

/** Skip touch-intel sync, AI preflight, and metrics during fast bursts. */
export function shouldDeferHeavyTypingSideEffects(): boolean {
  return (
    zeroLatencyModeActive || gamePerformanceModeActive || burstTypingActive
  );
}

/** Only explicit performance modes disable live suggestion-bar updates. */
export function shouldDeferLiveSuggestionBar(): boolean {
  return zeroLatencyModeActive || gamePerformanceModeActive;
}

export function shouldSkipFrostedKeyboardEffects(): boolean {
  return zeroLatencyModeActive;
}
