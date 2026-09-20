import {
  executeShiftEditorShortcut,
  isShiftEditorShortcutEligible,
  shiftEditorShortcutAction,
  tryShiftEditorShortcut,
} from './shiftEditorShortcuts';
import {keyboardBridge} from '../keyboardBridge';

jest.mock('../keyboardBridge', () => ({
  keyboardBridge: {
    selectAll: jest.fn().mockResolvedValue(true),
    copySelection: jest.fn().mockResolvedValue(true),
    pasteClipboard: jest.fn().mockResolvedValue(true),
    cutSelection: jest.fn().mockResolvedValue(true),
  },
}));

const base = {
  enabled: true,
  shiftEditorHeld: true,
  capsLocked: false,
  layout: 'letters' as const,
  letter: 'c',
};

describe('shiftEditorShortcuts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isShiftEditorShortcutEligible', () => {
    it('accepts a/c/v/x with shift on letters layout', () => {
      expect(isShiftEditorShortcutEligible({...base, letter: 'a'})).toBe(true);
      expect(isShiftEditorShortcutEligible({...base, letter: 'V'})).toBe(true);
      expect(isShiftEditorShortcutEligible({...base, letter: 'x'})).toBe(true);
    });

    it('rejects when disabled, caps locked, or wrong layout', () => {
      expect(isShiftEditorShortcutEligible({...base, enabled: false})).toBe(
        false,
      );
      expect(isShiftEditorShortcutEligible({...base, capsLocked: true})).toBe(
        false,
      );
      expect(
        isShiftEditorShortcutEligible({...base, layout: 'numbers'}),
      ).toBe(false);
      expect(
        isShiftEditorShortcutEligible({...base, shiftEditorHeld: false}),
      ).toBe(false);
    });

    it('rejects non-chord letters', () => {
      expect(isShiftEditorShortcutEligible({...base, letter: 'b'})).toBe(false);
    });
  });

  describe('shiftEditorShortcutAction', () => {
    it('maps chord letters to actions', () => {
      expect(shiftEditorShortcutAction('a')).toBe('selectAll');
      expect(shiftEditorShortcutAction('C')).toBe('copy');
      expect(shiftEditorShortcutAction('v')).toBe('paste');
      expect(shiftEditorShortcutAction('X')).toBe('cut');
      expect(shiftEditorShortcutAction('z')).toBeNull();
    });
  });

  describe('tryShiftEditorShortcut', () => {
    it('invokes bridge and returns true for eligible chords', () => {
      expect(tryShiftEditorShortcut(base)).toBe(true);
      expect(keyboardBridge.copySelection).toHaveBeenCalled();
    });

    it('returns false when not eligible', () => {
      expect(tryShiftEditorShortcut({...base, letter: 'z'})).toBe(false);
      expect(keyboardBridge.copySelection).not.toHaveBeenCalled();
    });
  });

  describe('executeShiftEditorShortcut', () => {
    it('calls selectAll for shift+a', async () => {
      await executeShiftEditorShortcut('a');
      expect(keyboardBridge.selectAll).toHaveBeenCalled();
    });
  });
});
