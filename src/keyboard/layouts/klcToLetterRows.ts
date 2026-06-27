import type {KeyDefinition} from './qwerty';
import {BOTTOM_ROW, SIDE_KEY_FLEX, STAGGER_FLEX} from './sharedRows';
import type {ParsedKlc} from './parseKlc';

const ROW1_VKS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'] as const;
const ROW2_VKS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'] as const;
/** Key right of L — ñ on Spanish (OEM_3), varies by locale. */
const ROW2_TAIL_VKS = ['OEM_3', 'OEM_1', 'OEM_7'] as const;
const ROW3_VKS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'] as const;

function isLetterValue(value: string): boolean {
  if (value.length !== 1) {
    return false;
  }
  return /\p{L}/u.test(value);
}

function keyId(vk: string, value: string): string {
  if (value.length === 1 && /[a-z0-9]/i.test(value)) {
    return value.toLowerCase();
  }
  const hex = [...value]
    .map(ch => ch.codePointAt(0)?.toString(16) ?? '0')
    .join('_');
  return `klc_${vk.toLowerCase()}_${hex}`;
}

function vkToKey(vk: string, parsed: ParsedKlc): KeyDefinition | null {
  const ligature = parsed.ligatures[vk];
  const entry = parsed.vkEntries[vk];
  if (!entry && !ligature) {
    return null;
  }

  const value = ligature ?? entry?.base;
  if (!value) {
    return null;
  }

  return {
    id: keyId(vk, value),
    label: value,
    value,
  };
}

function buildRow(vks: readonly string[], parsed: ParsedKlc): KeyDefinition[] {
  const keys: KeyDefinition[] = [];
  for (const vk of vks) {
    const key = vkToKey(vk, parsed);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}

function buildRow2(parsed: ParsedKlc): KeyDefinition[] {
  const keys = buildRow(ROW2_VKS, parsed);
  for (const vk of ROW2_TAIL_VKS) {
    const key = vkToKey(vk, parsed);
    if (key && isLetterValue(key.value ?? '')) {
      keys.push(key);
      break;
    }
  }
  return keys;
}

/** Convert parsed KLC data into TypeBase letter rows (+ shared bottom row). */
export function klcToLetterRows(parsed: ParsedKlc): KeyDefinition[][] {
  const row1 = buildRow(ROW1_VKS, parsed);
  const row2 = buildRow2(parsed);
  const row3 = buildRow(ROW3_VKS, parsed);

  if (row1.length === 0 && row2.length === 0 && row3.length === 0) {
    throw new Error('KLC file has no mappable letter keys.');
  }

  return [
    row1,
    [
      {id: 'row2-stagger-start', label: '', type: 'spacer', flex: STAGGER_FLEX},
      ...row2,
      {id: 'row2-stagger-end', label: '', type: 'spacer', flex: STAGGER_FLEX},
    ],
    [
      {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
      ...row3,
      {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
    ],
    BOTTOM_ROW,
  ];
}

/** Letter rows only (no bottom row) for compact storage. */
export function klcToStoredLetterRows(parsed: ParsedKlc): KeyDefinition[][] {
  const rows = klcToLetterRows(parsed);
  return rows.slice(0, 3);
}

export function appendBottomRow(letterRows: KeyDefinition[][]): KeyDefinition[][] {
  if (letterRows.length >= 4) {
    return letterRows;
  }
  return [...letterRows.slice(0, 3), BOTTOM_ROW];
}

export function localeToLanguage(localeName?: string): string {
  if (!localeName) {
    return 'Imported';
  }
  const tag = localeName.split('-')[0]?.toLowerCase();
  const names: Record<string, string> = {
    ar: 'Arabic',
    cs: 'Czech',
    de: 'German',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    he: 'Hebrew',
    hi: 'Hindi',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    nl: 'Dutch',
    pl: 'Polish',
    pt: 'Portuguese',
    ru: 'Russian',
    sv: 'Swedish',
    tr: 'Turkish',
    uk: 'Ukrainian',
    vi: 'Vietnamese',
  };
  return names[tag ?? ''] ?? localeName;
}
