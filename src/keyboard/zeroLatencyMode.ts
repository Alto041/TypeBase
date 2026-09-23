import {keyboardBridge} from './keyboardBridge';

import {isLandscapeTypingProfile} from './landscapeTypingProfile';

let zeroLatencyModeActive = false;
let burstTypingActive = false;
let gamePerformanceModeActive = false;
let floatingKeyboardDragActive = false;

export function isFloatingKeyboardDragActive(): boolean {
  return floatingKeyboardDragActive;
}

export function setFloatingKeyboardDragActive(active: boolean): void {
  floatingKeyboardDragActive = active;
}

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

/** Skip press tint during zero-latency only (landscape keeps lightweight previews). */
export function shouldSkipKeyPressEffects(): boolean {
  return zeroLatencyModeActive;
}

/** Skip native popup/pressed chrome during zero-latency and landscape typing. */
export function shouldSkipKeyPreviewEffects(): boolean {
  return zeroLatencyModeActive || isLandscapeTypingProfile();
}

export function isGamePerformanceModeActive(): boolean {
  return gamePerformanceModeActive;
}

export function setGamePerformanceModeActive(active: boolean): void {
  gamePerformanceModeActive = active;
}

/** Skip touch-intel sync, AI preflight, and metrics during fast bursts / landscape. */
export function shouldDeferHeavyTypingSideEffects(): boolean {
  return (
    zeroLatencyModeActive ||
    gamePerformanceModeActive ||
    burstTypingActive ||
    floatingKeyboardDragActive ||
    isLandscapeTypingProfile()
  );
}

/** Skip live suggestion-bar React work during fast bursts and performance modes. */
export function shouldDeferLiveSuggestionBar(): boolean {
  return (
    zeroLatencyModeActive ||
    gamePerformanceModeActive ||
    burstTypingActive ||
    floatingKeyboardDragActive ||
    isLandscapeTypingProfile()
  );
}

export function shouldSkipFrostedKeyboardEffects(): boolean {
  return (
    zeroLatencyModeActive ||
    gamePerformanceModeActive ||
    floatingKeyboardDragActive ||
    isLandscapeTypingProfile()
  );
}

/** Skip touch-intel scoring, telemetry, and native context sync. */
export function shouldSkipTouchIntelligenceWork(): boolean {
  return (
    zeroLatencyModeActive ||
    gamePerformanceModeActive ||
    floatingKeyboardDragActive ||
    isLandscapeTypingProfile()
  );
}

/** Skip native prefix tracking and suggestion-bar bridge traffic. */
export function shouldSkipNativeSuggestionTracking(): boolean {
  return (
    zeroLatencyModeActive ||
    gamePerformanceModeActive ||
    floatingKeyboardDragActive ||
    isLandscapeTypingProfile()
  );
}
