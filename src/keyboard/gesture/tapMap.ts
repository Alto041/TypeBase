import AsyncStorage from '@react-native-async-storage/async-storage';

import type {KeyBounds} from './types';

export type TapMapEntry = {
  dx: number;
  dy: number;
  samples: number;
};

const STORAGE_KEY = '@typebase/tap_map_v1';
const MAX_OFFSET_PX = 14;
const LEARN_RATE = 0.12;
const LEARN_RATE_WORD_CORRECTION = 0.08;
const MIN_SAMPLES_TO_APPLY = 4;
const PERSIST_DEBOUNCE_MS = 45_000;

export type TapMapImpactStats = {
  /** Autocorrect swaps that retargeted at least one letter on the tap map. */
  wordsHelpedByCorrections: number;
  /** Per-letter offset updates from autocorrect-driven tap map learning. */
  lettersRetargetedFromCorrections: number;
  /** Near-miss taps where we nudged the map toward the key you meant. */
  keysFixedFromMisses: number;
  /** Neighbor / touch-intel fixes while Walk Mode was active. */
  walkingTapsFixed: number;
};

const DEFAULT_IMPACT_STATS: TapMapImpactStats = {
  wordsHelpedByCorrections: 0,
  lettersRetargetedFromCorrections: 0,
  keysFixedFromMisses: 0,
  walkingTapsFixed: 0,
};

export type TapMapSnapshot = {
  letters: Record<string, TapMapEntry>;
  walkingLetters: Record<string, TapMapEntry>;
  totalSamples: number;
  walkingTotalSamples: number;
  enabled: boolean;
  impact: TapMapImpactStats;
};

type LayoutProvider = () => readonly KeyBounds[];

let enabled = true;
let dirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let layoutProvider: LayoutProvider | null = null;
const offsets = new Map<string, TapMapEntry>();
const walkingOffsets = new Map<string, TapMapEntry>();
let impactStats: TapMapImpactStats = {...DEFAULT_IMPACT_STATS};
let tapMapRevision = 0;
const changeListeners = new Set<() => void>();

function notifyTapMapChanged(): void {
  tapMapRevision += 1;
  for (const listener of changeListeners) {
    listener();
  }
}

export function getTapMapRevision(): number {
  return tapMapRevision;
}

export function subscribeTapMapChanges(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function signatureForMap(
  map: Map<string, TapMapEntry>,
  prefix: string,
): string {
  if (!enabled || map.size === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const letter of [...map.keys()].sort()) {
    const entry = map.get(letter);
    if (!entry || entry.samples < MIN_SAMPLES_TO_APPLY) {
      continue;
    }
    parts.push(
      `${letter}:${Math.round(entry.dx)}:${Math.round(entry.dy)}:${entry.samples}`,
    );
  }
  if (parts.length === 0) {
    return '';
  }
  return `${prefix}|${parts.join('|')}`;
}

/** Stable signature for native fast-path republish when offsets change. */
export function getTapMapNativeSignature(useWalkingMap = false): string {
  return signatureForMap(useWalkingMap ? walkingOffsets : offsets, 'n');
}

export function getWalkingTapMapNativeSignature(): string {
  return signatureForMap(walkingOffsets, 'w');
}

export function serializeTapMapOffsetsForNative(
  useWalkingMap = false,
): Array<{
  letter: string;
  dx: number;
  dy: number;
}> {
  if (!enabled) {
    return [];
  }
  const map = useWalkingMap ? walkingOffsets : offsets;
  const out: Array<{letter: string; dx: number; dy: number}> = [];
  for (const [letter, entry] of map) {
    if (entry.samples < MIN_SAMPLES_TO_APPLY) {
      continue;
    }
    out.push({letter, dx: entry.dx, dy: entry.dy});
  }
  return out;
}

function clampOffset(value: number): number {
  return Math.max(-MAX_OFFSET_PX, Math.min(MAX_OFFSET_PX, value));
}

function keyLetter(layout: KeyBounds): string | null {
  const value = layout.keyDef.value ?? layout.letter ?? '';
  if (value.length !== 1) {
    return null;
  }
  const lower = value.toLowerCase();
  return /[a-z]/.test(lower) ? lower : null;
}

function findLayoutForLetter(
  layouts: readonly KeyBounds[],
  letter: string,
): KeyBounds | null {
  const target = letter.toLowerCase();
  for (const layout of layouts) {
    if (keyLetter(layout) === target) {
      return layout;
    }
  }
  return null;
}

function absorbTapOffset(
  letter: string,
  tapX: number,
  tapY: number,
  layout: KeyBounds,
  target: Map<string, TapMapEntry>,
): void {
  if (!enabled) {
    return;
  }
  const normalized = letter.toLowerCase();
  if (!/[a-z]/.test(normalized)) {
    return;
  }

  const centerX = layout.x + layout.width / 2;
  const centerY = layout.y + layout.height / 2;
  const targetDx = clampOffset(tapX - centerX);
  const targetDy = clampOffset(tapY - centerY);

  const existing = target.get(normalized);
  const next: TapMapEntry = existing
    ? {
        dx: clampOffset(existing.dx + (targetDx - existing.dx) * LEARN_RATE),
        dy: clampOffset(existing.dy + (targetDy - existing.dy) * LEARN_RATE),
        samples: existing.samples + 1,
      }
    : {
        dx: clampOffset(targetDx * LEARN_RATE),
        dy: clampOffset(targetDy * LEARN_RATE),
        samples: 1,
      };
  target.set(normalized, next);
  notifyTapMapChanged();
  schedulePersist();
}

function absorbTapOffsetWithRate(
  letter: string,
  tapX: number,
  tapY: number,
  layout: KeyBounds,
  learnRate: number,
  target: Map<string, TapMapEntry>,
): void {
  if (!enabled) {
    return;
  }
  const normalized = letter.toLowerCase();
  if (!/[a-z]/.test(normalized)) {
    return;
  }

  const centerX = layout.x + layout.width / 2;
  const centerY = layout.y + layout.height / 2;
  const targetDx = clampOffset(tapX - centerX);
  const targetDy = clampOffset(tapY - centerY);

  const existing = target.get(normalized);
  const next: TapMapEntry = existing
    ? {
        dx: clampOffset(existing.dx + (targetDx - existing.dx) * learnRate),
        dy: clampOffset(existing.dy + (targetDy - existing.dy) * learnRate),
        samples: existing.samples + 1,
      }
    : {
        dx: clampOffset(targetDx * learnRate),
        dy: clampOffset(targetDy * learnRate),
        samples: 1,
      };
  target.set(normalized, next);
  notifyTapMapChanged();
  schedulePersist();
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!dirty) {
      return;
    }
    dirty = false;
    void persistTapMap();
  }, PERSIST_DEBOUNCE_MS);
}

