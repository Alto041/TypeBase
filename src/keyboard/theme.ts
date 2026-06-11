const KEY_ROW_COUNT = 4;
const KEYS_PADDING_TOP = 6;
const IME_STRIP_CLEARANCE = 46;
/** Extra headroom so the suggestion bar and bottom row are never clipped. */
const KEYBOARD_HEIGHT_BUFFER = 6;

const KEY_HEIGHT = 52;
const KEY_ROW_MARGIN = 10;
const KEY_GAP = 4;
const NUMPAD_KEY_HEIGHT = 46;
const NUMPAD_KEYS_PADDING_TOP = 2;

export type KeyboardColorScheme = 'light' | 'dark';

type KeyboardPalette = {
  container: string;
  letterKey: string;
  modifierKey: string;
  letterKeyPressed: string;
  modifierKeyPressed: string;
  pluginCard: string;
  pluginCardSecondary: string;
  enter: string;
  enterPressed: string;
  label: string;
  spaceLabel: string;
  icon: string;
  iconMuted: string;
  iconOnEnter: string;
  suggestionDivider: string;
  essentialsAccent: string;
  swipeTrail: string;
  launcherKey: string;
  chipSelectedBackground: string;
  chipSelectedText: string;
  borderSubtle: string;
  keyRipple: string;
};

const LIGHT_PALETTE: KeyboardPalette = {
  container: '#EEEEEE',
  letterKey: '#FFFFFF',
  modifierKey: '#D4D4D4',
  letterKeyPressed: '#E8E8E8',
  modifierKeyPressed: '#BFBFBF',
  pluginCard: '#FFFFFF',
  pluginCardSecondary: '#D4D4D4',
  enter: '#D71921',
  enterPressed: '#B8141C',
  label: '#000000',
  spaceLabel: '#6B6B6B',
  icon: '#000000',
  iconMuted: '#000000',
  iconOnEnter: '#FFFFFF',
  suggestionDivider: '#AEAEB2',
  essentialsAccent: '#FFC700',
  swipeTrail: '#FFD60A',
  launcherKey: '#D4D4D4',
  chipSelectedBackground: '#000000',
  chipSelectedText: '#FFFFFF',
  borderSubtle: '#D4D4D4',
  keyRipple: 'rgba(0, 0, 0, 0.1)',
};

const DARK_PALETTE: KeyboardPalette = {
  container: '#1F1F1F',
  letterKey: '#353535',
  modifierKey: '#353535',
  letterKeyPressed: '#454545',
  modifierKeyPressed: '#454545',
  pluginCard: '#353535',
  pluginCardSecondary: '#474747',
  enter: '#D71921',
  enterPressed: '#B8141C',
  label: '#FFFFFF',
  spaceLabel: '#AEAEB2',
  icon: '#FFFFFF',
  iconMuted: '#AEAEB2',
  iconOnEnter: '#FFFFFF',
  suggestionDivider: '#828282',
  essentialsAccent: '#FFC700',
  swipeTrail: '#FFD60A',
  launcherKey: '#474747',
  chipSelectedBackground: '#FFFFFF',
  chipSelectedText: '#1F1F1F',
  borderSubtle: '#454545',
  keyRipple: 'rgba(255, 255, 255, 0.14)',
};

export type KeyboardTheme = ReturnType<typeof createKeyboardTheme>;

export function createKeyboardTheme(scheme: KeyboardColorScheme) {
  const palette =
    scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

  return {
    ...palette,
    /** @deprecated Use letterKey */
    key: palette.letterKey,
    /** @deprecated Use letterKeyPressed for letter keys, modifierKeyPressed for others */
    keyPressed: palette.letterKeyPressed,
    /** @deprecated Use modifierKey */
    numpadActionKey: palette.modifierKey,
    suggestionBarHeight: 48,
    keysPaddingTop: KEYS_PADDING_TOP,
    imeStripClearance: IME_STRIP_CLEARANCE,
    essentialsPanelHeight: 136,
    keyHeight: KEY_HEIGHT,
    keyRowMargin: KEY_ROW_MARGIN,
    keyGap: KEY_GAP,
    numpadKeyHeight: NUMPAD_KEY_HEIGHT,
    numpadKeysPaddingTop: NUMPAD_KEYS_PADDING_TOP,
    keyRowPaddingHorizontal: 5,
    emojiPanelHeight: KEY_HEIGHT * 3 + KEY_ROW_MARGIN * 3,
    emojiPanelGap: 12,
    keyboardHeightDp:
      48 +
      KEYS_PADDING_TOP +
      KEY_ROW_COUNT * KEY_HEIGHT +
      KEY_ROW_COUNT * KEY_ROW_MARGIN +
      IME_STRIP_CLEARANCE +
      KEYBOARD_HEIGHT_BUFFER,
    numpadKeyboardHeightDp:
      48 +
      NUMPAD_KEYS_PADDING_TOP +
      4 * NUMPAD_KEY_HEIGHT +
      4 * KEY_GAP +
      IME_STRIP_CLEARANCE,
    fontFamily: 'Geist' as const,
  };
}

/** Default theme for modules that load before KeyboardThemeProvider mounts. */
export const keyboardTheme = createKeyboardTheme('light');
