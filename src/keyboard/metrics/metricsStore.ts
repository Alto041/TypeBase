import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  MetricsDayBucket,
  MetricsLifetime,
  MetricsSnapshot,
  MetricsState,
} from './types';

const STORAGE_KEY = '@typebase/keyboard_telemetry_v1';
const IDLE_GAP_MS = 3_000;
const MAX_DAY_BUCKETS = 21;

const EMPTY_LIFETIME: MetricsLifetime = {
  keystrokes: 0,
  characters: 0,
  words: 0,
  corrections: 0,
  charsSaved: 0,
  backspaces: 0,
  activeMs: 0,
  sessions: 0,
};

function todayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyDay(date: string): MetricsDayBucket {
  return {
    date,
    keystrokes: 0,
    characters: 0,
    words: 0,
    corrections: 0,
    charsSaved: 0,
    backspaces: 0,
    activeMs: 0,
    sessions: 0,
  };
}

function emptyState(): MetricsState {
  return {lifetime: {...EMPTY_LIFETIME}, days: {}};
}

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeState(raw: Partial<MetricsState> | null | undefined): MetricsState {
  const lifetime = {...EMPTY_LIFETIME, ...(raw?.lifetime ?? {})};
  const days: Record<string, MetricsDayBucket> = {};
  const rawDays = raw?.days ?? {};
  for (const [key, bucket] of Object.entries(rawDays)) {
    if (!bucket || typeof bucket !== 'object') {
      continue;
    }
    days[key] = {...emptyDay(key), ...bucket, date: key};
  }
  return {lifetime, days};
}

function pruneDays(days: Record<string, MetricsDayBucket>): Record<string, MetricsDayBucket> {
  const keys = Object.keys(days).sort();
  if (keys.length <= MAX_DAY_BUCKETS) {
    return days;
  }
  const keep = keys.slice(-MAX_DAY_BUCKETS);
  const next: Record<string, MetricsDayBucket> = {};
  for (const key of keep) {
    next[key] = days[key];
  }
  return next;
}

function wpmFrom(characters: number, activeMs: number): number {
  const minutes = activeMs / 60_000;
  if (minutes < 0.05 || characters < 5) {
    return 0;
  }
  return Math.round(characters / 5 / minutes);
}

function accuracyFrom(words: number, corrections: number): number {
  const total = words + corrections;
  if (total <= 0) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round((100 * words) / total)));
}

/** Rough edit distance for "chars saved / fixed" by a correction. */
export function correctionCharDelta(original: string, correction: string): number {
  const a = original.toLowerCase();
  const b = correction.toLowerCase();
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return b.length;
  }
  if (!b) {
    return a.length;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) {
    dp[j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return Math.max(1, dp[b.length]);
}

let cached: MetricsState = emptyState();
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityAt = 0;
let sessionOpen = false;

async function persistSoon(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached)).catch(() => {
      /* ignore */
    });
  }, 400);
}

function touchActiveTime(now = Date.now()): void {
  if (lastActivityAt > 0) {
    const gap = now - lastActivityAt;
    if (gap > 0 && gap < IDLE_GAP_MS) {
      const day = ensureToday(now);
      day.activeMs += gap;
      cached.lifetime.activeMs += gap;
    }
  }
  lastActivityAt = now;
}

function ensureToday(now = Date.now()): MetricsDayBucket {
  const key = todayKey(now);
  let day = cached.days[key];
  if (!day) {
    day = emptyDay(key);
    cached.days[key] = day;
    cached.days = pruneDays(cached.days);
  }
  return day;
}

export function resetMetricsCache(): void {
  loadPromise = null;
  cached = emptyState();
  lastActivityAt = 0;
  sessionOpen = false;
}

export async function ensureMetricsLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        cached = normalizeState(JSON.parse(raw) as Partial<MetricsState>);
      } else {
        cached = emptyState();
      }
    } catch {
      cached = emptyState();
    }
  })();
  try {
    await loadPromise;
  } catch {
    cached = emptyState();
    loadPromise = null;
  }
}

/** Call when the IME becomes interactive for the user. */
export function recordMetricsSessionStart(): void {
  void ensureMetricsLoaded().then(() => {
    if (sessionOpen) {
      return;
    }
    sessionOpen = true;
    const now = Date.now();
    const day = ensureToday(now);
    day.sessions += 1;
    cached.lifetime.sessions += 1;
    lastActivityAt = now;
    void persistSoon();
  });
}

export function recordKeystroke(kind: 'char' | 'backspace' | 'other' = 'other'): void {
  void ensureMetricsLoaded().then(() => {
    const now = Date.now();
    touchActiveTime(now);
    const day = ensureToday(now);
    day.keystrokes += 1;
    cached.lifetime.keystrokes += 1;
    if (kind === 'char') {
      day.characters += 1;
      cached.lifetime.characters += 1;
    } else if (kind === 'backspace') {
      day.backspaces += 1;
      cached.lifetime.backspaces += 1;
    }
    void persistSoon();
  });
}

export function recordWordCommitted(): void {
  void ensureMetricsLoaded().then(() => {
    const now = Date.now();
    touchActiveTime(now);
    const day = ensureToday(now);
    day.words += 1;
    cached.lifetime.words += 1;
    void persistSoon();
  });
}

export function recordAutocorrectCorrection(
  original: string,
  correction: string,
): void {
  if (!original || original === correction) {
    return;
  }
  void ensureMetricsLoaded().then(() => {
    const now = Date.now();
    touchActiveTime(now);
    const day = ensureToday(now);
    const saved = correctionCharDelta(original, correction);
    day.corrections += 1;
    day.charsSaved += saved;
    cached.lifetime.corrections += 1;
    cached.lifetime.charsSaved += saved;
    void persistSoon();
  });
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const day = cached.days[todayKey()] ?? emptyDay(todayKey());
  const lifetime = cached.lifetime;
  return {
    today: {...day},
    lifetime: {...lifetime},
    wpmToday: wpmFrom(day.characters, day.activeMs),
    wpmLifetime: wpmFrom(lifetime.characters, lifetime.activeMs),
    accuracyToday: accuracyFrom(day.words, day.corrections),
    accuracyLifetime: accuracyFrom(lifetime.words, lifetime.corrections),
    avgSessionMinToday:
      day.sessions > 0
        ? Math.round((day.activeMs / day.sessions / 60_000) * 10) / 10
        : 0,
  };
}

export async function loadMetricsSnapshot(): Promise<MetricsSnapshot> {
  await ensureMetricsLoaded();
  // Flush any pending active-time slice.
  touchActiveTime(Date.now());
  return getMetricsSnapshot();
}

export async function resetMetricsData(): Promise<void> {
  cached = emptyState();
  lastActivityAt = 0;
  sessionOpen = false;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
}

export function formatActiveDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  if (m > 0) {
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return `${s}s`;
}

export function formatCompactNumber(value: number): string {
  const n = clampNonNeg(value);
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}
