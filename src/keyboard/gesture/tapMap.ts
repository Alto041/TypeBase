import AsyncStorage from '@react-native-async-storage/async-storage';

import type {KeyBounds} from './types';

const STORAGE_KEY = '@typebase/tap_map_v1';
const MAX_OFFSET_PX = 14;
const LEARN_RATE = 0.12;
const LEARN_RATE_WORD_CORRECTION = 0.08;
const MIN_SAMPLES_TO_APPLY = 4;
const PERSIST_DEBOUNCE_MS = 45_000;

export type TapMapEntry = {
  dx: number;
  dy: number;
  samples: number;
};

export type TapMapSnapshot = {
  letters: Record<string, TapMapEntry>;
  totalSamples: number;
  enabled: boolean;
};

type LayoutProvider = () => readonly KeyBounds[];

let enabled = true;
let dirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let layoutProvider: LayoutProvider | null = null;
const offsets = new Map<string, TapMapEntry>();
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

/** Stable signature for native fast-path republish when offsets change. */
export function getTapMapNativeSignature(): string {
  if (!enabled || offsets.size === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const letter of [...offsets.keys()].sort()) {
    const entry = offsets.get(letter);
    if (!entry || entry.samples < MIN_SAMPLES_TO_APPLY) {
      continue;
    }
    parts.push(
      `${letter}:${Math.round(entry.dx)}:${Math.round(entry.dy)}:${entry.samples}`,
    );
  }
  return parts.join('|');
}

export function serializeTapMapOffsetsForNative(): Array<{
  letter: string;
  dx: number;
  dy: number;
}> {
  if (!enabled) {
    return [];
  }
  const out: Array<{letter: string; dx: number; dy: number}> = [];
  for (const [letter, entry] of offsets) {
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

  const existing = offsets.get(normalized);
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
  offsets.set(normalized, next);
  notifyTapMapChanged();
  schedulePersist();
}

function absorbTapOffsetWithRate(
  letter: string,
  tapX: number,
  tapY: number,
  layout: KeyBounds,
  learnRate: number,
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

  const existing = offsets.get(normalized);
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
  offsets.set(normalized, next);
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
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({version: 1, enabled, letters}),
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
    notifyTapMapChanged();
  } catch {
    // Ignore corrupt storage.
  }
}

export async function clearTapMap(): Promise<void> {
  offsets.clear();
  notifyTapMapChanged();
  dirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

export function getTapMapOffset(letter: string): {dx: number; dy: number} {
  if (!enabled) {
    return {dx: 0, dy: 0};
  }
  const entry = offsets.get(letter.toLowerCase());
  if (!entry || entry.samples < MIN_SAMPLES_TO_APPLY) {
    return {dx: 0, dy: 0};
  }
  return {dx: entry.dx, dy: entry.dy};
}

export function getTapMapSnapshot(): TapMapSnapshot {
  const letters: Record<string, TapMapEntry> = {};
  let totalSamples = 0;
  for (const [letter, entry] of offsets) {
    letters[letter] = entry;
    totalSamples += entry.samples;
  }
  return {letters, totalSamples, enabled};
}

export function learnTapMapFromKeyTap(
  intendedLetter: string,
  tapX: number,
  tapY: number,
  layouts?: readonly KeyBounds[],
): void {
  const letterLayouts = layouts ?? layoutProvider?.() ?? [];
  const layout = findLayoutForLetter(letterLayouts, intendedLetter);
  if (!layout) {
    return;
  }
  absorbTapOffset(intendedLetter, tapX, tapY, layout);
}

export function learnTapMapFromMismatch(
  intendedLetter: string,
  tapX: number,
  tapY: number,
): void {
  learnTapMapFromKeyTap(intendedLetter, tapX, tapY);
}

export function learnTapMapFromWordCorrection(
  typed: string,
  corrected: string,
  letterTaps: ReadonlyArray<{letter: string; x: number; y: number}>,
  layouts?: readonly KeyBounds[],
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
      );
    }
  }
}

export function resetTapMapForTests(): void {
  offsets.clear();
  tapMapRevision = 0;
  enabled = true;
  dirty = false;
  layoutProvider = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
