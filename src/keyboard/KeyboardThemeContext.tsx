import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  createKeyboardTheme,
  DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  type KeyboardColorScheme,
  type KeyboardDesign,
  type KeyboardLayoutSettings,
  type KeyboardTheme,
} from './theme';

const KeyboardThemeContext = createContext<KeyboardTheme | null>(null);

type KeyboardThemeProviderProps = {
  scheme: KeyboardColorScheme;
  design: KeyboardDesign;
  customThemeJson?: string | null;
  layoutSettings?: KeyboardLayoutSettings;
  customFontLoaded?: boolean;
  isLandscape?: boolean;
  customUserFontFamily?: string | null;
  children: ReactNode;
};

export function KeyboardThemeProvider({
  scheme,
  design,
  customThemeJson,
  layoutSettings = DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  customFontLoaded = false,
  isLandscape = false,
  customUserFontFamily,
  children,
}: KeyboardThemeProviderProps) {
  const theme = useMemo(
    () =>
      createKeyboardTheme(
        scheme,
        design,
        customThemeJson,
        layoutSettings,
        customFontLoaded,
        isLandscape,
        customUserFontFamily,
      ),
    [
      customFontLoaded,
      customThemeJson,
      design,
      isLandscape,
      layoutSettings,
      scheme,
      customUserFontFamily,
    ],
  );

  return (
    <KeyboardThemeContext.Provider value={theme}>
      {children}
    </KeyboardThemeContext.Provider>
  );
}

export function useKeyboardTheme(): KeyboardTheme {
  const theme = useContext(KeyboardThemeContext);
  if (!theme) {
    throw new Error('useKeyboardTheme must be used within KeyboardThemeProvider');
  }
  return theme;
}

export function useThemedStyles<T extends Record<string, unknown>>(
  factory: (theme: KeyboardTheme) => T,
): T {
  const theme = useKeyboardTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
