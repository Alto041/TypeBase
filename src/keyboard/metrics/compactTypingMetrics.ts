import {DeviceEventEmitter, Platform} from 'react-native';

/**
 * Release APK manual checklist (compact native typing):
 * - Type a sentence: nativeCommits + reactTouchBlocks rise (Engine Stats / compactTypingMetrics)
 * - fastPathConfigPublishes stays low during sentence
 * - Space autocorrect after rotate
 * - Shift mid-word + shift-off stickiness
 * - Backspace hold/repeat
 * - Zero-latency toggle still works
 * - TypeLift runs only after typing pause (no jank while bursting keys)
 */

import {keyboardBridge} from '../keyboardBridge';

export type CompactTypingMetricsSnapshot = {
  nativeCommits: number;
  reactTouchBlocks: number;
  fastPathConfigPublishes: number;
  layoutEpochBumps: number;
  compactStateSyncs: number;
  boundaryAutocorrectCalls: number;
};

const EMPTY: CompactTypingMetricsSnapshot = {
  nativeCommits: 0,
  reactTouchBlocks: 0,
  fastPathConfigPublishes: 0,
  layoutEpochBumps: 0,
  compactStateSyncs: 0,
  boundaryAutocorrectCalls: 0,
};

let sessionSnapshot: CompactTypingMetricsSnapshot = {...EMPTY};

export function recordCompactTypingFastPathPublish(): void {
  sessionSnapshot = {
    ...sessionSnapshot,
    fastPathConfigPublishes: sessionSnapshot.fastPathConfigPublishes + 1,
  };
}

export function recordCompactTypingLayoutEpochBump(): void {
  sessionSnapshot = {
    ...sessionSnapshot,
    layoutEpochBumps: sessionSnapshot.layoutEpochBumps + 1,
  };
}

export function getCompactTypingMetricsSessionSnapshot(): CompactTypingMetricsSnapshot {
  return {...sessionSnapshot};
}

export async function fetchCompactTypingMetricsFromNative(): Promise<CompactTypingMetricsSnapshot> {
  if (Platform.OS !== 'android') {
    return getCompactTypingMetricsSessionSnapshot();
  }
  try {
    const native = await keyboardBridge.getCompactTypingMetrics();
    if (native) {
      sessionSnapshot = {...EMPTY, ...native};
    }
  } catch {
    // ignore
  }
  return getCompactTypingMetricsSessionSnapshot();
}

export function resetCompactTypingMetricsSession(): void {
  sessionSnapshot = {...EMPTY};
  if (Platform.OS === 'android') {
    keyboardBridge.resetCompactTypingMetrics();
  }
}

export function subscribeCompactTypingMetricsRefresh(
  listener: () => void,
): () => void {
  const sub = DeviceEventEmitter.addListener('compactTypingMetricsChanged', listener);
  return () => sub.remove();
}
