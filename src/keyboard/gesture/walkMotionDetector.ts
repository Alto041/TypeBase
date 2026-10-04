/**
 * On-device step-rhythm detector fed by low-rate accelerometer samples from native IME.
 * Kept in sync with WalkMotionDetector.kt thresholds.
 */

const SAMPLE_INTERVAL_MS = 100;
const MIN_PEAK_MAGNITUDE = 0.18;
const MIN_PEAK_DELTA = 0.13;
const PEAK_SHOULDER = 0.07;
const MIN_MEAN_PEAK_MAGNITUDE = 0.2;
const HISTORY_MS = 6000;
const PEAK_WINDOW_MS = 5200;
const MIN_PEAKS_TO_ENTER = 6;
const MIN_RHYTHM_SPAN_MS = 2200;
const RECENT_PEAK_MS = 2200;
const MIN_PEAK_INTERVAL_MS = 450;
const MAX_PEAK_INTERVAL_MS = 2600;
const MAX_STEP_HZ = 2.5;
const MAX_INTERVAL_CV = 0.32;
const STILL_BEFORE_EXIT_MS = 900;
const EXIT_WALK_MS = 1600;
const TYPING_SUPPRESS_ENTER_MS = 2800;

export type WalkMotionSample = {
  timestampMs: number;
  magnitude: number;
};

let walkModeFeatureEnabled = true;
let walkingActive = false;
const listeners = new Set<(active: boolean) => void>();

const magnitudeHistory: Array<{t: number; v: number}> = [];
const peakSamples: Array<{t: number; magnitude: number}> = [];
let lastPeakAt = 0;
let lastRhythmPeakAt = 0;
let stillSinceAt = 0;
let suppressEnterUntilMs = 0;

function notifyWalking(active: boolean): void {
  if (active === walkingActive) {
    return;
  }
  walkingActive = active;
  for (const listener of listeners) {
    listener(active);
  }
}

function trimHistory(now: number): void {
  while (magnitudeHistory.length > 0 && now - magnitudeHistory[0]!.t > HISTORY_MS) {
    magnitudeHistory.shift();
  }
}

function trimPeakWindow(now: number): void {
  while (peakSamples.length > 0 && now - peakSamples[0]!.t > PEAK_WINDOW_MS) {
    peakSamples.shift();
  }
}

function peakIntervalAllows(now: number): boolean {
  if (lastPeakAt <= 0) {
    return true;
  }
  const interval = now - lastPeakAt;
  if (interval < MIN_PEAK_INTERVAL_MS) {
    return false;
  }
  const hz = 1000 / interval;
  if (hz > MAX_STEP_HZ) {
    return false;
  }
  if (interval > MAX_PEAK_INTERVAL_MS) {
    peakSamples.length = 0;
  }
  return true;
}

function registerPeak(now: number, peakMagnitude: number): boolean {
  if (!peakIntervalAllows(now)) {
    return false;
  }
  lastPeakAt = now;
  lastRhythmPeakAt = now;
  peakSamples.push({t: now, magnitude: peakMagnitude});
  trimPeakWindow(now);
  stillSinceAt = 0;
  return true;
}

function recentPeakMagnitudes(): number[] {
  if (peakSamples.length < MIN_PEAKS_TO_ENTER) {
    return [];
  }
  return peakSamples.slice(-MIN_PEAKS_TO_ENTER).map(sample => sample.magnitude);
}

function peakIntervalsRegular(): boolean {
  if (peakSamples.length < MIN_PEAKS_TO_ENTER) {
    return false;
  }
  const intervals: number[] = [];
  for (let i = 1; i < peakSamples.length; i += 1) {
    intervals.push(peakSamples[i]!.t - peakSamples[i - 1]!.t);
  }
  if (intervals.length === 0) {
    return false;
  }
  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  if (mean < MIN_PEAK_INTERVAL_MS || mean > MAX_PEAK_INTERVAL_MS) {
    return false;
  }
  let variance = 0;
  for (const interval of intervals) {
    const delta = interval - mean;
    variance += delta * delta;
  }
  variance /= intervals.length;
  const stdDev = Math.sqrt(variance);
  return stdDev <= mean * MAX_INTERVAL_CV;
}

