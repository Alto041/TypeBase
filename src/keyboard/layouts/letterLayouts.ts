import type {KeyDefinition} from './qwerty';
import {buildLetterLayout} from './buildLetterLayout';
import {BOTTOM_ROW, SIDE_KEY_FLEX} from './sharedRows';

export type LetterLayoutId =
  | 'en-us'
  | 'en-gb'
  | 'fr-fr'
  | 'de-de'
  | 'es-es'
  | 'it-it'
  | 'pt-pt'
  | 'pl-pl'
  | 'tr-tr'
  | 'nl-nl'
  | 'sv-se'
  | 'da-dk'
  | 'nb-no'
  | 'ru-ru'
  | 'ar-sa'
  | (string & {});

export type LetterLayoutFamily =
  | 'QWERTY'
  | 'AZERTY'
  | 'QWERTZ'
  | 'Cyrillic'
  | 'Arabic'
  | 'KLC';

export type LetterLayoutMeta = {
  id: LetterLayoutId;
  /** Display name in the picker */
  label: string;
  /** Language / region group heading */
  language: string;
  /** Short layout family tag */
  family: LetterLayoutFamily;
};

export const DEFAULT_LETTER_LAYOUT_ID: LetterLayoutId = 'en-us';

export const LETTER_LAYOUT_CATALOG: LetterLayoutMeta[] = [
  {id: 'en-us', label: 'English (US)', language: 'English', family: 'QWERTY'},
  {id: 'en-gb', label: 'English (UK)', language: 'English', family: 'QWERTY'},
  {id: 'fr-fr', label: 'Français (AZERTY)', language: 'French', family: 'AZERTY'},
  {id: 'de-de', label: 'Deutsch (QWERTZ)', language: 'German', family: 'QWERTZ'},
  {id: 'es-es', label: 'Español', language: 'Spanish', family: 'QWERTY'},
  {id: 'it-it', label: 'Italiano', language: 'Italian', family: 'QWERTY'},
  {id: 'pt-pt', label: 'Português', language: 'Portuguese', family: 'QWERTY'},
  {id: 'pl-pl', label: 'Polski (Programmers)', language: 'Polish', family: 'QWERTY'},
  {id: 'tr-tr', label: 'Türkçe (Q)', language: 'Turkish', family: 'QWERTY'},
  {id: 'nl-nl', label: 'Nederlands', language: 'Dutch', family: 'QWERTY'},
  {id: 'sv-se', label: 'Svenska', language: 'Swedish', family: 'QWERTY'},
  {id: 'da-dk', label: 'Dansk', language: 'Danish', family: 'QWERTY'},
  {id: 'nb-no', label: 'Norsk', language: 'Norwegian', family: 'QWERTY'},
  {id: 'ru-ru', label: 'Русский', language: 'Russian', family: 'Cyrillic'},
  {id: 'ar-sa', label: 'العربية (101)', language: 'Arabic', family: 'Arabic'},
];

