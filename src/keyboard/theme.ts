import {Platform, type ViewStyle} from 'react-native';
import type {KeyboardLayout} from './layouts/qwerty';
import {
  DEFAULT_LETTER_LAYOUT_ID,
  type LetterLayoutId,
} from './layouts/letterLayouts';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  type ControllerSettings,
} from './controller/controllerSettings';

const KEY_ROW_COUNT = 4;
const KEYS_PADDING_TOP = 6;
const IME_STRIP_CLEARANCE = 46;
/** Extra headroom so the suggestion bar and bottom row are never clipped. */
const KEYBOARD_HEIGHT_BUFFER = 6;
const MIN_RESIZED_KEYBOARD_HEIGHT = 245;
const MAX_RESIZED_KEYBOARD_HEIGHT = 510;

const KEY_HEIGHT = 47;
const KEY_ROW_MARGIN = 12;
const KEY_GAP = 5;
const KEY_RADIUS = 6;

export type KeyboardLayoutSettings = {
  keyHeight: number;
  keyGap: number;
  keyRowMargin: number;
  keyRadius: number;
  /** Letter key arrangement (QWERTY, AZERTY, QWERTZ, Cyrillic, …). */
  letterLayoutId: LetterLayoutId;
  /**
   * When true, Enter key uses the "accent/red" palette.
   * When false, Enter key uses the normal modifier key cap color.
   */
  enterKeyPreviewEnabled: boolean;
  /** When true, show JSON theme editor on the Themes page. */
  developerEyeEnabled: boolean;
  /**
   * When true, long-press on letter keys offers symbols/numbers (a→@, q→1, …)
   * instead of accent variants (á, è, …).
   */
  letterSymbolAlternatesEnabled: boolean;
  /** When true, show a dedicated number row (1 2 … 0) above the letter rows. */
  numberRowEnabled: boolean;
  /**
   * User-controlled height adjustment in dp (positive = taller keyboard,
   * negative = shorter). Applied on top of the computed base height for letters view.
   */
  keyboardHeightOffset: number;
  /** When true, play the imported custom tap sound on key press. */
  customTapSoundEnabled: boolean;
  /** File name under keyboard_tap_sounds/ (e.g. custom_tap.mp3). */
  customTapSoundFile: string | null;
  /** When true, vibrate on each key press. */
  keyHapticEnabled: boolean;
  /** Key-press haptic pulse length in ms (lower = lighter / snappier). */
  keyHapticPulseMs: number;
  /**
   * When true, automatically enable shift for the first letter of a field /
   * sentence (and after `.?!`).
   */
  autoCapitalizeEnabled: boolean;
  /** When true, use a user-uploaded custom font for the keyboard. */
  customFontEnabled: boolean;
  /** Basename of the font file stored under keyboard_fonts/ (e.g. custom_keyboard_font.ttf). */
  customFontFile: string | null;
  /** Controller/gamepad navigation and button mapping settings. */
  controller: ControllerSettings;
};

export const DEFAULT_KEYBOARD_LAYOUT_SETTINGS: KeyboardLayoutSettings = {
  keyHeight: KEY_HEIGHT,
  keyGap: KEY_GAP,
  keyRowMargin: KEY_ROW_MARGIN,
  keyRadius: KEY_RADIUS,
  enterKeyPreviewEnabled: true,
  developerEyeEnabled: false,
  letterLayoutId: DEFAULT_LETTER_LAYOUT_ID,
  letterSymbolAlternatesEnabled: true,
  numberRowEnabled: false,
  keyboardHeightOffset: 0,
  customTapSoundEnabled: true,
  customTapSoundFile: '1.mp3',
  keyHapticEnabled: true,
  keyHapticPulseMs: 12,
  autoCapitalizeEnabled: true,
  customFontEnabled: false,
  customFontFile: null,
  controller: DEFAULT_CONTROLLER_SETTINGS,
};