async function persistTapMap(): Promise<void> {
  try {
    const letters: Record<string, TapMapEntry> = {};
    for (const [letter, entry] of offsets) {
      letters[letter] = entry;
    }
    const walkingLetters: Record<string, TapMapEntry> = {};
    for (const [letter, entry] of walkingOffsets) {
      walkingLetters[letter] = entry;
    }
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        enabled,
        letters,
        walkingLetters,
        impact: impactStats,
      }),
    );
  } catch {
    // Tap map must never block typing.
  }
}

export function setTapMapLayoutProvider(provider: LayoutProvider | null): void {
  layoutProvider = provider;
}

export function setTapMapEnabled(next: boolean): void {
  enabled = next;
  schedulePersist();
}

export function isTapMapEnabled(): boolean {
  return enabled;
}

export async function hydrateTapMapFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const payload = JSON.parse(raw) as {
      enabled?: boolean;
      letters?: Record<string, TapMapEntry>;
    };
    enabled = payload.enabled !== false;
    offsets.clear();
    walkingOffsets.clear();
    const impact = payload.impact as Partial<TapMapImpactStats> | undefined;
    impactStats = {
      wordsHelpedByCorrections: Math.max(
        0,
        Number(impact?.wordsHelpedByCorrections) || 0,
      ),
      lettersRetargetedFromCorrections: Math.max(
        0,
        Number(impact?.lettersRetargetedFromCorrections) || 0,
      ),
      keysFixedFromMisses: Math.max(0, Number(impact?.keysFixedFromMisses) || 0),
      walkingTapsFixed: Math.max(0, Number(impact?.walkingTapsFixed) || 0),
    };
    for (const [letter, entry] of Object.entries(payload.letters ?? {})) {
      if (!entry || typeof entry.samples !== 'number') {
        continue;
      }
      offsets.set(letter.toLowerCase(), {
        dx: clampOffset(Number(entry.dx) || 0),
        dy: clampOffset(Number(entry.dy) || 0),
        samples: Math.max(0, entry.samples),
      });
    }
    const walkingPayload = payload as {walkingLetters?: Record<string, TapMapEntry>};
    for (const [letter, entry] of Object.entries(
      walkingPayload.walkingLetters ?? {},
    )) {
      if (!entry || typeof entry.samples !== 'number') {
        continue;
      }
      walkingOffsets.set(letter.toLowerCase(), {
        dx: clampOffset(Number(entry.dx) || 0),
        dy: clampOffset(Number(entry.dy) || 0),
        samples: Math.max(0, entry.samples),
      });
    }
    if (
      offsets.size > 0 ||
      walkingOffsets.size > 0 ||
      impactStats.wordsHelpedByCorrections > 0 ||
      impactStats.lettersRetargetedFromCorrections > 0 ||
      impactStats.keysFixedFromMisses > 0 ||
      impactStats.walkingTapsFixed > 0
    ) {
      notifyTapMapChanged();
    }
  } catch {
    // Ignore corrupt storage.
  }
}