function detectClassicPeak(now: number, magnitude: number): boolean {
  const n = magnitudeHistory.length;
  if (n < 3) {
    return false;
  }
  const before = magnitudeHistory[n - 3]!.v;
  const peak = magnitudeHistory[n - 2]!.v;
  const after = magnitudeHistory[n - 1]!.v;
  if (peak < MIN_PEAK_MAGNITUDE) {
    return false;
  }
  if (peak <= before + MIN_PEAK_DELTA) {
    return false;
  }
  if (after >= peak - PEAK_SHOULDER) {
    return false;
  }
  if (magnitude >= peak - PEAK_SHOULDER) {
    return false;
  }
  return registerPeak(now, peak);
}

function shouldEnterWalk(now: number): boolean {
  if (now < suppressEnterUntilMs) {
    return false;
  }
  trimPeakWindow(now);
  if (peakSamples.length < MIN_PEAKS_TO_ENTER) {
    return false;
  }
  const first = peakSamples[0]!.t;
  const last = peakSamples[peakSamples.length - 1]!.t;
  if (last - first < MIN_RHYTHM_SPAN_MS) {
    return false;
  }
  if (now - last > RECENT_PEAK_MS) {
    return false;
  }
  const mags = recentPeakMagnitudes();
  if (mags.length < MIN_PEAKS_TO_ENTER) {
    return false;
  }
  const meanMag = mags.reduce((sum, v) => sum + v, 0) / mags.length;
  if (meanMag < MIN_MEAN_PEAK_MAGNITUDE) {
    return false;
  }
  return peakIntervalsRegular();
}

export function resetWalkMotionDetector(): void {
  magnitudeHistory.length = 0;
  peakSamples.length = 0;
  lastPeakAt = 0;
  lastRhythmPeakAt = 0;
  stillSinceAt = 0;
  suppressEnterUntilMs = 0;
  notifyWalking(false);
}

/** Mirrors native typing suppress — clears peaks while seated and typing. */
export function noteWalkModeTypingActivity(now: number = Date.now()): void {
  suppressEnterUntilMs = now + TYPING_SUPPRESS_ENTER_MS;
  if (!walkingActive) {
    peakSamples.length = 0;
    lastPeakAt = 0;
  }
}

export function setWalkModeFeatureEnabled(enabled: boolean): void {
  walkModeFeatureEnabled = enabled;
  if (!enabled) {
    resetWalkMotionDetector();
  }
}

export function isWalkModeFeatureEnabled(): boolean {
  return walkModeFeatureEnabled;
}

export function isWalkingActive(): boolean {
  return walkModeFeatureEnabled && walkingActive;
}

export function subscribeWalkingActive(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ingestWalkMotionSample(sample: WalkMotionSample): void {
  if (!walkModeFeatureEnabled) {
    return;
  }
  const now = sample.timestampMs;
  magnitudeHistory.push({t: now, v: sample.magnitude});
  trimHistory(now);

  detectClassicPeak(now, sample.magnitude);

  if (!walkingActive) {
    if (shouldEnterWalk(now)) {
      notifyWalking(true);
    }
    return;
  }

  if (now - lastRhythmPeakAt > STILL_BEFORE_EXIT_MS) {
    if (stillSinceAt === 0) {
      stillSinceAt = now;
    } else if (now - stillSinceAt >= EXIT_WALK_MS) {
      peakSamples.length = 0;
      lastPeakAt = 0;
      stillSinceAt = 0;
      notifyWalking(false);
    }
  } else {
    stillSinceAt = 0;
  }
}

export const WALK_MOTION_SAMPLE_INTERVAL_MS = SAMPLE_INTERVAL_MS;
