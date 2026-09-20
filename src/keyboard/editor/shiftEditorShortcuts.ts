import {keyboardBridge} from '../keyboardBridge';

export type ShiftEditorShortcutLayout =
  | 'letters'
  | 'numbers'
  | 'symbols'
  | 'numpad';

export type ShiftEditorShortcutOptions = {
  enabled: boolean;
  /** True while the user is holding the Shift key (editor chord mode). */
  shiftEditorHeld: boolean;
  capsLocked: boolean;
  layout: ShiftEditorShortcutLayout;
  letter: string;
};

const CHORD_LETTERS = new Set(['a', 'c', 'v', 'x']);

export function isShiftEditorShortcutEligible(
  options: ShiftEditorShortcutOptions,
): boolean {
  if (!options.enabled) {
    return false;
  }
  if (
    options.layout !== 'letters' ||
    !options.shiftEditorHeld ||
    options.capsLocked
  ) {
    return false;
  }
  if (options.letter.length !== 1) {
    return false;
  }
  return CHORD_LETTERS.has(options.letter.toLowerCase());
}

export type ShiftEditorShortcutAction = 'selectAll' | 'copy' | 'paste' | 'cut';

export function shiftEditorShortcutAction(
  letter: string,
): ShiftEditorShortcutAction | null {
  switch (letter.toLowerCase()) {
    case 'a':
      return 'selectAll';
    case 'c':
      return 'copy';
    case 'v':
      return 'paste';
    case 'x':
      return 'cut';
    default:
      return null;
  }
}

export async function executeShiftEditorShortcut(
  letter: string,
): Promise<ShiftEditorShortcutAction | null> {
  const action = shiftEditorShortcutAction(letter);
  if (!action) {
    return null;
  }
  switch (action) {
    case 'selectAll':
      await keyboardBridge.selectAll();
      break;
    case 'copy':
      await keyboardBridge.copySelection();
      break;
    case 'paste':
      await keyboardBridge.pasteClipboard();
      break;
    case 'cut':
      await keyboardBridge.cutSelection();
      break;
  }
  return action;
}

/** Runs the chord when eligible. Returns true if the letter press should not type. */
export function tryShiftEditorShortcut(options: ShiftEditorShortcutOptions): boolean {
  if (!isShiftEditorShortcutEligible(options)) {
    return false;
  }
  void executeShiftEditorShortcut(options.letter);
  return true;
}
