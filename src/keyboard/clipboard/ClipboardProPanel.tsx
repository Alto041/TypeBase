import React, {useCallback} from 'react';
import {FlatList, Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
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

  const renderItem = useCallback(
    ({item, index}: {item: ClipboardItem; index: number}) => {
      const tileStyle = getTileStyle(index, items.length);
      return (
        <ClipboardSwipeRow
          item={item}
          tileStyle={tileStyle}
          onSelect={onSelect}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      );
    },
    [items.length, onSelect, onDelete, onTogglePin],
  );

  const keyExtractor = useCallback((item: ClipboardItem) => item.id, []);

  return (
    <View style={panelStyles.container}>
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={panelStyles.list}
        contentContainerStyle={panelStyles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        initialNumToRender={6}
        windowSize={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={30}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={panelStyles.emptyState}>
            <Text style={panelStyles.emptyTitle}>No clipboard history</Text>
            <Text style={panelStyles.emptyHint}>
              Copy text or images in any app and they will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}
