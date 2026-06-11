export type KeyType =
  | 'char'
  | 'backspace'
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
const ASDF_ROW_STAGGER_FLEX = 0.5;
/** Shift, backspace, and row-3 mode keys (=\\<, ?123 on symbols row). */
const SIDE_KEY_FLEX = 1.5;
/** Bottom-row ?123 / ABC and enter — kept narrower than shift/backspace. */
const BOTTOM_ROW_EDGE_FLEX = 1.15;
const BOTTOM_ROW_SPACE_FLEX = 3.5;

export const QWERTY_ROWS: KeyDefinition[][] = [
  [
    {id: 'q', label: 'q', value: 'q'},
    {id: 'w', label: 'w', value: 'w'},
    {id: 'e', label: 'e', value: 'e'},
    {id: 'r', label: 'r', value: 'r'},
    {id: 't', label: 't', value: 't'},
    {id: 'y', label: 'y', value: 'y'},
    {id: 'u', label: 'u', value: 'u'},
    {id: 'i', label: 'i', value: 'i'},
    {id: 'o', label: 'o', value: 'o'},
    {id: 'p', label: 'p', value: 'p'},
  ],
  [
    {id: 'asdf-stagger-start', type: 'spacer', flex: ASDF_ROW_STAGGER_FLEX},
    {id: 'a', label: 'a', value: 'a'},
    {id: 's', label: 's', value: 's'},
    {id: 'd', label: 'd', value: 'd'},
    {id: 'f', label: 'f', value: 'f'},
    {id: 'g', label: 'g', value: 'g'},
    {id: 'h', label: 'h', value: 'h'},
    {id: 'j', label: 'j', value: 'j'},
    {id: 'k', label: 'k', value: 'k'},
    {id: 'l', label: 'l', value: 'l'},
    {id: 'asdf-stagger-end', type: 'spacer', flex: ASDF_ROW_STAGGER_FLEX},
  ],
  [
    {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
    {id: 'z', label: 'z', value: 'z'},
    {id: 'x', label: 'x', value: 'x'},
    {id: 'c', label: 'c', value: 'c'},
    {id: 'v', label: 'v', value: 'v'},
    {id: 'b', label: 'b', value: 'b'},
    {id: 'n', label: 'n', value: 'n'},
    {id: 'm', label: 'm', value: 'm'},
    {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
  ],
  [
    {id: 'numbers', label: '?123', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX},
    {id: 'comma', label: ',', value: ','},
    {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
    {id: 'period', label: '.', value: '.'},
    {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX},
  ],
];

export const NUMBER_ROWS: KeyDefinition[][] = [
  [
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
  ],
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
    {id: 'symbols', label: '=\\<', type: 'symbols', flex: SIDE_KEY_FLEX},
    {id: 'star', label: '*', value: '*'},
    {id: 'quote', label: '"', value: '"'},
    {id: 'single_quote', label: "'", value: "'"},
    {id: 'colon', label: ':', value: ':'},
    {id: 'semicolon', label: ';', value: ';'},
    {id: 'exclamation', label: '!', value: '!'},
    {id: 'question', label: '?', value: '?'},
    {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
  ],
  [
    {id: 'abc', label: 'ABC', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX},
    {id: 'comma', label: ',', value: ','},
    {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
    {id: 'period', label: '.', value: '.'},
    {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX},
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
    {id: 'numbers', label: '?123', type: 'numbers', flex: SIDE_KEY_FLEX},
    {id: 'underscore', label: '_', value: '_'},
    {id: 'open_bracket', label: '[', value: '['},
    {id: 'close_bracket', label: ']', value: ']'},
    {id: 'less', label: '<', value: '<'},
    {id: 'greater', label: '>', value: '>'},
    {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
  ],
  [
    {id: 'abc', label: 'ABC', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX},
    {id: 'comma', label: ',', value: ','},
    {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
    {id: 'period', label: '.', value: '.'},
    {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX},
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

