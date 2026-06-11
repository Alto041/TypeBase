import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {keyboardTheme, type KeyboardTheme} from '../theme';

/** Height of the 4 QWERTY rows — plugin panels must not extend below this. */
export const PLUGIN_PANEL_HEIGHT =
  keyboardTheme.keyHeight * 4 + keyboardTheme.keyRowMargin * 3;

export const PLUGIN_OUTER_RADIUS = 12;
export const PLUGIN_INNER_RADIUS = 2;

export function createPluginPanelStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      height: PLUGIN_PANEL_HEIGHT,
      alignSelf: 'stretch',
      overflow: 'hidden',
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 4,
      gap: 2,
    },
    emptyState: {
      paddingTop: 8,
      paddingHorizontal: 4,
      gap: 4,
    },
    emptyTitle: {
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    emptyHint: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      lineHeight: 18,
    },
  });
}

type PluginScrollViewProps = {
  children: React.ReactNode;
};

export function PluginScrollView({children}: PluginScrollViewProps) {
  const styles = useThemedStyles(createPluginPanelStyles);

  return React.createElement(
    ScrollView,
    {
      style: styles.list,
      contentContainerStyle: styles.listContent,
      keyboardShouldPersistTaps: 'always' as const,
      nestedScrollEnabled: true,
      showsVerticalScrollIndicator: false,
    },
    children,
  );
}

export function usePluginPanelStyles() {
  return useThemedStyles(createPluginPanelStyles);
}
