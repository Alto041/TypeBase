import {StyleSheet} from 'react-native';
import {keyboardTheme} from '../theme';

/** Height of the 4 QWERTY rows — plugin panels must not extend below this. */
export const PLUGIN_PANEL_HEIGHT =
  keyboardTheme.keyHeight * 4 + keyboardTheme.keyRowMargin * 3;

export const PLUGIN_CARD_COLOR = '#353535';
export const PLUGIN_OUTER_RADIUS = 12;
export const PLUGIN_INNER_RADIUS = 2;

export const pluginPanelStyles = StyleSheet.create({
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
    color: keyboardTheme.label,
    fontSize: 15,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  emptyHint: {
    color: keyboardTheme.spaceLabel,
    fontSize: 13,
    fontFamily: keyboardTheme.fontFamily,
    lineHeight: 18,
  },
});
