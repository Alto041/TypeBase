/** Hidden debug counters for Walk Mode A/B (wrong-key proxy: geometric ≠ committed letter). */

let debugCompareEnabled = false;
let withWalkFixes = 0;
let withoutWalkWouldMiss = 0;
let samplesWithWalk = 0;
let samplesControl = 0;

export function setWalkModeDebugCompare(enabled: boolean): void {
  debugCompareEnabled = enabled;
  if (!enabled) {
    withWalkFixes = 0;
    withoutWalkWouldMiss = 0;
    samplesWithWalk = 0;
    samplesControl = 0;
  }
}

export function isWalkModeDebugCompareEnabled(): boolean {
  return debugCompareEnabled;
}

export function recordWalkModeDebugTap(options: {
  geometricLetter: string | null;
  committedLetter: string;
  rerankedWhileWalking: boolean;
  walkingActive: boolean;
}): void {
  if (!debugCompareEnabled) {
    return;
  }
  const geo = options.geometricLetter?.toLowerCase() ?? '';
  const committed = options.committedLetter.toLowerCase();
  if (!geo || geo === committed) {
    return;
  }
  if (options.walkingActive) {
    samplesWithWalk += 1;
    if (options.rerankedWhileWalking) {
      withWalkFixes += 1;
    }
  } else {
    samplesControl += 1;
    withoutWalkWouldMiss += 1;
  }
}

export function getWalkModeDebugSummary(): {
  withWalkFixes: number;
  neighborSlipsWhileStill: number;
  samplesWithWalk: number;
  samplesControl: number;
} {
  return {
    withWalkFixes,
    neighborSlipsWhileStill: withoutWalkWouldMiss,
    samplesWithWalk,
    samplesControl,
  };
}
