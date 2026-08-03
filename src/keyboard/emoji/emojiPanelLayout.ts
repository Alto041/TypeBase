import {StyleSheet, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
} from '../components/pluginPanelLayout';
import {keyboardTypefaceStyle, type KeyboardTheme} from '../theme';

export const EMOJI_PANEL_H_INSET = 8;
export const EMOJI_PANEL_RADIUS = PLUGIN_OUTER_RADIUS;
export const EMOJI_CELL_GAP = 2;
export const EMOJI_CELL_RADIUS = 8;
export const EMOJI_GRID_FONT_SIZE = 24;
export const RECENTS_STRIP_V_PADDING = 4;
export const RECENTS_CONTAINER_GAP = 6;
export const GIF_CELL_GAP = 8;
export const SFX_TILE_GAP = 2;

export function getStackedTileRadius(index: number, total: number): ViewStyle {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (total === 1) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  if (isFirst) {
    return {
      borderTopLeftRadius: PLUGIN_OUTER_RADIUS,
      borderTopRightRadius: PLUGIN_OUTER_RADIUS,
      borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
      borderBottomRightRadius: PLUGIN_INNER_RADIUS,
    };
  }

  if (isLast) {
    return {
      borderTopLeftRadius: PLUGIN_INNER_RADIUS,
      borderTopRightRadius: PLUGIN_INNER_RADIUS,
      borderBottomLeftRadius: PLUGIN_OUTER_RADIUS,
      borderBottomRightRadius: PLUGIN_OUTER_RADIUS,
    };
  }

  return {
    borderTopLeftRadius: PLUGIN_INNER_RADIUS,
    borderTopRightRadius: PLUGIN_INNER_RADIUS,
    borderBottomLeftRadius: PLUGIN_INNER_RADIUS,
    borderBottomRightRadius: PLUGIN_INNER_RADIUS,
  };
}

export function createEmojiPanelShellStyles(
  theme: KeyboardTheme,
  panelHeight: number,
) {
  return StyleSheet.create({
    outer: {
      height: panelHeight,
      marginBottom: theme.emojiPanelGap,
      paddingHorizontal: EMOJI_PANEL_H_INSET,
    },
    card: {
      flex: 1,
      backgroundColor: theme.pluginCard,
      borderRadius: EMOJI_PANEL_RADIUS,
      overflow: 'hidden',
    },
  });
}

export function createEmojiPanelSharedStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 6,
      paddingTop: 4,
      paddingBottom: 6,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      gap: 4,
    },
    emptyTitle: {
      color: theme.label,
      fontSize: 15,
      ...keyboardTypefaceStyle(theme, '600'),
      textAlign: 'center',
    },
    emptyHint: {
      color: theme.spaceLabel,
      fontSize: 13,
      ...keyboardTypefaceStyle(theme),
      textAlign: 'center',
      lineHeight: 18,
    },
    centeredLoader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    errorText: {
      color: theme.iconMuted,
      fontSize: 13,
      ...keyboardTypefaceStyle(theme),
      textAlign: 'center',
    },
    attribution: {
      textAlign: 'center',
      color: theme.iconMuted,
      fontSize: 10,
      ...keyboardTypefaceStyle(theme),
      paddingVertical: 8,
      opacity: 0.75,
    },
    sectionHeader: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 6,
    },
    sectionHeaderText: {
      color: theme.spaceLabel,
      fontSize: 11,
      ...keyboardTypefaceStyle(theme, '600'),
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    recentsStrip: {
      backgroundColor: theme.pluginCardSecondary,
      paddingHorizontal: 6,
      paddingVertical: RECENTS_STRIP_V_PADDING,
      borderRadius: 10,
      overflow: 'hidden',
    },
    recentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: EMOJI_CELL_GAP,
    },
    emojiCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: EMOJI_CELL_RADIUS,
    },
    emojiCellPressed: {
      backgroundColor: theme.modifierKeyPressed,
    },
    emojiText: {
      fontSize: EMOJI_GRID_FONT_SIZE,
    },
  });
}
