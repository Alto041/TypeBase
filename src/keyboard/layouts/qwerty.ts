import {buildLetterLayout} from './buildLetterLayout';
import {BOTTOM_ROW_EDGE_FLEX, BOTTOM_ROW_SPACE_FLEX, SIDE_KEY_FLEX} from './sharedRows';

export type KeyType =
  | 'char'
  | 'backspace'
  | 'comma'
  | 'period'
  | 'space'
  | 'enter'
  | 'shift'
  | 'numbers'
  | 'symbols'
  | 'essentials-back'
  | 'essentials-save'
  | 'enter-backspace'
  | 'numpad-back'
  | 'letters'
  | 'spacer';

export type KeyDefinition = {
  id: string;
  label: string;
  value?: string;
  type?: KeyType;
  flex?: number;
  width?: number;
};

/** Gboard-style ASDF row inset: half a key width on each side via flex spacers. */
const SIDE_KEY_FLEX_LOCAL = SIDE_KEY_FLEX;
/** Bottom-row ?123 / ABC and enter — kept narrower than shift/backspace. */
const BOTTOM_ROW_EDGE_FLEX_LOCAL = BOTTOM_ROW_EDGE_FLEX;
const BOTTOM_ROW_SPACE_FLEX_LOCAL = BOTTOM_ROW_SPACE_FLEX;

export const QWERTY_ROWS: KeyDefinition[][] = buildLetterLayout(
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
);

export const DIGITS_ROW: KeyDefinition[] = [
  {id: '1', label: '1', value: '1'},
  {id: '2', label: '2', value: '2'},
  {id: '3', label: '3', value: '3'},
  {id: '4', label: '4', value: '4'},
  {id: '5', label: '5', value: '5'},
  {id: '6', label: '6', value: '6'},
  {id: '7', label: '7', value: '7'},
  {id: '8', label: '8', value: '8'},
  {id: '9', label: '9', value: '9'},
  {id: '0', label: '0', value: '0'},
];

export const NUMBER_ROWS: KeyDefinition[][] = [
  DIGITS_ROW,
  [
    {id: 'at', label: '@', value: '@'},
    {id: 'hash', label: '#', value: '#'},
    {id: 'dollar', label: '$', value: '$'},
    {id: 'percent', label: '%', value: '%'},
    {id: 'ampersand', label: '&', value: '&'},
    {id: 'dash', label: '-', value: '-'},
    {id: 'plus', label: '+', value: '+'},
    {id: 'open_paren', label: '(', value: '('},
    {id: 'close_paren', label: ')', value: ')'},
    {id: 'slash', label: '/', value: '/'},
  ],
  [
    {id: 'symbols', label: '=\\<', type: 'symbols', flex: SIDE_KEY_FLEX_LOCAL},
    {id: 'star', label: '*', value: '*'},
    {id: 'quote', label: '"', value: '"'},
    {id: 'single_quote', label: "'", value: "'"},
    {id: 'colon', label: ':', value: ':'},
    {id: 'semicolon', label: ';', value: ';'},
    {id: 'exclamation', label: '!', value: '!'},
    {id: 'question', label: '?', value: '?'},
    {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX_LOCAL},
  ],
  [
    {id: 'abc', label: 'ABC', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX_LOCAL},
    {id: 'comma', label: ',', value: ',', type: 'comma'},
    {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
    {id: 'period', label: '.', value: '.', type: 'period'},
    {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX_LOCAL},
  ],
];

export const SYMBOL_ROWS: KeyDefinition[][] = [
  [
    {id: 'tilde', label: '~', value: '~'},
    {id: 'backtick', label: '`', value: '`'},
    {id: 'pipe', label: '|', value: '|'},
    {id: 'bullet', label: '•', value: '•'},
    {id: 'sqrt', label: '√', value: '√'},
    {id: 'pi', label: 'π', value: 'π'},
    {id: 'divide', label: '÷', value: '÷'},
    {id: 'multiply', label: '×', value: '×'},
    {id: 'paragraph', label: '¶', value: '¶'},
    {id: 'delta', label: '∆', value: '∆'},
  ],
  [
    {id: 'pound', label: '£', value: '£'},
    {id: 'cent', label: '¢', value: '¢'},
    {id: 'euro', label: '€', value: '€'},
    {id: 'yen', label: '¥', value: '¥'},
    {id: 'caret', label: '^', value: '^'},
    {id: 'degree', label: '°', value: '°'},
    {id: 'equals', label: '=', value: '='},
    {id: 'open_brace', label: '{', value: '{'},
    {id: 'close_brace', label: '}', value: '}'},
    {id: 'backslash', label: '\\', value: '\\'},
  ],
  [
    {id: 'numbers', label: '?123', type: 'numbers', flex: SIDE_KEY_FLEX_LOCAL},
    {id: 'underscore', label: '_', value: '_'},
    {id: 'open_bracket', label: '[', value: '['},
    {id: 'close_bracket', label: ']', value: ']'},
    {id: 'less', label: '<', value: '<'},
    {id: 'greater', label: '>', value: '>'},
    {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX_LOCAL},
  ],
  [
    {id: 'abc', label: 'ABC', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX_LOCAL},
    {id: 'comma', label: ',', value: ',', type: 'comma'},
    {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
    {id: 'period', label: '.', value: '.', type: 'period'},
    {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX_LOCAL},
  ],
];

/** Phone-style numeric pad — 4 equal columns, 4 rows. */
export const NUMPAD_ROWS: KeyDefinition[][] = [
  [
    {id: '1', label: '1', value: '1'},
    {id: '2', label: '2', value: '2'},
    {id: '3', label: '3', value: '3'},
    {id: 'numpad-back', label: '', type: 'numpad-back'},
  ],
  [
    {id: '4', label: '4', value: '4'},
    {id: '5', label: '5', value: '5'},
    {id: '6', label: '6', value: '6'},
    {id: 'space', label: 'space', type: 'space'},
  ],
  [
    {id: '7', label: '7', value: '7'},
    {id: '8', label: '8', value: '8'},
    {id: '9', label: '9', value: '9'},
    {id: 'enter', label: '', type: 'enter'},
  ],
  [
    {id: 'numpad-gap-left', label: '', type: 'spacer'},
    {id: '0', label: '0', value: '0'},
    {id: 'numpad-gap-right', label: '', type: 'spacer'},
    {id: 'abc', label: 'ABC', type: 'letters'},
  ],
];

export type KeyboardLayout = 'letters' | 'numbers' | 'symbols' | 'numpad';

export const LAYOUTS: Record<KeyboardLayout, KeyDefinition[][]> = {
  letters: QWERTY_ROWS,
  numbers: NUMBER_ROWS,
  symbols: SYMBOL_ROWS,
  numpad: NUMPAD_ROWS,
};

