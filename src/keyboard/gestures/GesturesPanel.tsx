import React from 'react';
import {Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {GESTURE_FEATURES, type GestureSettings} from './types';

type GesturesPanelProps = {
  settings: GestureSettings;
  onToggle: (key: keyof GestureSettings, enabled: boolean) => void;
};

type FeatureToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

function FeatureToggle({enabled, onToggle}: FeatureToggleProps) {
  const styles = useThemedStyles(createGesturesStyles);

  return (
    <Pressable
      onPress={() => {
        triggerKeyHaptic();
        onToggle();
      }}
      style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
      <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
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

export function GesturesPanel({settings, onToggle}: GesturesPanelProps) {
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createGesturesStyles);

  return (
    <View style={panelStyles.container}>
      <PluginScrollView>
        {GESTURE_FEATURES.map((feature, index) => (
          <View
            key={feature.key}
            style={[styles.row, getTileStyle(index, GESTURE_FEATURES.length)]}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>{feature.title}</Text>
              {feature.key === 'commaLauncher' && settings.commaLauncher ? (
                <Text style={styles.rowHint}>
                  Hold . → clipboard · Hold , → AI rewrite
                </Text>
              ) : null}
            </View>
            <FeatureToggle
              enabled={settings[feature.key]}
              onToggle={() => onToggle(feature.key, !settings[feature.key])}
            />
          </View>
        ))}
      </PluginScrollView>
    </View>
  );
}

const TOGGLE_ON_COLOR = '#2CC642';

function createGesturesStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      minHeight: 44,
    },
    rowTextCol: {
      flex: 1,
      gap: 3,
    },
    rowTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    rowHint: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      lineHeight: 16,
    },
    toggleTrack: {
      width: 44,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.modifierKeyPressed,
      padding: 2,
      justifyContent: 'center',
    },
    toggleTrackOn: {
      backgroundColor: TOGGLE_ON_COLOR,
    },
    toggleThumb: {
      width: 22,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.label,
      transform: [{translateX: 0}],
    },
    toggleThumbOn: {
      transform: [{translateX: 18}],
    },
  });
}
