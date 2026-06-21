import type {KeyboardLayout} from './layouts/qwerty';
import type {KeyDefinition} from './layouts/qwerty';
import {getKeyboardLayoutSettings} from './settings/layoutStore';

/** Lowercase letter long-press alternates (Gboard-style). Base letter is index 0. */
const LETTER_ALTERNATES: Record<string, readonly string[]> = {
  a: ['a', 'á', 'à', 'â', 'ä', 'æ', 'ã', 'å'],
  b: ['b'],
  c: ['c', 'ç', 'ć', 'č'],
  d: ['d'],
  e: ['e', 'é', 'è', 'ê', 'ë', 'ē', 'ė', 'ę'],
  f: ['f'],
  g: ['g', 'ğ'],
  h: ['h'],
  i: ['i', 'í', 'ì', 'î', 'ï', 'ī', 'į'],
  j: ['j'],
  k: ['k'],
  l: ['l', 'ł'],
  m: ['m'],
  n: ['n', 'ñ'],
  o: ['o', 'ó', 'ò', 'ô', 'ö', 'œ', 'õ', 'ø'],
  p: ['p'],
  q: ['q'],
  r: ['r'],
  s: ['s', 'ß', 'ś', 'š'],
  t: ['t'],
  u: ['u', 'ú', 'ù', 'û', 'ü', 'ū'],
  v: ['v'],
  w: ['w'],
  x: ['x'],
  y: ['y', 'ý', 'ÿ'],
  z: ['z', 'ž', 'ź', 'ż'],
};

/**
 * Classic phone-keyboard long-press on QWERTY letter keys (AOSP-style).
 * Top row → 1–0, home row → punctuation, bottom row → more symbols.
 */
const PHONE_LETTER_SYMBOL_ALTERNATES: Record<string, readonly string[]> = {
  q: ['q', '1'],
  w: ['w', '2'],
  e: ['e', '3'],
  r: ['r', '4'],
  t: ['t', '5'],
  y: ['y', '6'],
  u: ['u', '7'],
  i: ['i', '8'],
  o: ['o', '9'],
  p: ['p', '0'],
  a: ['a', '@'],
  s: ['s', '#'],
  d: ['d', '&'],
  f: ['f', '*'],
  g: ['g', '-'],
  h: ['h', '('],
  j: ['j', ')'],
  k: ['k', "'"],
  l: ['l', '"'],
  z: ['z', '?'],
  x: ['x', '!'],
  c: ['c', ':'],
  v: ['v', ';'],
  b: ['b', '/'],
  n: ['n', ','],
  m: ['m', '.'],
};

const NUMBER_ALTERNATES: Record<string, readonly string[]> = {
  '0': ['0', '°', '₀'],
  '1': ['1', '¹', '½', '⅓', '¼'],
  '2': ['2', '²', '½'],
  '3': ['3', '³', '¾'],
  '4': ['4'],
  '5': ['5', '⅝'],
  '6': ['6'],
  '7': ['7'],
  '8': ['8'],
  '9': ['9'],
  '-': ['-', '–', '—', '·'],
  '/': ['/', '\\'],
  '?': ['?', '¿'],
  '!': ['!', '¡'],
  "'": ["'", '‘', '’', '`'],
  '"': ['"', '“', '”', '„'],
  '(': ['(', '[', '{', '<'],
  ')': [')', ']', '}', '>'],
};

const SYMBOL_ALTERNATES: Record<string, readonly string[]> = {
  $: ['$', '€', '£', '¥', '₩', '₹'],
  '%': ['%', '‰'],
  '&': ['&', '§'],
  '*': ['*', '†', '‡'],
  '=': ['=', '≠', '≈', '∞'],
  '+': ['+', '±'],
  '#': ['#', '№'],
  '@': ['@'],
};

function applyCase(alternates: readonly string[], uppercase: boolean): string[] {
  if (!uppercase) {
    return [...alternates];
  }
  return alternates.map(char =>
    char.length === 1 && /[a-z]/i.test(char) ? char.toUpperCase() : char,
  );
}

function resolveLetterAlternates(
  keyDef: KeyDefinition,
  uppercase: boolean,
): readonly string[] {
  const base = keyDef.value;
  if (!base || base.length !== 1 || !/[a-z]/i.test(base)) {
    return base ? [base] : [];
  }

  const lookupKey = (keyDef.id.length === 1 && /[a-z]/i.test(keyDef.id)
    ? keyDef.id
    : base
  ).toLowerCase();

  const useSymbolAlternates =
    getKeyboardLayoutSettings().letterSymbolAlternatesEnabled;

  if (useSymbolAlternates) {
    return PHONE_LETTER_SYMBOL_ALTERNATES[lookupKey] ?? [base.toLowerCase()];
  }

  return LETTER_ALTERNATES[lookupKey] ?? [base.toLowerCase()];
}

export function getKeyAlternates(
  keyDef: KeyDefinition,
  layout: KeyboardLayout,
  uppercase: boolean,
): string[] {
  const base = keyDef.value;
  if (!base) {
    return [];
  }

  let alternates: readonly string[] = [base];

  if (layout === 'letters' && base.length === 1 && /[a-z]/i.test(base)) {
    alternates = resolveLetterAlternates(keyDef, uppercase);
  } else if (layout === 'numbers') {
    alternates = NUMBER_ALTERNATES[base] ?? [base];
  } else if (layout === 'symbols') {
    alternates = SYMBOL_ALTERNATES[base] ?? [base];
  }

  const resolved = applyCase(alternates, uppercase);
  if (resolved.length <= 1) {
    return [];
  }
  return resolved;
}

export type AlternatePopupGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  padding: number;
};

export function computeAlternatePopupGeometry(
  keyBounds: {x: number; y: number; width: number; height: number; centerX: number},
  alternateCount: number,
  cellSize: number,
  areaWidth: number,
): AlternatePopupGeometry {
  const padding = 6;
  const gap = 4;
  const columns =
    alternateCount <= 6 ? alternateCount : Math.ceil(alternateCount / 2);
  const rows = alternateCount <= 6 ? 1 : 2;
  const cellWidth = cellSize;
  const cellHeight = cellSize;
  const width = columns * cellWidth + (columns - 1) * gap + padding * 2;
  const height = rows * cellHeight + (rows - 1) * gap + padding * 2;
  const gapAboveKey = 6;

  let left = keyBounds.centerX - width / 2;
  left = Math.max(4, Math.min(left, areaWidth - width - 4));
  const top = keyBounds.y - gapAboveKey - height;

  return {
    left,
    top,
    width,
    height,
    columns,
    rows,
    cellWidth,
    cellHeight,
    gap,
    padding,
  };
}

export function hitTestAlternateIndex(
  localX: number,
  localY: number,
  geometry: AlternatePopupGeometry,
  alternateCount: number,
): number {
  const innerX = localX - geometry.left - geometry.padding;
  const innerY = localY - geometry.top - geometry.padding;
  if (innerX < 0 || innerY < 0) {
    return 0;
  }

  const col = Math.floor(innerX / (geometry.cellWidth + geometry.gap));
  const row = Math.floor(innerY / (geometry.cellHeight + geometry.gap));
  if (col < 0 || col >= geometry.columns || row < 0 || row >= geometry.rows) {
    return 0;
  }

  const index = row * geometry.columns + col;
  return Math.max(0, Math.min(alternateCount - 1, index));
}
