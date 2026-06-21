import type {KeyDefinition} from './qwerty';
import {BOTTOM_ROW, SIDE_KEY_FLEX, STAGGER_FLEX} from './sharedRows';

function charKey(char: string): KeyDefinition {
  const lower =
    char.length === 1 && char.charCodeAt(0) <= 0x7f
      ? char.toLowerCase()
      : char;
  const id =
    lower.length === 1 && /[a-z0-9]/.test(lower)
      ? lower
      : `u${char.codePointAt(0)?.toString(16) ?? '0'}`;
  return {id, label: lower, value: lower};
}

/** Build the 3 alpha rows + shared bottom row from plain letter strings. */
export function buildLetterLayout(
  row1: string,
  row2: string,
  row3: string,
): KeyDefinition[][] {
  return [
    [...row1].map(charKey),
    [
      {id: 'row2-stagger-start', label: '', type: 'spacer', flex: STAGGER_FLEX},
      ...[...row2].map(charKey),
      {id: 'row2-stagger-end', label: '', type: 'spacer', flex: STAGGER_FLEX},
    ],
    [
      {id: 'shift', label: '⇧', type: 'shift', flex: SIDE_KEY_FLEX},
      ...[...row3].map(charKey),
      {id: 'backspace', label: '⌫', type: 'backspace', flex: SIDE_KEY_FLEX},
    ],
    BOTTOM_ROW,
  ];
}