/** Touch slop into gaps — horizontal fills keyGap; vertical reaches row gaps without full overlap. */
export const KEY_HIT_SLOP = {
  horizontal: DEFAULT_KEYBOARD_LAYOUT_SETTINGS.keyGap,
  vertical:
    Math.ceil(DEFAULT_KEYBOARD_LAYOUT_SETTINGS.keyRowMargin / 2) +
    DEFAULT_KEYBOARD_LAYOUT_SETTINGS.keyGap,
};
const NUMPAD_KEYS_PADDING_TOP = 2;

export type KeyboardColorScheme = 'light' | 'dark';
export type KeyboardDesign = 'typebase' | 'quivox' | 'macintosh' | 'apple' | 'custom';

/** Nothing-style key grid (rect caps, standard row layout) — includes Apple variant. */
export function usesNothingKeyboardLayout(design: KeyboardDesign): boolean {
  return design === 'typebase' || design === 'apple';
}

/** Nothing theme — translucent keys and frosted tray chrome. */
export function usesFrostedGlassTheme(design: KeyboardDesign): boolean {
  return design === 'typebase';
}

type KeyboardPalette = {
  container: string;
  letterKey: string;
  modifierKey: string;
  spaceKey: string;
  letterKeyPressed: string;
  modifierKeyPressed: string;
  spaceKeyPressed: string;
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

const CUSTOM_THEME_KEYS: Array<keyof KeyboardPalette> = [
  'container',
  'letterKey',
  'modifierKey',
  'spaceKey',
  'letterKeyPressed',
  'modifierKeyPressed',
  'spaceKeyPressed',
  'pluginCard',
  'pluginCardSecondary',
  'enter',
  'enterPressed',
  'label',
  'spaceLabel',
  'icon',
  'iconMuted',
  'iconOnEnter',
  'suggestionDivider',
  'essentialsAccent',
  'swipeTrail',
  'launcherKey',
  'chipSelectedBackground',
  'chipSelectedText',
  'borderSubtle',
  'keyRipple',
];

function isValidHexColor(value: string): boolean {
  const v = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
}

function isValidRgbOrRgba(value: string): boolean {
  // Accepts:
  // - rgb(r, g, b)
  // - rgba(r, g, b, a)
  const v = value.trim();
  return /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(
    v,
  );
}

function isCssColor(value: unknown): value is string {
  return typeof value === 'string' && (isValidHexColor(value) || isValidRgbOrRgba(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paletteForCustomTheme(
  scheme: KeyboardColorScheme,
  customThemeJson: string | null | undefined,
): KeyboardPalette {
  const base = scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
  if (!customThemeJson) {
    return base;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(customThemeJson);
  } catch {
    return base;
  }

  if (!parsed || typeof parsed !== 'object') {
    return base;
  }

  const obj = parsed as Record<string, unknown>;
  const overlay: Partial<KeyboardPalette> = {};

  for (const key of CUSTOM_THEME_KEYS) {
    const raw = obj[key as string];
    if (isCssColor(raw)) {
      overlay[key] = raw;
    }
  }

  return {...base, ...overlay} as KeyboardPalette;
}

export const CUSTOM_THEME_PROPERTY_KEYS = CUSTOM_THEME_KEYS;

function parseSavedCustomThemeObject(
  savedJson?: string | null,
): Partial<Record<keyof KeyboardPalette, string>> {
  if (!savedJson?.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(savedJson);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const obj = parsed as Record<string, unknown>;
  const saved: Partial<Record<keyof KeyboardPalette, string>> = {};

  for (const key of CUSTOM_THEME_KEYS) {
    const raw = obj[key as string];
    if (isCssColor(raw)) {
      saved[key] = raw;
    }
  }

  return saved;
}

/** Always show every custom-theme key in the editor (blank = use default). */
export function formatCustomThemeJsonForEditor(savedJson?: string | null): string {
  const saved = parseSavedCustomThemeObject(savedJson);
  const template: Record<string, string> = {};

  for (const key of CUSTOM_THEME_KEYS) {
    template[key] = saved[key] ?? '';
  }

  return JSON.stringify(template, null, 2);
}

export function parseCustomThemeJsonFromEditor(editorJson: string):
  | {ok: true; storageJson: string; editorJson: string}
  | {ok: false; error: string} {
  const trimmed = editorJson.trim();
  if (!trimmed) {
    return {ok: false, error: 'JSON required'};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {ok: false, error: 'Invalid JSON'};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {ok: false, error: 'Use a JSON object'};
  }

  const obj = parsed as Record<string, unknown>;
  const filtered: Record<string, string> = {};

  for (const key of CUSTOM_THEME_KEYS) {
    const raw = obj[key as string];
    if (typeof raw === 'string' && raw.trim() && isCssColor(raw.trim())) {
      filtered[key] = raw.trim();
    }
  }

  const storageJson = JSON.stringify(filtered);
  return {
    ok: true,
    storageJson,
    editorJson: formatCustomThemeJsonForEditor(storageJson),
  };
}

const LIGHT_PALETTE: KeyboardPalette = {
  container: '#EEEEEE',
  letterKey: '#FFFFFF',
  modifierKey: '#D4D4D4',
  spaceKey: '#D4D4D4',
  letterKeyPressed: '#E8E8E8',
  modifierKeyPressed: '#BFBFBF',
  spaceKeyPressed: '#BFBFBF',
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
  // Non-alphanumeric keys use a slightly lighter neutral cap.
  modifierKey: '#474747',
  spaceKey: '#474747',
  letterKeyPressed: '#454545',
  modifierKeyPressed: '#353535',
  spaceKeyPressed: '#353535',
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

/** Nothing (typebase) — frosted translucent keys over a solid tray. */
const TYPEBASE_LIGHT_PALETTE: KeyboardPalette = {
  ...LIGHT_PALETTE,
  letterKey: 'rgba(255, 255, 255, 0.34)',
  modifierKey: 'rgba(255, 255, 255, 0.28)',
  spaceKey: 'rgba(255, 255, 255, 0.28)',
  letterKeyPressed: 'rgba(255, 255, 255, 0.5)',
  modifierKeyPressed: 'rgba(228, 228, 230, 0.42)',
  spaceKeyPressed: 'rgba(228, 228, 230, 0.42)',
  enter: 'rgba(215, 25, 33, 0.88)',
  enterPressed: 'rgba(184, 20, 28, 0.92)',
  launcherKey: 'rgba(255, 255, 255, 0.28)',
  borderSubtle: 'rgba(255, 255, 255, 0.58)',
  keyRipple: 'rgba(0, 0, 0, 0.08)',
};

const TYPEBASE_DARK_PALETTE: KeyboardPalette = {
  ...DARK_PALETTE,
  letterKey: 'rgba(72, 72, 74, 0.34)',
  modifierKey: 'rgba(84, 84, 88, 0.3)',
  spaceKey: 'rgba(84, 84, 88, 0.3)',
  letterKeyPressed: 'rgba(96, 96, 100, 0.52)',
  modifierKeyPressed: 'rgba(58, 58, 60, 0.48)',
  spaceKeyPressed: 'rgba(58, 58, 60, 0.48)',
  enter: 'rgba(215, 25, 33, 0.88)',
  enterPressed: 'rgba(184, 20, 28, 0.92)',
  launcherKey: 'rgba(84, 84, 88, 0.3)',
  borderSubtle: 'rgba(255, 255, 255, 0.16)',
  keyRipple: 'rgba(255, 255, 255, 0.1)',
};

/** Apple — Nothing layout with iOS-style blue action key. */
const APPLE_LIGHT_PALETTE: KeyboardPalette = {
  ...LIGHT_PALETTE,
  enter: '#007AFF',
  enterPressed: '#0056B3',
  iconOnEnter: '#FFFFFF',
  essentialsAccent: '#007AFF',
  swipeTrail: '#64B5F6',
};

const APPLE_DARK_PALETTE: KeyboardPalette = {
  ...DARK_PALETTE,
  enter: '#0A84FF',
  enterPressed: '#0066CC',
  iconOnEnter: '#FFFFFF',
  essentialsAccent: '#0A84FF',
  swipeTrail: '#5AC8FA',
};

/**
 * Quivox dark — charcoal tray, soft dark caps, light space bar.
 */
const QUIVOX_DARK_PALETTE: KeyboardPalette = {
  container: '#181818',

  letterKey: '#2A2A2A',
  modifierKey: '#343434',
  spaceKey: '#F2F2F2',

  letterKeyPressed: '#3A3A3A',
  modifierKeyPressed: '#454545',
  spaceKeyPressed: '#DDDDDD',

  pluginCard: '#222222',
  pluginCardSecondary: '#2B2B2B',

  enter: '#FFFFFF',
  enterPressed: '#E6E6E6',

  label: '#F5F5F5',
  // Secondary UI text on dark plugin panels (not the space-key face color).
  spaceLabel: '#AEAEB2',

  icon: '#EAEAEA',
  iconMuted: '#8A8A8A',
  iconOnEnter: '#111111',

  suggestionDivider: '#3A3A3A',

  essentialsAccent: '#FFFFFF',

  swipeTrail: '#BDBDBD',

  launcherKey: '#2F2F2F',

  chipSelectedBackground: '#FFFFFF',
  chipSelectedText: '#111111',

  borderSubtle: '#404040',

  keyRipple: '#5A5A5A',
};

/**
 * Quivox light — soft gray tray with bright caps and dark labels.
 */
const QUIVOX_LIGHT_PALETTE: KeyboardPalette = {
  container: '#E8E8E8',

  letterKey: '#F6F6F6',
  modifierKey: '#D9D9D9',
  spaceKey: '#FFFFFF',

  letterKeyPressed: '#DCDCDC',
  modifierKeyPressed: '#C8C8C8',
  spaceKeyPressed: '#EAEAEA',

  pluginCard: '#F4F4F4',
  pluginCardSecondary: '#ECECEC',

  enter: '#FFFFFF',
  enterPressed: '#EAEAEA',

  label: '#1A1A1A',
  // Secondary UI text on light plugin panels.
  spaceLabel: '#6B6B6B',

  icon: '#222222',
  iconMuted: '#8A8A8A',
  iconOnEnter: '#111111',

  suggestionDivider: '#D5D5D5',

  essentialsAccent: '#FFFFFF',

  swipeTrail: '#8F8F8F',

  launcherKey: '#EFEFEF',

  chipSelectedBackground: '#FFFFFF',
  chipSelectedText: '#111111',

  borderSubtle: '#D2D2D2',

  keyRipple: '#CFCFCF',
};

/** Quivox press motion — rounded caps swell slightly on touch. */
export const QUIVOX_KEY_PRESS_SCALE = 1.08;
/** Space is wide — keep the grow subtler so it doesn't balloon. */
export const QUIVOX_SPACE_PRESS_SCALE = 1.03;

/**
 * Macintosh — classic beige keyboard caps with warm off-white keys.
 */
const MACINTOSH_KEYS = {
  letterKey: '#EEEAE0',
  letterKeyPressed: '#D8D3C7',
  modifierKey: '#DCD7CB',
  modifierKeyPressed: '#C8C3B7',
  spaceKey: '#DCD7CB',
  spaceKeyPressed: '#C8C3B7',
  pluginCard: '#E4E0D6',
  pluginCardSecondary: '#D4CFC3',
  enter: '#DCD7CB',
  enterPressed: '#C8C3B7',
  label: '#1A1A1A',
  spaceLabel: '#4A4A4A',
  icon: '#1A1A1A',
  iconMuted: '#5C5C5C',
  iconOnEnter: '#1A1A1A',
  suggestionDivider: '#9A9588',
  essentialsAccent: '#1A1A1A',
  swipeTrail: '#4A4A4A',
  launcherKey: '#DCD7CB',
  chipSelectedBackground: '#1A1A1A',
  chipSelectedText: '#EEEAE0',
  borderSubtle: '#6B665A',
  keyRipple: 'transparent',
} as const;

const MACINTOSH_LIGHT_PALETTE: KeyboardPalette = {
  ...LIGHT_PALETTE,
  ...MACINTOSH_KEYS,
  container: '#DAD7CE',
};

/**
 * Macintosh dark — warm charcoal tray with raised graphite caps,
 * same 3D chrome language as light, inverted contrast.
 */
const MACINTOSH_DARK_PALETTE: KeyboardPalette = {
  ...DARK_PALETTE,
  container: '#1E1C19',
  letterKey: '#3A3732',
  letterKeyPressed: '#2C2A26',
  modifierKey: '#4A4640',
  modifierKeyPressed: '#383530',
  spaceKey: '#4A4640',
  spaceKeyPressed: '#383530',
  pluginCard: '#3A3732',
  pluginCardSecondary: '#4A4640',
  enter: '#4A4640',
  enterPressed: '#383530',
  label: '#EDE9E0',
  spaceLabel: '#A8A297',
  icon: '#EDE9E0',
  iconMuted: '#A8A297',
  iconOnEnter: '#EDE9E0',
  suggestionDivider: '#5C574E',
  essentialsAccent: '#EDE9E0',
  swipeTrail: '#C8C3B7',
  launcherKey: '#4A4640',
  chipSelectedBackground: '#EDE9E0',
  chipSelectedText: '#1E1C19',
  borderSubtle: '#0F0E0C',
  keyRipple: 'transparent',
};

function paletteFor(
  scheme: KeyboardColorScheme,
  design: KeyboardDesign,
): KeyboardPalette {
  if (design === 'quivox') {
    return scheme === 'light' ? QUIVOX_LIGHT_PALETTE : QUIVOX_DARK_PALETTE;
  }
  if (design === 'macintosh') {
    return scheme === 'light' ? MACINTOSH_LIGHT_PALETTE : MACINTOSH_DARK_PALETTE;
  }
  if (design === 'apple') {
    return scheme === 'light' ? APPLE_LIGHT_PALETTE : APPLE_DARK_PALETTE;
  }
  if (design === 'typebase') {
    return scheme === 'light' ? TYPEBASE_LIGHT_PALETTE : TYPEBASE_DARK_PALETTE;
  }
  return scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

/**
 * Rounded chrome for the long-press alternate popup and its sliding selector.
 */
export function keyboardAlternatePopupRadii(
  theme: KeyboardTheme,
  popupHeight: number,
  cellSize: number,
): {containerRadius: number; selectorRadius: number} {
  const selectorRadius = cellSize / 2;
  const containerRadius =
    theme.design === 'quivox'
      ? popupHeight / 2
      : Math.min(theme.keyRadius + 2, popupHeight / 2);
  return {containerRadius, selectorRadius};
}

/**
 * Quivox press motion — circular/rounded caps grow slightly while held.
 */
export function keyboardKeyPressMotionStyle(
  theme: KeyboardTheme,
  pressed = false,
  options?: {subtle?: boolean},
): ViewStyle {
  if (theme.design !== 'quivox') {
    return {};
  }

  const scale = options?.subtle
    ? QUIVOX_SPACE_PRESS_SCALE
    : QUIVOX_KEY_PRESS_SCALE;

  return {
    transform: [{scale: pressed ? scale : 1}],
    zIndex: pressed ? 4 : 0,
  };
}

/**
 * Opaque key cap fill for previews/popups. Frosted typebase keys use translucent
 * rgba caps on the tray, but popups must stay solid.
 */
export function keyboardOpaqueKeyFill(
  theme: KeyboardTheme,
  variant: 'letter' | 'letterPressed' | 'modifierPressed' = 'letter',
): string {
  if (theme.design !== 'typebase') {
    if (variant === 'letterPressed') {
      return theme.letterKeyPressed;
    }
    if (variant === 'modifierPressed') {
      return theme.modifierKeyPressed;
    }
    return theme.letterKey;
  }

  const light = theme.scheme === 'light';
  if (variant === 'letterPressed') {
    return light ? '#E8E8E8' : '#454545';
  }
  if (variant === 'modifierPressed') {
    return light ? '#BFBFBF' : '#353535';
  }
  return light ? '#FFFFFF' : '#353535';
}

/**
 * Macintosh key outline — full 1px ring around the whole key so it
 * frames the inner corner/bottom bevels from MacintoshKeyBevels.
 */
export function keyboardKeyChromeStyle(
  theme: KeyboardTheme,
  pressed = false,
): ViewStyle {
  if (theme.design === 'typebase') {
    return {};
  }

  if (theme.design !== 'macintosh') {
    return {};
  }

  const outline = theme.borderSubtle;

  if (pressed) {
    return {
      borderWidth: 1,
      borderColor: outline,
      overflow: 'hidden',
      transform: [{translateY: 3}],
      ...(Platform.OS === 'android'
        ? {elevation: 0}
        : {
            shadowColor: 'transparent',
            shadowOpacity: 0,
          }),
    };
  }

  const raised: ViewStyle = {
    borderWidth: 1,
    borderColor: outline,
    overflow: 'hidden',
  };

  if (Platform.OS === 'android') {
    return {...raised, elevation: 2};
  }

  return {
    ...raised,
    shadowColor:
      theme.scheme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(90, 86, 78, 0.4)',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: theme.scheme === 'dark' ? 0.45 : 0.22,
    shadowRadius: 0,
  };
}

export type KeyboardTheme = ReturnType<typeof createKeyboardTheme>;

/** Bundled Geist face (assets/Geist-VariableFont_wght.ttf) — used for symbol hints & alternates. */
export const KEYBOARD_GEIST_FONT_FAMILY = 'Geist' as const;

export function keyboardGeistTypefaceStyle(
  fontWeight?: '400' | '500' | '600' | '700',
): {fontFamily: typeof KEYBOARD_GEIST_FONT_FAMILY; fontWeight?: '400' | '500' | '600' | '700'} {
  if (Platform.OS === 'android') {
    return {fontFamily: KEYBOARD_GEIST_FONT_FAMILY};
  }
  return fontWeight
    ? {fontFamily: KEYBOARD_GEIST_FONT_FAMILY, fontWeight}
    : {fontFamily: KEYBOARD_GEIST_FONT_FAMILY};
}

/** Text face for keyboard labels — Geist when loaded. */
export function keyboardTypefaceStyle(
  theme: KeyboardTheme,
  fontWeight?: '400' | '500' | '600' | '700',
): {fontFamily?: string; fontWeight?: '400' | '500' | '600' | '700'} {
  if (!theme.fontFamily) {
    return fontWeight ? {fontWeight} : {};
  }
  // Android Fabric crashes if fontWeight is combined with a single-file VF face.
  if (Platform.OS === 'android') {
    return {fontFamily: theme.fontFamily};
  }
  return fontWeight
    ? {fontFamily: theme.fontFamily, fontWeight}
    : {fontFamily: theme.fontFamily};
}

/** @deprecated Use keyboardTypefaceStyle */
export function keyboardTextFont(
  theme: KeyboardTheme,
): {fontFamily?: string} {
  return keyboardTypefaceStyle(theme);
}

export function createKeyboardTheme(
  scheme: KeyboardColorScheme,
  design: KeyboardDesign = 'typebase',
  customThemeJson?: string | null,
  layout: KeyboardLayoutSettings = DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  customFontLoaded = false,
  isLandscape = false,
  customUserFontFamily?: string | null,
) {
  let palette =
    design === 'custom'
      ? paletteForCustomTheme(scheme, customThemeJson)
      : paletteFor(scheme, design);

  // When disabled, Enter uses the same cap colors as other action keys.
  // Apple always keeps the blue action key.
  if (
    design === 'macintosh' ||
    (layout.enterKeyPreviewEnabled === false && design !== 'apple')
  ) {
    palette = {
      ...palette,
      enter: palette.modifierKey,
      enterPressed: palette.modifierKeyPressed,
      iconOnEnter: palette.icon,
    };
  }

  const numpadKeyHeight = Math.max(36, layout.keyHeight - 6);
  const suggestionBarHeight = isLandscape ? 42 : 48;
  const keysPaddingTop = isLandscape ? 4 : KEYS_PADDING_TOP;
  const imeStripClearance = isLandscape ? 28 : IME_STRIP_CLEARANCE;
  const essentialsPanelHeight = isLandscape ? 112 : 136;
  const keyboardHeightBuffer = isLandscape ? 4 : KEYBOARD_HEIGHT_BUFFER;
  const numberRowHeight =
    layout.numberRowEnabled
      ? layout.keyHeight + layout.keyRowMargin
      : 0;
  const baseKeyboardHeightDp =
    suggestionBarHeight +
    keysPaddingTop +
    KEY_ROW_COUNT * layout.keyHeight +
    KEY_ROW_COUNT * layout.keyRowMargin +
    imeStripClearance +
    keyboardHeightBuffer;
  const resizedKeyboardHeightDp = clamp(
    baseKeyboardHeightDp + numberRowHeight + (layout.keyboardHeightOffset ?? 0),
    MIN_RESIZED_KEYBOARD_HEIGHT,
    MAX_RESIZED_KEYBOARD_HEIGHT,
  );
  const availablePanelHeight = Math.max(
    120,
    resizedKeyboardHeightDp -
      suggestionBarHeight -
      keysPaddingTop -
      imeStripClearance -
      keyboardHeightBuffer,
  );
  const pluginPanelHeight = Math.round(
    Math.min(
      availablePanelHeight,
      Math.max(
        150,
        layout.keyHeight * 4 +
          layout.keyRowMargin * 3 +
          numberRowHeight +
          (layout.keyboardHeightOffset ?? 0),
      ),
    ),
  );
  const emojiPanelHeight = Math.round(
    Math.min(
      availablePanelHeight,
      Math.max(
        140,
        layout.keyHeight * 3 +
          layout.keyRowMargin * 3 +
          (layout.keyboardHeightOffset ?? 0),
      ),
    ),
  );

  return {
    ...palette,
    design,
    scheme,
    isLandscape,
    frostedGlass: usesFrostedGlassTheme(design),
    /**
     * Label color for the space key face. Quivox keeps a light space bar in both
     * schemes, so this stays dark even when `spaceLabel` is used as muted panel text.
     */
    spaceKeyLabel: design === 'quivox' ? '#111111' : palette.spaceLabel,
    /** Soft glow behind the voice dictation pill — white on Nothing + Quivox. */
    voiceSpeechGlow:
      design === 'quivox' || usesNothingKeyboardLayout(design)
        ? '#FFFFFF'
        : palette.essentialsAccent,
    /** @deprecated Use letterKey */
    key: palette.letterKey,
    /** @deprecated Use letterKeyPressed for letter keys, modifierKeyPressed for others */
    keyPressed: palette.letterKeyPressed,
    /** @deprecated Use modifierKey */
    numpadActionKey: palette.modifierKey,
    suggestionBarHeight,
    keysPaddingTop,
    imeStripClearance,
    essentialsPanelHeight,
    keyHeight: layout.keyHeight,
    keyRowMargin: layout.keyRowMargin,
    keyGap: layout.keyGap,
    keyRadius:
      design === 'macintosh'
        ? 8
        : design === 'quivox'
          // Soft circular caps — nearly half key height so letter keys read as pills.
          ? Math.max(14, Math.round(layout.keyHeight * 0.42))
          : layout.keyRadius,
    enterKeyPreviewEnabled: layout.enterKeyPreviewEnabled,
    letterSymbolAlternatesEnabled: layout.letterSymbolAlternatesEnabled,
    letterLayoutId: layout.letterLayoutId,
    numberRowEnabled: layout.numberRowEnabled,
    autoCapitalizeEnabled: layout.autoCapitalizeEnabled,
    keyboardHeightOffset: layout.keyboardHeightOffset ?? 0,
    keyHitSlop: {
      horizontal: layout.keyGap,
      vertical: Math.ceil(layout.keyRowMargin / 2) + layout.keyGap,
    },
    numpadKeyHeight,
    numpadKeysPaddingTop: NUMPAD_KEYS_PADDING_TOP,
    keyRowPaddingHorizontal: 5,
    pluginPanelHeight,
    emojiPanelHeight,
    emojiPanelGap: 12,
    keyboardHeightDp: baseKeyboardHeightDp,
    numpadKeyboardHeightDp:
      suggestionBarHeight +
      NUMPAD_KEYS_PADDING_TOP +
      4 * numpadKeyHeight +
      4 * layout.keyGap +
      imeStripClearance,
    fontFamily:
      customUserFontFamily ??
      (customFontLoaded
        ? design === 'macintosh'
          ? ('Chicago' as const)
          : ('Geist' as const)
        : undefined),
  };
}

/** Default theme for modules that load before KeyboardThemeProvider mounts. */
export const keyboardTheme = createKeyboardTheme('light');

/** Numbers/symbols layouts always render four key rows (no dedicated number row). */
export const NUMBER_SYMBOL_KEYBOARD_ROW_COUNT = 4;

export type NumberRowLayoutBoost = {
  keyHeight: number;
  keyGap: number;
  keyRowMargin: number;
};

/**
 * When the dedicated number row is on, letters gain a fifth row. Numbers/symbols
 * keep four rows — boost key size and gaps so overall keyboard height stays aligned.
 */
export function getNumberRowLayoutBoost(
  layout: KeyboardLayout,
  theme: Pick<
    KeyboardTheme,
    'numberRowEnabled' | 'keyHeight' | 'keyRowMargin' | 'keyGap'
  >,
): NumberRowLayoutBoost | null {
  if (
    !theme.numberRowEnabled ||
    (layout !== 'numbers' && layout !== 'symbols')
  ) {
    return null;
  }

  const missingRowHeight = theme.keyHeight + theme.keyRowMargin;
  const perRow = missingRowHeight / NUMBER_SYMBOL_KEYBOARD_ROW_COUNT;

  return {
    keyHeight: Math.round(theme.keyHeight + perRow * 0.68),
    keyRowMargin: Math.round(theme.keyRowMargin + perRow * 0.2),
    keyGap: Math.round(theme.keyGap + perRow * 0.12),
  };
}

export function getNonLettersKeyboardHeightDp(
  layout: KeyboardLayout,
  theme: KeyboardTheme,
  lettersBaseHeightDp: number,
): number {
  if (layout === 'numpad') {
    return theme.numpadKeyboardHeightDp;
  }
  if (
    theme.numberRowEnabled &&
    (layout === 'numbers' || layout === 'symbols')
  ) {
    return Math.round(lettersBaseHeightDp);
  }
  return theme.keyboardHeightDp;
}
