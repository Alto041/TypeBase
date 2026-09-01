import {Platform} from 'react-native';

import {keyboardBridge} from './keyboardBridge';

export type NativeSuggestionSnapshot = {
  prefix: string;
  suggestions: string[];
  atMs: number;
};

let latestSnapshot: NativeSuggestionSnapshot | null = null;
const NATIVE_SNAPSHOT_MAX_AGE_MS = 500;

export function recordNativeSuggestionSnapshot(
  snapshot: NativeSuggestionSnapshot,
): void {
  latestSnapshot = snapshot;
}

export function getFreshNativeSuggestions(prefix: string): string[] | null {
  if (Platform.OS !== 'android' || !latestSnapshot) {
    return null;
  }
  if (latestSnapshot.prefix !== prefix) {
    return null;
  }
  if (Date.now() - latestSnapshot.atMs > NATIVE_SNAPSHOT_MAX_AGE_MS) {
    return null;
  }
  return latestSnapshot.suggestions;
}

export function syncNativeSuggestionPrefix(prefix: string): void {
  if (Platform.OS !== 'android') {
    return;
  }
  void keyboardBridge.syncNativeSuggestionPrefix(prefix);
}

export function clearNativeSuggestionSnapshot(): void {
  latestSnapshot = null;
  if (Platform.OS === 'android') {
    void keyboardBridge.syncNativeSuggestionPrefix('');
  }
}

export function parseNativeSuggestionsPayload(
  payload: unknown,
): NativeSuggestionSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as {
    prefix?: unknown;
    suggestions?: unknown;
    atMs?: unknown;
  };
  const prefix = typeof record.prefix === 'string' ? record.prefix : '';
  const suggestions = Array.isArray(record.suggestions)
    ? record.suggestions
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0)
    : [];
  const atMs =
    typeof record.atMs === 'number' && Number.isFinite(record.atMs)
      ? record.atMs
      : Date.now();
  return {prefix, suggestions, atMs};
}
