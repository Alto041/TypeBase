import React, {type FC} from 'react';
import {Platform, ScrollView, StyleSheet} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {keyboardTheme, keyboardTypefaceStyle, type KeyboardTheme} from '../theme';

export function pluginPanelIconColor(theme: KeyboardTheme): string {
  return theme.icon;
}

type PluginPanelIconProps = {
  Icon: FC<{width?: number; height?: number; color?: string}>;
  size?: number;
  color?: string;
};

export function PluginPanelIcon({
  Icon,
  size = 22,
  color,
}: PluginPanelIconProps) {
  const theme = useKeyboardTheme();
  return React.createElement(Icon, {
    width: size,
    height: size,
    color: color ?? pluginPanelIconColor(theme),
  });
}

/** Height of the 4 QWERTY rows — plugin panels must not extend below this. */
export const PLUGIN_PANEL_HEIGHT =
  keyboardTheme.keyHeight * 4 + keyboardTheme.keyRowMargin * 3;

/** Bottom fade overlay height on the plugins menu. */
export const PLUGIN_MENU_FADE_HEIGHT = Math.round(PLUGIN_PANEL_HEIGHT * 0.52);

/** Modest scroll padding so the last row clears the fade (not full fade height). */
export const PLUGIN_MENU_FADE_SCROLL_INSET = Math.round(
  keyboardTheme.keyHeight * 0.85,
);

export const PLUGIN_OUTER_RADIUS = 12;
export const PLUGIN_INNER_RADIUS = 2;

export function getPluginPanelHeight(theme: KeyboardTheme): number {
  return theme.pluginPanelHeight ?? PLUGIN_PANEL_HEIGHT;
}

export function getPluginMenuFadeHeight(theme: KeyboardTheme): number {
  return Math.round(getPluginPanelHeight(theme) * 0.52);
}

export function getPluginMenuFadeScrollInset(theme: KeyboardTheme): number {
  return Math.round(
    Math.min(theme.keyHeight * 0.85, getPluginPanelHeight(theme) * 0.28),
  );
}

export function createPluginPanelStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      height: getPluginPanelHeight(theme),
      alignSelf: 'stretch',
      minHeight: 0,
      overflow: 'hidden',
    },
    list: {
      flex: 1,
      minHeight: 0,
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
      ...keyboardTypefaceStyle(theme, '600'),
    },
    emptyHint: {
      color: theme.spaceLabel,
      fontSize: 13,
      ...keyboardTypefaceStyle(theme),
      lineHeight: 18,
    },
  });
}

type PluginScrollViewProps = {
  children: React.ReactNode;
  /** Add bottom inset so the last item can scroll clear of the plugins-menu fade. */
  fadeScrollInset?: boolean;
};

export function PluginScrollView({
  children,
  fadeScrollInset = false,
}: PluginScrollViewProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createPluginPanelStyles);

  return React.createElement(
    ScrollView,
    {
      style: styles.list,
      contentContainerStyle: [
        styles.listContent,
        fadeScrollInset && {
          paddingBottom: getPluginMenuFadeScrollInset(theme),
        },
      ],
      keyboardShouldPersistTaps: 'handled' as const,
      nestedScrollEnabled: true,
      showsVerticalScrollIndicator: false,
      scrollEventThrottle: 16,
      overScrollMode: Platform.OS === 'android' ? 'always' : undefined,
      bounces: true,
    },
    children,
  );
}

export function usePluginPanelStyles() {
  return useThemedStyles(createPluginPanelStyles);
}
