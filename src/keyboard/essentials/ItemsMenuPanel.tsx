import React, {type FC} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import ArrowIcon from '../../../assets/plugins/arrow.svg';
import ClipboardIcon from '../../../assets/plugins/clipboard.svg';
import EssentialsIcon from '../../../assets/plugins/essentials.svg';
import CalculatorIcon from '../../../assets/plugins/calculator.svg';
import AutocorrectIcon from '../../../assets/plugins/autocorrect.svg';
import GesturesIcon from '../../../assets/gesture.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PLUGIN_PANEL_HEIGHT,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';

type ItemsMenuPanelProps = {
  onSelectEssentials: () => void;
  onSelectClipboard: () => void;
  onSelectGestures: () => void;
  onSelectAutocorrect: () => void;
  onSelectCalculator: () => void;
};

type PluginTileProps = {
  title: string;
  Icon: FC<{width?: number; height?: number; color?: string}>;
  tileStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
};

function PluginTile({title, Icon, tileStyle, onPress}: PluginTileProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createItemsMenuStyles);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      delayPressIn={80}
      onPress={() => {
        triggerKeyHaptic();
        onPress();
      }}
      style={[styles.tile, tileStyle]}>
      <Icon width={22} height={22} color={theme.icon} />
      <Text style={styles.tileTitle}>{title}</Text>
      <View style={styles.tileSpacer} />
      <ArrowIcon width={9} height={16} color={theme.iconMuted} />
    </TouchableOpacity>
  );
}

function getTileStyle(index: number, total: number): ViewStyle {
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

const PLUGINS = [
  {id: 'essentials', title: 'Essentials', Icon: EssentialsIcon},
  {id: 'clipboard', title: 'Clipboard', Icon: ClipboardIcon},
  {id: 'autocorrect', title: 'Autocorrect', Icon: AutocorrectIcon},
  {id: 'gestures', title: 'Gestures', Icon: GesturesIcon},
  {id: 'calculator', title: 'Calculator', Icon: CalculatorIcon},
] as const;

const PLUGIN_FADE_HEIGHT = Math.round(PLUGIN_PANEL_HEIGHT * 0.52);

export function ItemsMenuPanel({
  onSelectEssentials,
  onSelectClipboard,
  onSelectGestures,
  onSelectAutocorrect,
  onSelectCalculator,
}: ItemsMenuPanelProps) {
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createItemsMenuStyles);
  const handlers = {
    essentials: onSelectEssentials,
    clipboard: onSelectClipboard,
    autocorrect: onSelectAutocorrect,
    gestures: onSelectGestures,
    calculator: onSelectCalculator,
  };

  return (
    <View style={[panelStyles.container, styles.container]}>
      <PluginScrollView>
        {PLUGINS.map((plugin, index) => (
          <PluginTile
            key={plugin.id}
            title={plugin.title}
            Icon={plugin.Icon}
            tileStyle={getTileStyle(index, PLUGINS.length)}
            onPress={handlers[plugin.id]}
          />
        ))}
      </PluginScrollView>
      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="pluginSmoke" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={theme.container} stopOpacity="1" />
              <Stop
                offset="0.5"
                stopColor={theme.container}
                stopOpacity="0.4"
              />
              <Stop offset="1" stopColor={theme.container} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#pluginSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createItemsMenuStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      justifyContent: 'flex-start',
    },
    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      minHeight: 44,
    },
    tilePressed: {
      backgroundColor: theme.letterKeyPressed,
    },
    tileTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    tileSpacer: {
      flex: 1,
    },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: PLUGIN_FADE_HEIGHT,
    },
  });
}
