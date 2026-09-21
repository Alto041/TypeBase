import {DeviceEventEmitter} from 'react-native';

import {keyboardBridge} from '../keyboardBridge';
import type {KeyDefinition} from '../layouts/qwerty';

export const MY_ROW_SLOT_COUNT = 10;
/** Max length for a pinned key label (emoji, ligatures, etc.). */
export const MY_ROW_PIN_MAX_LENGTH = 8;
export const MY_ROW_USAGE_CHANGED_EVENT = 'myRowUsageChanged';

/** Symbols users can pin or that My Row learns. */
export const MY_ROW_PALETTE =
  '@#$.,-+=()/*"\':;!?&_[]\\|~`^<>'.split('');

const DEFAULT_FILL = ['@', '#', '.', ',', '-', '(', ')', '/', '!', '?'];

let usageCache: Record<string, number> = {};
let loadPromise: Promise<void> | null = null;

function normalizeUsage(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length !== 1 || typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (value > 0) {
      next[key] = Math.floor(value);
    }
  }
  return next;
}

export async function ensureMyRowUsageLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    try {
      const raw = await keyboardBridge.getMyRowUsage();
      usageCache = normalizeUsage(JSON.parse(raw || '{}'));
    } catch {
      usageCache = {};
    }
  })();
  return loadPromise;
}

export function getMyRowUsageSnapshot(): Readonly<Record<string, number>> {
  return usageCache;
}

function graphemeSegments(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
    return [...segmenter.segment(text)].map(part => part.segment);
  }
  return [...text];
}

function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return graphemeSegments(trimmed)[0] ?? '';
}

export function normalizeMyRowPin(raw: string): string {
  const grapheme = firstGrapheme(raw);
  if (!grapheme) {
    return '';
  }
  if (grapheme.length <= MY_ROW_PIN_MAX_LENGTH) {
    return grapheme;
  }
  let out = '';
  for (const segment of graphemeSegments(grapheme)) {
    if (out.length + segment.length > MY_ROW_PIN_MAX_LENGTH) {
      break;
    }
    out += segment;
  }
  return out || grapheme.slice(0, MY_ROW_PIN_MAX_LENGTH);
}

export function isValidMyRowPin(raw: string): boolean {
  const pin = normalizeMyRowPin(raw);
  if (!pin) {
    return false;
  }
  if (/[\s\u0000-\u001F]/.test(pin)) {
    return false;
  }
  if (/^[a-zA-Z0-9]+$/.test(pin)) {
    return false;
  }
  return pin.length <= MY_ROW_PIN_MAX_LENGTH;
}

/** Use clipboard or typed text to extract one pin-worthy symbol. */
export function parseMyRowPinFromPaste(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (isValidMyRowPin(trimmed)) {
    return normalizeMyRowPin(trimmed);
  }
  for (const segment of graphemeSegments(trimmed)) {
    if (isValidMyRowPin(segment)) {
      return normalizeMyRowPin(segment);
    }
  }
  return null;
}

export function addMyRowPin(
  pins: readonly string[],
  raw: string,
): string[] | null {
  if (!isValidMyRowPin(raw)) {
    return null;
  }
  const pin = normalizeMyRowPin(raw);
  if (pins.includes(pin)) {
    return [...pins];
  }
  if (pins.length >= MY_ROW_SLOT_COUNT) {
    return [...pins.slice(1), pin];
  }
  return [...pins, pin];
}

export function isMyRowTrackableChar(text: string): boolean {
  if (text.length !== 1) {
    return false;
  }
  if (/[a-zA-Z0-9]/.test(text)) {
    return false;
  }
  if (/\s/.test(text)) {
    return false;
  }
  return true;
}

export async function persistMyRowUsage(
  usage: Record<string, number>,
): Promise<void> {
  usageCache = {...usage};
  await keyboardBridge.setMyRowUsage(JSON.stringify(usageCache));
  DeviceEventEmitter.emit(MY_ROW_USAGE_CHANGED_EVENT);
}

export function recordMyRowSymbol(char: string): void {
  if (!isMyRowTrackableChar(char)) {
    return;
  }
  usageCache = {
    ...usageCache,
    [char]: (usageCache[char] ?? 0) + 1,
  };
  void keyboardBridge.recordMyRowSymbol(char);
  DeviceEventEmitter.emit(MY_ROW_USAGE_CHANGED_EVENT);
}

export function buildMyRowKeyDefinitions(
  pins: readonly string[],
  usage: Readonly<Record<string, number>>,
): KeyDefinition[] {
  const chosen: string[] = [];
  const add = (raw: string) => {
    if (!isValidMyRowPin(raw)) {
      return;
    }
    const pin = normalizeMyRowPin(raw);
    if (chosen.length >= MY_ROW_SLOT_COUNT) {
      return;
    }
    if (chosen.includes(pin)) {
      return;
    }
    chosen.push(pin);
  };

  for (const pin of pins) {
    add(pin);
  }

  const ranked = Object.entries(usage)
    .sort((left, right) => right[1] - left[1])
    .map(([symbol]) => symbol);
  for (const symbol of ranked) {
    add(symbol);
  }
  for (const symbol of DEFAULT_FILL) {
    add(symbol);
  }

  return chosen.slice(0, MY_ROW_SLOT_COUNT).map((ch, index) => ({
    id: `myrow-${index}-${encodeURIComponent(ch)}`,
    label: ch,
    value: ch,
  }));
}

export function topLearnedMyRowSymbols(
  usage: Readonly<Record<string, number>>,
  limit = 12,
): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([symbol]) => symbol);
}
