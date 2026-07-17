import type {KeyboardLayout} from './layouts/qwerty';
import type {KeyDefinition} from './layouts/qwerty';
import {getKeyboardLayoutSettings} from './settings/layoutStore';

/** Lowercase letter long-press alternates (Gboard-style). Base letter is index 0. */
const LETTER_ALTERNATES: Record<string, readonly string[]> = {
  a: ['a', 'ä', 'á', 'à', 'â', 'æ', 'ã', 'å'],
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
  o: ['o', 'ö', 'ó', 'ò', 'ô', 'œ', 'õ', 'ø'],
  p: ['p'],
  q: ['q'],
  r: ['r'],
  s: ['s', 'ß', 'ś', 'š'],
  t: ['t'],
  u: ['u', 'ü', 'ú', 'ù', 'û', 'ū'],
  v: ['v'],
  w: ['w'],
  x: ['x'],
  y: ['y', 'ý', 'ÿ'],
  z: ['z', 'ž', 'ź', 'ż'],
};

/** German layout: short umlaut-first lists (single-row popup, easy to hit). */
const GERMAN_LETTER_ALTERNATES: Record<string, readonly string[]> = {
  a: ['a', 'ä'],
  o: ['o', 'ö'],
  u: ['u', 'ü'],
  s: ['s', 'ß'],
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

/**
 * Q-row hints when a dedicated number row is shown.
 * Must not overlap ASDF (@ # & * - ( ) ' ") or ZXCV (? ! : ; / , .).
 */
const Q_ROW_SYMBOL_ALTERNATES_WITH_NUMBER_ROW: Record<string, readonly string[]> = {
  q: ['q', '$'],
  w: ['w', '%'],
  e: ['e', '+'],
  r: ['r', '='],
  t: ['t', '^'],
  y: ['y', '['],
  u: ['u', ']'],
  i: ['i', '{'],
  o: ['o', '}'],
  p: ['p', '|'],
};

const Q_ROW_LETTERS = new Set(Object.keys(Q_ROW_SYMBOL_ALTERNATES_WITH_NUMBER_ROW));

function getPhoneLetterSymbolAlternates(
  lookupKey: string,
): readonly string[] | undefined {
  const {numberRowEnabled} = getKeyboardLayoutSettings();
  if (numberRowEnabled && Q_ROW_LETTERS.has(lookupKey)) {
    return Q_ROW_SYMBOL_ALTERNATES_WITH_NUMBER_ROW[lookupKey];
  }
  return PHONE_LETTER_SYMBOL_ALTERNATES[lookupKey];
}

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
  // Use locale uppercasing so ö→Ö, ü→Ü, ä→Ä (ASCII-only regex missed these).
  return alternates.map(char => char.toLocaleUpperCase('und'));
}

function getAccentAlternates(
  lookupKey: string,
  letterLayoutId: string,
): readonly string[] {
  if (letterLayoutId === 'de-de' && GERMAN_LETTER_ALTERNATES[lookupKey]) {
    return GERMAN_LETTER_ALTERNATES[lookupKey];
  }
  return LETTER_ALTERNATES[lookupKey] ?? [lookupKey];
}

function resolveLetterAlternates(
  keyDef: KeyDefinition,
  _uppercase: boolean,
): readonly string[] {
  const base = keyDef.value;
  if (!base || base.length !== 1 || !/[a-z]/i.test(base)) {
    return base ? [base] : [];
  }

  const lookupKey = (keyDef.id.length === 1 && /[a-z]/i.test(keyDef.id)
    ? keyDef.id
    : base
  ).toLowerCase();

  const settings = getKeyboardLayoutSettings();
  const accents = getAccentAlternates(lookupKey, settings.letterLayoutId);

  // Only the explicit "symbol long-press" setting replaces/merges symbols.
  // numberRowEnabled used to steal accent popups (O→9 instead of O→Ö).
  if (settings.letterSymbolAlternatesEnabled) {
    const phone = getPhoneLetterSymbolAlternates(lookupKey);
    const symbols =
      phone && phone.length >= 2 ? phone.slice(1).filter(Boolean) : [];
    if (accents.length > 1) {
      const merged = [...accents];
      for (const symbol of symbols) {
        if (!merged.includes(symbol)) {
          merged.push(symbol);
        }
      }
      return merged;
    }
    if (symbols.length > 0) {
      return [lookupKey, ...symbols];
    }
    return [];
  }

  return accents;
}

/** Small symbol/number shown in the key corner when symbol long-press is on. */
export function getLetterSymbolHint(keyDef: KeyDefinition): string | null {
  const settings = getKeyboardLayoutSettings();
  // Corner hints only when symbol long-press is actually enabled — not merely
  // because a number row is visible (that used to imply false O→9 hints).
  if (!settings.letterSymbolAlternatesEnabled) {
    return null;
  }

  const base = keyDef.value;
  if (!base || base.length !== 1 || !/[a-z]/i.test(base)) {
    return null;
  }

  const lookupKey = (keyDef.id.length === 1 && /[a-z]/i.test(keyDef.id)
    ? keyDef.id
    : base
  ).toLowerCase();

  const phone = getPhoneLetterSymbolAlternates(lookupKey);
  return phone && phone.length >= 2 ? phone[1] : null;
}

/** Whether a long-press should open the alternate popup for these alternates. */
export function shouldShowAlternatePopup(alternates: readonly string[]): boolean {
  return alternates.length > 1;
}

const keyAlternatesCache = new Map<string, string[]>();

export function getKeyAlternates(
  keyDef: KeyDefinition,
  layout: KeyboardLayout,
  uppercase: boolean,
): string[] {
  const settings = getKeyboardLayoutSettings();
  const cacheKey = `${keyDef.id}|${layout}|${uppercase ? 1 : 0}|${settings.letterSymbolAlternatesEnabled ? 1 : 0}|${settings.numberRowEnabled ? 1 : 0}|${settings.letterLayoutId}`;
  const cached = keyAlternatesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

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
  if (!shouldShowAlternatePopup(resolved)) {
    keyAlternatesCache.set(cacheKey, []);
    return [];
  }
  keyAlternatesCache.set(cacheKey, resolved);
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
  // Keep popups on one row whenever possible so top-row keys (O/P) don't
  // clip the first line above the keyboard area.
  const columns =
    alternateCount <= 8 ? alternateCount : Math.ceil(alternateCount / 2);
  const rows = alternateCount <= 8 ? 1 : 2;
  const cellWidth = cellSize;
  const cellHeight = cellSize;
  const width = columns * cellWidth + (columns - 1) * gap + padding * 2;
  const height = rows * cellHeight + (rows - 1) * gap + padding * 2;
  const gapBesideKey = 6;

  let left = keyBounds.centerX - width / 2;
  left = Math.max(4, Math.min(left, areaWidth - width - 4));

  // Prefer above the key; if that would clip off the top of the keys area,
  // sit just inside the area (overlapping the key) so every glyph stays visible.
  let top = keyBounds.y - gapBesideKey - height;
  if (top < 2) {
    top = 2;
  }

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
