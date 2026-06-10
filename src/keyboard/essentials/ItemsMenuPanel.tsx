import React, {type FC} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ArrowIcon from '../../../assets/plugins/arrow.svg';
import ClipboardIcon from '../../../assets/plugins/clipboard.svg';
import EssentialsIcon from '../../../assets/plugins/essentials.svg';
import CalculatorIcon from '../../../assets/plugins/calculator.svg';
import GesturesIcon from '../../../assets/gesture.svg';
import {
  PLUGIN_CARD_COLOR,
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  pluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {keyboardTheme} from '../theme';

type ItemsMenuPanelProps = {
  onSelectEssentials: () => void;
  onSelectClipboard: () => void;
  onSelectGestures: () => void;
  onSelectCalculator: () => void;
};

type PluginTileProps = {
  title: string;
  Icon: FC<{width?: number; height?: number}>;
  tileStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
};

function PluginTile({title, Icon, tileStyle, onPress}: PluginTileProps) {
  return (
    <Pressable
      onPressIn={() => {
        triggerKeyHaptic();
        onPress();
      }}
      style={({pressed}) => [
        styles.tile,
        tileStyle,
        pressed && styles.tilePressed,
      ]}>
      <Icon width={22} height={22} />
      <Text style={styles.tileTitle}>{title}</Text>
      <View style={styles.tileSpacer} />
      <ArrowIcon width={9} height={16} />
    </Pressable>
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
  {id: 'gestures', title: 'Gestures', Icon: GesturesIcon},
  {id: 'calculator', title: 'Calculator', Icon: CalculatorIcon},
] as const;

export function ItemsMenuPanel({
  onSelectEssentials,
  onSelectClipboard,
  onSelectGestures,
  onSelectCalculator,
}: ItemsMenuPanelProps) {
  const handlers = {
    essentials: onSelectEssentials,
    clipboard: onSelectClipboard,
    gestures: onSelectGestures,
    calculator: onSelectCalculator,
  };

  return (
    <View style={[pluginPanelStyles.container, styles.container]}>
      <View style={[pluginPanelStyles.listContent, styles.list]}>
        {PLUGINS.map((plugin, index) => (
          <PluginTile
            key={plugin.id}
            title={plugin.title}
            Icon={plugin.Icon}
            tileStyle={getTileStyle(index, PLUGINS.length)}
            onPress={handlers[plugin.id]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'flex-start',
  },
  list: {
    flex: 0,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PLUGIN_CARD_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    minHeight: 44,
  },
  tilePressed: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  tileTitle: {
    color: keyboardTheme.label,
    fontSize: 16,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  tileSpacer: {
    flex: 1,
  },
});
