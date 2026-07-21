/** Daily keyboard telemetry bucket (local calendar day). */
export type MetricsDayBucket = {
  date: string;
  keystrokes: number;
  characters: number;
  words: number;
  corrections: number;
  charsSaved: number;
  backspaces: number;
  activeMs: number;
  sessions: number;
};

export type MetricsLifetime = {
  keystrokes: number;
  characters: number;
  words: number;
  corrections: number;
  charsSaved: number;
  backspaces: number;
  activeMs: number;
  sessions: number;
};

export type MetricsState = {
  lifetime: MetricsLifetime;
  days: Record<string, MetricsDayBucket>;
};

/** Computed snapshot for the Telemetry panel. */
export type MetricsSnapshot = {
  today: MetricsDayBucket;
  lifetime: MetricsLifetime;
  wpmToday: number;
  wpmLifetime: number;
  accuracyToday: number;
  accuracyLifetime: number;
  avgSessionMinToday: number;
};
