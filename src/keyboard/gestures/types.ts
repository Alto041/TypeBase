export type GestureSettingKey =
  | 'swipeTyping'
  | 'spaceCursorSwipe'
  | 'backspaceWordSwipe'
  | 'backspaceSentenceHold'
  | 'commaLauncher'
  | 'shiftEditorShortcuts'
  | 'undoRedo'
  | 'trackpadMode';

export type GestureSettings = Record<GestureSettingKey, boolean>;

export type GestureFeature = {
  key: GestureSettingKey;
  title: string;
  description: string;
};

export type LaunchableApp = {
  packageName: string;
  label: string;
};

export const DEFAULT_LAUNCHER_APP_PACKAGE = 'com.typebase.app';

export const GESTURE_FEATURES: GestureFeature[] = [
  {
    key: 'swipeTyping',
    title: 'Swipe typing',
    description: 'Glide across letters to type words.',
  },
  {
    key: 'spaceCursorSwipe',
    title: 'Spacebar cursor',
    description: 'Swipe on the spacebar to move the cursor left or right.',
  },
  {
    key: 'backspaceWordSwipe',
    title: 'Swipe backspace',
    description: 'Swipe left on backspace to delete the previous word.',
  },
  {
    key: 'backspaceSentenceHold',
    title: 'Hold backspace',
    description:
      'After a long hold, backspace deletes whole sentences instead of single letters.',
  },
  {
    key: 'commaLauncher',
    title: 'Comma & period shortcuts',
    description:
      'Hold , for AI rewrite. Hold . to arm clipboard, then tap to open the clipboard panel.',
  },
  {
    key: 'shiftEditorShortcuts',
    title: 'Shift editor shortcuts',
    description:
      'Hold Shift, then tap A/C/V/X for select all, copy, paste, or cut.',
  },
  {
    key: 'undoRedo',
    title: 'Undo / Redo',
    description:
      'Show undo and redo buttons on the suggestion bar when you stop typing.',
  },
  {
    key: 'trackpadMode',
    title: 'Trackpad mode',
    description: 'Drag anywhere on the keyboard to move the cursor.',
  },
];

export const DEFAULT_GESTURE_SETTINGS: GestureSettings = {
  swipeTyping: true,
  spaceCursorSwipe: true,
  backspaceWordSwipe: true,
  backspaceSentenceHold: false,
  commaLauncher: true,
  shiftEditorShortcuts: true,
  undoRedo: false,
  trackpadMode: true,
};
