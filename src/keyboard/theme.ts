import {Platform} from 'react-native';
import {
  DEFAULT_LETTER_LAYOUT_ID,
  type LetterLayoutId,
} from './layouts/letterLayouts';

const KEY_ROW_COUNT = 4;
const KEYS_PADDING_TOP = 6;
const IME_STRIP_CLEARANCE = 46;
/** Extra headroom so the suggestion bar and bottom row are never clipped. */
const KEYBOARD_HEIGHT_BUFFER = 6;

const KEY_HEIGHT = 52;
const KEY_ROW_MARGIN = 10;
const KEY_GAP = 4;
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
};

export const DEFAULT_KEYBOARD_LAYOUT_SETTINGS: KeyboardLayoutSettings = {
  keyHeight: KEY_HEIGHT,
  keyGap: KEY_GAP,
  keyRowMargin: KEY_ROW_MARGIN,
  keyRadius: KEY_RADIUS,
  enterKeyPreviewEnabled: true,
  developerEyeEnabled: false,
  letterLayoutId: DEFAULT_LETTER_LAYOUT_ID,
  letterSymbolAlternatesEnabled: false,
};

/** Touch slop into gaps — full visual gap so taps between keys snap to the nearest key. */
export const KEY_HIT_SLOP = {
  horizontal: DEFAULT_KEYBOARD_LAYOUT_SETTINGS.keyGap,
  vertical: DEFAULT_KEYBOARD_LAYOUT_SETTINGS.keyRowMargin,
};
const NUMPAD_KEYS_PADDING_TOP = 2;

export type KeyboardColorScheme = 'light' | 'dark';
export type KeyboardDesign = 'typebase' | 'quivox' | 'custom';

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

/**
 * Quivox — "aesthetic minimal" palette.
 * Muted key caps (not white) with restrained accents for space/enter.
 */
const QUIVOX_KEYS = {
  // AMOLED-ish defaults with saturated "thick" color pops.
  // (No blue accents; only tinted caps, never white key backgrounds.)
  letterKey: '#1A1A22',
  letterKeyPressed: '#252533',

  modifierKey: '#00C2A8',
  modifierKeyPressed: '#009A86',

  spaceKey: '#FFB020',
  spaceKeyPressed: '#E79A0E',

  enter: '#FF2D55',
  enterPressed: '#C81F41',

  label: '#E9EEF6',
  spaceLabel: '#111827',
  icon: '#E9EEF6',
  iconMuted: '#A9B4C2',
  iconOnEnter: '#FFFFFF',

  swipeTrail: '#FFB020',
  essentialsAccent: '#FFB020',
  launcherKey: '#00C2A8',
  keyRipple: 'rgba(255, 255, 255, 0.18)',
} as const;

const QUIVOX_LIGHT_PALETTE: KeyboardPalette = {
  ...LIGHT_PALETTE,
  ...QUIVOX_KEYS,
  // Keep everything dark like AMOLED, even in "light" scheme.
  container: '#000000',
  pluginCard: '#07070D',
  pluginCardSecondary: '#0D0D16',
  borderSubtle: '#1A1A26',
  suggestionDivider: '#2A2A3A',

  chipSelectedBackground: '#00C2A8',
  chipSelectedText: '#FFFFFF',
};

const QUIVOX_DARK_PALETTE: KeyboardPalette = {
  ...DARK_PALETTE,
  ...QUIVOX_KEYS,
  // Keep key caps the same across both schemes (AMOLED consistency).
  chipSelectedBackground: '#00C2A8',
  chipSelectedText: '#FFFFFF',
};

function paletteFor(
  scheme: KeyboardColorScheme,
  design: KeyboardDesign,
): KeyboardPalette {
  if (design === 'quivox') {
    return scheme === 'light' ? QUIVOX_LIGHT_PALETTE : QUIVOX_DARK_PALETTE;
  }
  return scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

export type KeyboardTheme = ReturnType<typeof createKeyboardTheme>;

/** Safe Text font — Android Fabric crashes if a custom font isn't registered yet. */
export function keyboardTextFont(
  theme: KeyboardTheme,
): {fontFamily?: string} {
  return theme.fontFamily ? {fontFamily: theme.fontFamily} : {};
}

export function createKeyboardTheme(
  scheme: KeyboardColorScheme,
  design: KeyboardDesign = 'typebase',
  customThemeJson?: string | null,
  layout: KeyboardLayoutSettings = DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  customFontLoaded = false,
) {
  let palette =
    design === 'custom'
      ? paletteForCustomTheme(scheme, customThemeJson)
      : paletteFor(scheme, design);

  // When disabled, Enter uses the same cap colors as other action keys.
  if (layout.enterKeyPreviewEnabled === false) {
    palette = {
      ...palette,
      enter: palette.modifierKey,
      enterPressed: palette.modifierKeyPressed,
      iconOnEnter: palette.icon,
    };
  }

  const numpadKeyHeight = Math.max(36, layout.keyHeight - 6);

  return {
    ...palette,
    design,
    scheme,
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
    keyHeight: layout.keyHeight,
    keyRowMargin: layout.keyRowMargin,
    keyGap: layout.keyGap,
    keyRadius: layout.keyRadius,
    enterKeyPreviewEnabled: layout.enterKeyPreviewEnabled,
    letterSymbolAlternatesEnabled: layout.letterSymbolAlternatesEnabled,
    letterLayoutId: layout.letterLayoutId,
    keyHitSlop: {
      horizontal: layout.keyGap,
      vertical: layout.keyRowMargin,
    },
    numpadKeyHeight,
    numpadKeysPaddingTop: NUMPAD_KEYS_PADDING_TOP,
    keyRowPaddingHorizontal: 5,
    emojiPanelHeight: layout.keyHeight * 3 + layout.keyRowMargin * 3,
    emojiPanelGap: 12,
    keyboardHeightDp:
      48 +
      KEYS_PADDING_TOP +
      KEY_ROW_COUNT * layout.keyHeight +
      KEY_ROW_COUNT * layout.keyRowMargin +
      IME_STRIP_CLEARANCE +
      KEYBOARD_HEIGHT_BUFFER,
    numpadKeyboardHeightDp:
      48 +
      NUMPAD_KEYS_PADDING_TOP +
      4 * numpadKeyHeight +
      4 * layout.keyGap +
      IME_STRIP_CLEARANCE,
    fontFamily:
      customFontLoaded && Platform.OS === 'ios'
        ? ('Geist' as const)
        : undefined,
  };
}

/** Default theme for modules that load before KeyboardThemeProvider mounts. */
export const keyboardTheme = createKeyboardTheme('light');
