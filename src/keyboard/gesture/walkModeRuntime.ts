/** Runtime Walk Mode state (feature toggle + live walking detection while keyboard is open). */

let featureEnabled = true;
let walkingActive = false;
const listeners = new Set<(active: boolean) => void>();

export function setWalkModeFeatureEnabled(enabled: boolean): void {
  featureEnabled = enabled;
  if (!enabled) {
    setWalkingActive(false);
  }
}

export function isWalkModeFeatureEnabled(): boolean {
  return featureEnabled;
}

export function setWalkingActive(active: boolean): void {
  if (!featureEnabled) {
    active = false;
  }
  if (active === walkingActive) {
    return;
  }
  walkingActive = active;
  for (const listener of listeners) {
    listener(walkingActive);
  }
}

export function isWalkingActive(): boolean {
  return featureEnabled && walkingActive;
}

/** True when walk offsets, slop, and typing profile should apply. */
export function isWalkModeTypingActive(): boolean {
  return isWalkingActive();
}

export function subscribeWalkModeTypingActive(
  listener: (active: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
