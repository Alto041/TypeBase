import type {KeyDefinition} from './qwerty';

export const STAGGER_FLEX = 0.5;
export const SIDE_KEY_FLEX = 1.5;
export const BOTTOM_ROW_EDGE_FLEX = 1.15;
export const BOTTOM_ROW_SPACE_FLEX = 3.5;
/** Apple bottom row — wider space + enter after dropping comma/period. */
export const APPLE_BOTTOM_ROW_SPACE_FLEX = 4.35;
export const APPLE_BOTTOM_ROW_ENTER_FLEX = 1.42;

export const BOTTOM_ROW: KeyDefinition[] = [
  {id: 'numbers', label: '?123', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX},
  {id: 'comma', label: ',', value: ',', type: 'comma'},
  {id: 'space', label: 'space', type: 'space', flex: BOTTOM_ROW_SPACE_FLEX},
  {id: 'period', label: '.', value: '.', type: 'period'},
  {id: 'enter', label: '↵', type: 'enter', flex: BOTTOM_ROW_EDGE_FLEX},
];

export const APPLE_BOTTOM_ROW: KeyDefinition[] = [
  {id: 'numbers', label: '?123', type: 'numbers', flex: BOTTOM_ROW_EDGE_FLEX},
  {id: 'emoji', label: '', type: 'emoji'},
  {id: 'space', label: 'space', type: 'space', flex: APPLE_BOTTOM_ROW_SPACE_FLEX},
  {id: 'enter', label: '↵', type: 'enter', flex: APPLE_BOTTOM_ROW_ENTER_FLEX},
];
