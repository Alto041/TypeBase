import React from 'react';
import {Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  pluginPanelStyles,
} from '../components/pluginPanelLayout';
import {EssentialsSwipeRow} from './EssentialsSwipeRow';
import type {Essential} from './types';

type EssentialsListPanelProps = {
  essentials: Essential[];
  onSelect: (essential: Essential) => void;
  onDelete: (essential: Essential) => void;
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

export function EssentialsListPanel({
  essentials,
  onSelect,
  onDelete,
}: EssentialsListPanelProps) {
  return (
    <View style={pluginPanelStyles.container}>
      <PluginScrollView>
        {essentials.length === 0 ? (
          <View style={pluginPanelStyles.emptyState}>
            <Text style={pluginPanelStyles.emptyTitle}>No essentials yet</Text>
            <Text style={pluginPanelStyles.emptyHint}>
              Tap + to save a shortcut, then type @@keyword to insert it.
            </Text>
          </View>
        ) : (
          essentials.map((essential, index) => (
            <EssentialsSwipeRow
              key={essential.id}
              essential={essential}
              tileStyle={getTileStyle(index, essentials.length)}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))
        )}
      </PluginScrollView>
    </View>
  );
}
