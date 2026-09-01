import AsyncStorage from '@react-native-async-storage/async-storage';

import {getPredictiveHitboxState} from './predictiveHitboxes';

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
  predictiveNeutralMode?: boolean;
  topPredictedLetter?: string | null;
  topExpansionKeyId?: string | null;
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
  predictiveActiveHits: number;
  neutralModeHits: number;
};

const STORAGE_KEY = '@typebase/touch_intelligence_hits_v1';
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
  nextId = 1;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  notify();
}

async function persistTouchIntelligenceRecord(
  record: TouchIntelligenceHitRecord,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const payload = raw
      ? (JSON.parse(raw) as {
          records?: TouchIntelligenceHitRecord[];
          nextId?: number;
        })
      : {records: [], nextId: 1};
    const merged = [record, ...(payload.records ?? [])].slice(0, MAX_RECORDS);
    const next = Math.max(payload.nextId ?? 1, Number(record.id) + 1);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({records: merged, nextId: next}),
    );
  } catch {
    // Telemetry must never block typing.
  }
}

export async function loadTouchIntelligenceHitsSnapshot(): Promise<{
  hits: TouchIntelligenceHitRecord[];
  summary: TouchIntelligenceTelemetrySummary;
}> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        hits: [],
        summary: summarizeTouchIntelligenceHits([]),
      };
    }
    const payload = JSON.parse(raw) as {
      records?: TouchIntelligenceHitRecord[];
    };
    const hits = Array.isArray(payload.records) ? payload.records : [];
    return {
      hits,
      summary: summarizeTouchIntelligenceHits(hits),
    };
  } catch {
    return {
      hits: [],
      summary: summarizeTouchIntelligenceHits([]),
    };
  }
}

export async function hydrateTouchIntelligenceHitsFromStorage(): Promise<void> {
  const snapshot = await loadTouchIntelligenceHitsSnapshot();
  records.length = 0;
  records.push(...snapshot.hits);
  const maxId = snapshot.hits.reduce(
    (max, hit) => Math.max(max, Number(hit.id) || 0),
    0,
  );
  nextId = Math.max(nextId, maxId + 1);
  notify();
}

export function recordTouchIntelligenceAnalysis(
  analysis: Omit<
    TouchIntelligenceHitRecord,
    'id' | 'at' | 'committedLetter' | 'source'
  > & {
    committedLetter?: string | null;
    source?: 'js' | 'native' | null;
  },
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
    committedLetter:
      analysis.committedLetter ?? analysis.predictedLetter ?? null,
    source: analysis.source ?? null,
  });

  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  void persistTouchIntelligenceRecord(records[0]);
  notify();
}

type NativeTouchIntelligenceHitPayload = {
  localX?: number;
  localY?: number;
  geometricKeyId?: string | null;
  geometricLetter?: string | null;
  predictedKeyId?: string | null;
  predictedLetter?: string | null;
  reranked?: boolean;
  appliedRerank?: boolean;
  confidentFastPath?: boolean;
  scoreMargin?: number;
  msSinceLastTap?: number;
  velocityPxPerSec?: number;
  wordPrefix?: string;
  previousKeyLetter?: string | null;
};

export function recordNativeTouchIntelligenceHit(
  payload: NativeTouchIntelligenceHitPayload,
): void {
  const predictedLetter =
    typeof payload.predictedLetter === 'string'
      ? payload.predictedLetter.trim().toLowerCase()
      : null;
  if (!predictedLetter || predictedLetter.length !== 1) {
    return;
  }

  const hitboxState = getPredictiveHitboxState();
  recordTouchIntelligenceAnalysis({
    localX: Number(payload.localX ?? 0),
    localY: Number(payload.localY ?? 0),
    geometricKeyId:
      typeof payload.geometricKeyId === 'string' ? payload.geometricKeyId : null,
    geometricLetter:
      typeof payload.geometricLetter === 'string'
        ? payload.geometricLetter
        : null,
    predictedKeyId:
      typeof payload.predictedKeyId === 'string' ? payload.predictedKeyId : null,
    predictedLetter,
    reranked: Boolean(payload.reranked),
    appliedRerank: Boolean(payload.appliedRerank),
    confidentFastPath: Boolean(payload.confidentFastPath),
    scoreMargin: Number(payload.scoreMargin ?? 0),
    msSinceLastTap: Number(payload.msSinceLastTap ?? -1),
    velocityPxPerSec: Number(payload.velocityPxPerSec ?? 0),
    wordPrefix:
      typeof payload.wordPrefix === 'string' ? payload.wordPrefix : '',
    previousKeyLetter:
      typeof payload.previousKeyLetter === 'string'
        ? payload.previousKeyLetter
        : null,
    predictiveNeutralMode: hitboxState.neutralMode,
    topPredictedLetter: hitboxState.topLetter,
    topExpansionKeyId: hitboxState.topExpansionKeyId,
    committedLetter: predictedLetter,
    source: 'native',
  });
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

  void persistTouchIntelligenceRecord(record);
  notify();
}

export function getTouchIntelligenceHits(): TouchIntelligenceHitRecord[] {
  return [...records];
}

export function summarizeTouchIntelligenceHits(
  hitRecords: readonly TouchIntelligenceHitRecord[],
): TouchIntelligenceTelemetrySummary {
  let rerankCandidates = 0;
  let appliedReranks = 0;
  let confidentFastPathHits = 0;
  let nativeCommits = 0;
  let jsCommits = 0;
  let mismatchCommits = 0;
  let predictiveActiveHits = 0;
  let neutralModeHits = 0;

  for (const record of hitRecords) {
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
    if (record.predictiveNeutralMode) {
      neutralModeHits += 1;
    } else if (record.topPredictedLetter) {
      predictiveActiveHits += 1;
    }
  }

  return {
    recordingEnabled,
    totalHits: hitRecords.length,
    rerankCandidates,
    appliedReranks,
    confidentFastPathHits,
    nativeCommits,
    jsCommits,
    mismatchCommits,
    predictiveActiveHits,
    neutralModeHits,
  };
}

export function getTouchIntelligenceTelemetrySummary(): TouchIntelligenceTelemetrySummary {
  return summarizeTouchIntelligenceHits(records);
}
