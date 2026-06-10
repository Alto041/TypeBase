import React from 'react';
import {ScrollView, Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  pluginPanelStyles,
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
  return (
    <View style={pluginPanelStyles.container}>
      <ScrollView
        style={pluginPanelStyles.list}
        contentContainerStyle={pluginPanelStyles.listContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={pluginPanelStyles.emptyState}>
            <Text style={pluginPanelStyles.emptyTitle}>No clipboard history</Text>
            <Text style={pluginPanelStyles.emptyHint}>
              Copy text in any app and it will appear here.
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
      </ScrollView>
    </View>
  );
}
