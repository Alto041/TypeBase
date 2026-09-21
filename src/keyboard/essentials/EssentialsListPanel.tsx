import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {EssentialsSwipeRow} from './EssentialsSwipeRow';
import type {Essential} from './types';

type EssentialsListPanelProps = {
  essentials: Essential[];
  isPremium?: boolean;
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
  isPremium = false,
  onSelect,
  onDelete,
}: EssentialsListPanelProps) {
  const panelStyles = usePluginPanelStyles();

  return (
    <View style={styles.container}>
      <PluginScrollView fadeScrollInset>
        {essentials.length === 0 ? (
          <View style={panelStyles.emptyState}>
            <Text style={panelStyles.emptyTitle}>No essentials</Text>
            <Text style={panelStyles.emptyHint}>
              Launchpad → Essentials. Type ;keyword + space. Built-ins: ;date ;time
              ;clipboard ;cursor.
            </Text>
          </View>
        ) : (
          essentials.map((essential, index) => (
            <EssentialsSwipeRow
              key={essential.id}
              essential={essential}
              isPremium={isPremium}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
