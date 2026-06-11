import React from 'react';
import {Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {ClipboardSwipeRow} from './ClipboardSwipeRow';
import type {ClipboardItem} from './types';

type ClipboardProPanelProps = {
  items: ClipboardItem[];
  onSelect: (item: ClipboardItem) => void;
  onDelete: (item: ClipboardItem) => void;
  onTogglePin: (item: ClipboardItem) => void;
};

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

export function ClipboardProPanel({
  items,
  onSelect,
  onDelete,
  onTogglePin,
}: ClipboardProPanelProps) {
  const panelStyles = usePluginPanelStyles();

  return (
    <View style={panelStyles.container}>
      <PluginScrollView>
        {items.length === 0 ? (
          <View style={panelStyles.emptyState}>
            <Text style={panelStyles.emptyTitle}>No clipboard history</Text>
            <Text style={panelStyles.emptyHint}>
              Copy text or images in any app and they will appear here.
            </Text>
          </View>
        ) : (
          items.map((item, index) => (
            <ClipboardSwipeRow
              key={item.id}
              item={item}
              tileStyle={getTileStyle(index, items.length)}
              onSelect={onSelect}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
            />
          ))
        )}
      </PluginScrollView>
    </View>
  );
}
