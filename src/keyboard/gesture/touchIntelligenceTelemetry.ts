export type TouchIntelligenceHitRecord = {
  id: string;
  at: number;
  localX: number;
  localY: number;
  geometricKeyId: string | null;
  geometricLetter: string | null;
  predictedKeyId: string | null;
  predictedLetter: string | null;
  committedLetter: string | null;
  reranked: boolean;
  appliedRerank: boolean;
  confidentFastPath: boolean;
  scoreMargin: number;
  msSinceLastTap: number;
  velocityPxPerSec: number;
  wordPrefix: string;
  previousKeyLetter: string | null;
  source: 'js' | 'native' | null;
};

export type TouchIntelligenceTelemetrySummary = {
  recordingEnabled: boolean;
  totalHits: number;
  rerankCandidates: number;
  appliedReranks: number;
  confidentFastPathHits: number;
  nativeCommits: number;
  jsCommits: number;
  mismatchCommits: number;
};

const MAX_RECORDS = 250;
let recordingEnabled = true;
let nextId = 1;
const records: TouchIntelligenceHitRecord[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setTouchIntelligenceRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
  notify();
}

export function isTouchIntelligenceRecordingEnabled(): boolean {
  return recordingEnabled;
}

export function subscribeTouchIntelligenceTelemetry(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearTouchIntelligenceHits(): void {
  records.length = 0;
  notify();
}

export function recordTouchIntelligenceAnalysis(
  analysis: Omit<
    TouchIntelligenceHitRecord,
    'id' | 'at' | 'committedLetter' | 'source'
  >,
): void {
  if (!recordingEnabled) {
    return;
  }

  const latest = records[0];
  if (
    latest &&
    Math.abs(latest.localX - analysis.localX) < 6 &&
    Math.abs(latest.localY - analysis.localY) < 6 &&
    Date.now() - latest.at < 80
  ) {
    return;
  }

  records.unshift({
    ...analysis,
    id: String(nextId++),
    at: Date.now(),
    committedLetter: analysis.predictedLetter,
    source: null,
  });

  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  notify();
}

export function annotateLastTouchIntelligenceCommit(
  committedLetter: string,
  source: 'js' | 'native',
  localX?: number,
  localY?: number,
): void {
  if (!recordingEnabled || records.length === 0) {
    return;
  }

  const record =
    localX != null && localY != null
      ? records.find(
          entry =>
            Math.abs(entry.localX - localX) < 8 &&
            Math.abs(entry.localY - localY) < 8,
        )
      : records[0];
  if (!record) {
    return;
  }

  const normalized = committedLetter.trim().toLowerCase();
  record.committedLetter =
    normalized.length === 1 ? normalized : committedLetter;
  record.source = source;

  notify();
}

export function getTouchIntelligenceHits(): TouchIntelligenceHitRecord[] {
  return [...records];
}

export function getTouchIntelligenceTelemetrySummary(): TouchIntelligenceTelemetrySummary {
  let rerankCandidates = 0;
  let appliedReranks = 0;
  let confidentFastPathHits = 0;
  let nativeCommits = 0;
  let jsCommits = 0;
  let mismatchCommits = 0;

  for (const record of records) {
    if (record.reranked) {
      rerankCandidates += 1;
    }
    if (record.appliedRerank) {
      appliedReranks += 1;
    }
    if (record.confidentFastPath) {
      confidentFastPathHits += 1;
    }
    if (record.source === 'native') {
      nativeCommits += 1;
    }
    if (record.source === 'js') {
      jsCommits += 1;
    }
    const predicted = record.predictedLetter?.toLowerCase() ?? null;
    const committed = record.committedLetter?.toLowerCase() ?? null;
    if (
      predicted &&
      committed &&
      predicted !== committed &&
      committed.length === 1
    ) {
      mismatchCommits += 1;
    }
  }

  return {
    recordingEnabled,
    totalHits: records.length,
    rerankCandidates,
    appliedReranks,
    confidentFastPathHits,
    nativeCommits,
    jsCommits,
    mismatchCommits,
  };
}
