const KEY_ROW_COUNT = 4;
const KEYS_PADDING_TOP = 6;
const IME_STRIP_CLEARANCE = 46;
/** Extra headroom so the suggestion bar and bottom row are never clipped. */
const KEYBOARD_HEIGHT_BUFFER = 6;

const KEY_HEIGHT = 52;
const KEY_ROW_MARGIN = 10;

export const keyboardTheme = {
  container: '#1F1F1F',
  suggestionBarHeight: 48,
  keysPaddingTop: KEYS_PADDING_TOP,
  imeStripClearance: IME_STRIP_CLEARANCE,
  essentialsPanelHeight: 136,
  essentialsAccent: '#FFC700',
  keyHeight: KEY_HEIGHT,
  keyRowMargin: KEY_ROW_MARGIN,
  keyGap: 4,
  keyRowPaddingHorizontal: 2,
  /** Matches the vertical space of the top 3 QWERTY rows above the bottom row. */
  emojiPanelHeight: KEY_HEIGHT * 3 + KEY_ROW_MARGIN * 3,
  emojiPanelGap: 12,
  /**
   * Total IME window height — keep in sync with TypeBaseInputService.DEFAULT_KEYBOARD_HEIGHT_DP.
   * suggestion bar + key rows + row gaps + padding + system strip clearance + buffer.
   */
  keyboardHeightDp:
    48 +
    KEYS_PADDING_TOP +
    KEY_ROW_COUNT * KEY_HEIGHT +
    KEY_ROW_COUNT * KEY_ROW_MARGIN +
    IME_STRIP_CLEARANCE +
    KEYBOARD_HEIGHT_BUFFER,
  key: '#353535',
  keyPressed: '#454545',
  enter: '#D71921',
  enterPressed: '#B8141C',
  label: '#FFFFFF',
  spaceLabel: '#AEAEB2',
  fontFamily: 'Geist',
  swipeTrail: '#FFD60A',
  suggestionDivider: '#828282',
} as const;
