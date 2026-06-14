import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  createKeyboardTheme,
  type KeyboardColorScheme,
  type KeyboardDesign,
  type KeyboardTheme,
} from './theme';

const KeyboardThemeContext = createContext<KeyboardTheme | null>(null);

type KeyboardThemeProviderProps = {
  scheme: KeyboardColorScheme;
  design: KeyboardDesign;
  customThemeJson?: string | null;
  children: ReactNode;
};

export function KeyboardThemeProvider({
  scheme,
  design,
  customThemeJson,
  children,
}: KeyboardThemeProviderProps) {
  const theme = useMemo(
    () => createKeyboardTheme(scheme, design, customThemeJson),
    [customThemeJson, design, scheme],
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