/** Arabic 101 — Windows KBDA1 / ar-SA default (kbdlayout.info/KBDA1). */
function buildArabicLayout(): KeyDefinition[][] {
  const key = (label: string, value = label, id?: string): KeyDefinition => ({
    id: id ?? `ar_u${(value.codePointAt(0) ?? 0).toString(16)}`,
    label,
    value,
  });

  const row1 = 'ضصثقفغعهخحجد'.split('').map(c => key(c));
  const row2 = 'شسيبلاتنمكط'.split('').map(c => key(c));
  const row3 = [
    key('ء'),
    key('ئ'),
    key('ؤ'),
    key('ر'),
    key('لا', 'لا', 'ar_lam_alef'),
    key('ى'),
    key('ة'),
    key('و'),
    key('ز'),
    key('ظ'),
  ];

  return [
    row1,
    [
      {id: 'ar-stagger-start', label: '', type: 'spacer', flex: 0.5},
      ...row2,
      {id: 'ar-stagger-end', label: '', type: 'spacer', flex: 0.5},
    ],
    [
      {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
      ...row3,
      {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
    ],
    BOTTOM_ROW,
  ];
}

/** Cyrillic ЙЦУКЕН — based on standard Russian PC layout. */
function buildRussianLayout(): KeyDefinition[][] {
  const row1 = 'йцукенгшщзх';
  const row2 = 'фывапролджэ';
  const row3 = 'ячсмитьбю';
  return [
    [...row1].map(c => ({id: c, label: c, value: c})),
    [
      {id: 'ru-stagger-start', label: '', type: 'spacer', flex: 0.5},
      ...[...row2].map(c => ({id: c, label: c, value: c})),
      {id: 'ru-stagger-end', label: '', type: 'spacer', flex: 0.5},
    ],
    [
      {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
      ...[...row3].map(c => ({id: c, label: c, value: c})),
      {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
    ],
    BOTTOM_ROW,
  ];
}

/** Turkish Q — includes ğüşıöç on letter keys (Windows Turkish Q layout). */
function buildTurkishLayout(): KeyDefinition[][] {
  const row1 = [
    'q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü',
  ].map(c => ({id: `tr_${c}`, label: c, value: c}));
  const row2 = [
    'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i',
  ].map(c => ({id: `tr_${c}`, label: c, value: c}));
  const row3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç'].map(c => ({
    id: `tr_${c}`,
    label: c,
    value: c,
  }));
  return [
    row1,
    [
      {id: 'tr-stagger-start', label: '', type: 'spacer', flex: 0.5},
      ...row2,
      {id: 'tr-stagger-end', label: '', type: 'spacer', flex: 0.5},
    ],
    [
      {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
      ...row3,
      {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
    ],
    BOTTOM_ROW,
  ];
}

const LETTER_ROWS: Record<string, KeyDefinition[][]> = {
  'en-us': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'en-gb': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'fr-fr': buildLetterLayout('azertyuiop', 'qsdfghjklm', 'wxcvbn'),
  // QWERTZ without dedicated umlaut keys — ü/ö/ä/ß via long-press (like Gboard compact).
  'de-de': buildLetterLayout('qwertzuiop', 'asdfghjkl', 'yxcvbnm'),
  'es-es': buildLetterLayout('qwertyuiop', 'asdfghjklñ', 'zxcvbnm'),
  'it-it': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'pt-pt': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'pl-pl': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'tr-tr': buildTurkishLayout(),
  'nl-nl': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'sv-se': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'da-dk': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'nb-no': buildLetterLayout('qwertyuiop', 'asdfghjkl', 'zxcvbnm'),
  'ru-ru': buildRussianLayout(),
  'ar-sa': buildArabicLayout(),
};

export function isBuiltInLetterLayoutId(value: string): boolean {
  return value in LETTER_ROWS;
}

/** @deprecated Use isBuiltInLetterLayoutId */
export function isLetterLayoutId(value: string): value is LetterLayoutId {
  return isBuiltInLetterLayoutId(value);
}

export function isCustomLayoutId(value: string): boolean {
  return value.startsWith('custom:');
}

export function getBuiltInLetterLayoutMeta(id: LetterLayoutId): LetterLayoutMeta {
  return (
    LETTER_LAYOUT_CATALOG.find(entry => entry.id === id) ??
    LETTER_LAYOUT_CATALOG[0]
  );
}

export function getBuiltInLetterLayoutRows(id: LetterLayoutId): KeyDefinition[][] {
  return LETTER_ROWS[id] ?? LETTER_ROWS[DEFAULT_LETTER_LAYOUT_ID];
}

export function normalizeBuiltInLetterLayoutId(raw: unknown): LetterLayoutId {
  if (typeof raw === 'string' && isBuiltInLetterLayoutId(raw)) {
    return raw;
  }
  return DEFAULT_LETTER_LAYOUT_ID;
}
