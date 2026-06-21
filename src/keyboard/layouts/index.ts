import type {KeyDefinition} from './qwerty';
import {
  NUMPAD_ROWS,
  NUMBER_ROWS,
  SYMBOL_ROWS,
  type KeyboardLayout,
} from './qwerty';
import {
  DEFAULT_LETTER_LAYOUT_ID,
  LETTER_LAYOUT_CATALOG,
  type LetterLayoutId,
  type LetterLayoutMeta,
} from './letterLayouts';
import {
  getLetterLayoutMeta,
  getLetterLayoutRows as resolveLetterLayoutRows,
  isLetterLayoutId,
  normalizeLetterLayoutId,
} from './resolveLetterLayout';

export type {KeyDefinition, KeyboardLayout};
export {
  DEFAULT_LETTER_LAYOUT_ID,
  getLetterLayoutMeta,
  isLetterLayoutId,
  normalizeLetterLayoutId,
  type LetterLayoutId,
  type LetterLayoutMeta,
} from './resolveLetterLayout';
export {
  isBuiltInLetterLayoutId,
  isCustomLayoutId,
  LETTER_LAYOUT_CATALOG,
} from './letterLayouts';

export function getKeyboardRows(
  view: KeyboardLayout,
  letterLayoutId: LetterLayoutId = DEFAULT_LETTER_LAYOUT_ID,
): KeyDefinition[][] {
  switch (view) {
    case 'letters':
      return resolveLetterLayoutRows(letterLayoutId);
    case 'numbers':
      return NUMBER_ROWS;
    case 'symbols':
      return SYMBOL_ROWS;
    case 'numpad':
      return NUMPAD_ROWS;
    default:
      return resolveLetterLayoutRows(letterLayoutId);
  }
}