export async function clearTapMap(): Promise<void> {
  offsets.clear();
  walkingOffsets.clear();
  impactStats = {...DEFAULT_IMPACT_STATS};
  notifyTapMapChanged();
  dirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/** Clears only walking offsets and walking-specific impact counters. */
export async function clearWalkingTapMap(): Promise<void> {
  walkingOffsets.clear();
  impactStats = {
    ...impactStats,
    walkingTapsFixed: 0,
  };
  notifyTapMapChanged();
  dirty = true;
  schedulePersist();
}

export function getTapMapOffset(
  letter: string,
  useWalkingMap = false,
): {dx: number; dy: number} {
  if (!enabled) {
    return {dx: 0, dy: 0};
  }
  const map = useWalkingMap ? walkingOffsets : offsets;
  const entry = map.get(letter.toLowerCase());
  if (!entry || entry.samples < MIN_SAMPLES_TO_APPLY) {
    return {dx: 0, dy: 0};
  }
  return {dx: entry.dx, dy: entry.dy};
}

export function recordWalkingTapFixed(): void {
  impactStats = {
    ...impactStats,
    walkingTapsFixed: impactStats.walkingTapsFixed + 1,
  };
  notifyTapMapChanged();
  schedulePersist();
}

export function getTapMapSnapshot(): TapMapSnapshot {
  const letters: Record<string, TapMapEntry> = {};
  let totalSamples = 0;
  for (const [letter, entry] of offsets) {
    letters[letter] = entry;
    totalSamples += entry.samples;
  }
  const walkingLetters: Record<string, TapMapEntry> = {};
  let walkingTotalSamples = 0;
  for (const [letter, entry] of walkingOffsets) {
    walkingLetters[letter] = entry;
    walkingTotalSamples += entry.samples;
  }
  return {
    letters,
    walkingLetters,
    totalSamples,
    walkingTotalSamples,
    enabled,
    impact: {...impactStats},
  };
}

export function learnTapMapFromKeyTap(
  intendedLetter: string,
  tapX: number,
  tapY: number,
  layouts?: readonly KeyBounds[],
  options?: {walking?: boolean},
): void {
  const letterLayouts = layouts ?? layoutProvider?.() ?? [];
  const layout = findLayoutForLetter(letterLayouts, intendedLetter);
  if (!layout) {
    return;
  }
  const target = options?.walking ? walkingOffsets : offsets;
  absorbTapOffset(intendedLetter, tapX, tapY, layout, target);
}

export function learnTapMapFromMismatch(
  intendedLetter: string,
  tapX: number,
  tapY: number,
  options?: {walking?: boolean},
): void {
  learnTapMapFromKeyTap(intendedLetter, tapX, tapY, undefined, options);
  if (options?.walking) {
    impactStats = {
      ...impactStats,
      walkingTapsFixed: impactStats.walkingTapsFixed + 1,
    };
  } else {
    impactStats = {
      ...impactStats,
      keysFixedFromMisses: impactStats.keysFixedFromMisses + 1,
    };
  }
  notifyTapMapChanged();
  schedulePersist();
}

export function learnTapMapFromWordCorrection(
  typed: string,
  corrected: string,
  letterTaps: ReadonlyArray<{letter: string; x: number; y: number}>,
  layouts?: readonly KeyBounds[],
  options?: {walking?: boolean},
): void {
  const from = typed.trim().toLowerCase();
  const to = corrected.trim().toLowerCase();
  if (!from || !to || from === to || letterTaps.length === 0) {
    return;
  }

  const letterLayouts = layouts ?? layoutProvider?.() ?? [];
  if (letterLayouts.length === 0) {
    return;
  }

  let diffStart = 0;
  const maxLen = Math.max(from.length, to.length);
  while (diffStart < maxLen && from[diffStart] === to[diffStart]) {
    diffStart += 1;
  }
  if (diffStart >= from.length && diffStart >= to.length) {
    return;
  }

  const typedSuffix = from.slice(diffStart);
  const correctedSuffix = to.slice(diffStart);
  const relevantTaps = letterTaps.slice(-typedSuffix.length);
  let lettersLearned = 0;

  for (
    let i = 0;
    i < Math.min(typedSuffix.length, correctedSuffix.length);
    i += 1
  ) {
    const typedChar = typedSuffix[i]!;
    const intendedChar = correctedSuffix[i]!;
    if (typedChar === intendedChar) {
      continue;
    }
    const tap = relevantTaps[i];
    if (!tap || tap.letter !== typedChar) {
      continue;
    }
    const layout = findLayoutForLetter(letterLayouts, intendedChar);
    if (layout) {
      absorbTapOffsetWithRate(
        intendedChar,
        tap.x,
        tap.y,
        layout,
        LEARN_RATE_WORD_CORRECTION,
        options?.walking ? walkingOffsets : offsets,
      );
      lettersLearned += 1;
    }
  }

  if (lettersLearned > 0) {
    impactStats = {
      ...impactStats,
      wordsHelpedByCorrections: impactStats.wordsHelpedByCorrections + 1,
      lettersRetargetedFromCorrections:
        impactStats.lettersRetargetedFromCorrections + lettersLearned,
    };
    notifyTapMapChanged();
    schedulePersist();
  }
}

export function resetTapMapForTests(): void {
  offsets.clear();
  walkingOffsets.clear();
  impactStats = {...DEFAULT_IMPACT_STATS};
  tapMapRevision = 0;
  enabled = true;
  dirty = false;
  layoutProvider = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
