import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import ArrowIcon from '../../../assets/plugins/arrow.svg';
import {
  PLUGIN_INNER_RADIUS,
  PLUGIN_OUTER_RADIUS,
  PluginScrollView,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {GESTURE_FEATURES, type GestureSettings, type LaunchableApp} from './types';

type GesturesPanelProps = {
  settings: GestureSettings;
  launcherAppPackage: string;
  launchableApps: LaunchableApp[];
  appsLoading: boolean;
  onToggle: (key: keyof GestureSettings, enabled: boolean) => void;
  onSelectLauncherApp: (packageName: string) => void;
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

export function GesturesPanel({
  settings,
  launcherAppPackage,
  launchableApps,
  appsLoading,
  onToggle,
  onSelectLauncherApp,
}: GesturesPanelProps) {
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createGesturesStyles);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const listDraggingRef = useRef(false);

  const selectedAppLabel = useMemo(() => {
    const match = launchableApps.find(app => app.packageName === launcherAppPackage);
    return match?.label ?? launcherAppPackage;
  }, [launchableApps, launcherAppPackage]);

  const markListScroll = () => {
    listDraggingRef.current = true;
  };

  const clearListScroll = () => {
    setTimeout(() => {
      listDraggingRef.current = false;
    }, 120);
  };

  const handleSelectApp = (packageName: string) => {
    if (listDraggingRef.current) {
      return;
    }
    triggerKeyHaptic();
    onSelectLauncherApp(packageName);
    setShowAppPicker(false);
  };

  if (showAppPicker) {
    return (
      <View style={panelStyles.container}>
        <Pressable
          onPress={() => {
            triggerKeyHaptic();
            setShowAppPicker(false);
          }}
          style={styles.pickerBackRow}>
          <Text style={styles.pickerBackLabel}>← Gestures</Text>
        </Pressable>
        <ScrollView
          style={panelStyles.list}
          contentContainerStyle={panelStyles.listContent}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={markListScroll}
          onScrollEndDrag={clearListScroll}
          onMomentumScrollEnd={clearListScroll}>
          {appsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.label} size="small" />
            </View>
          ) : launchableApps.length === 0 ? (
            <Text style={styles.emptyAppsText}>No launchable apps found.</Text>
          ) : (
            launchableApps.map((app, index) => {
              const selected = app.packageName === launcherAppPackage;
              return (
                <Pressable
                  key={app.packageName}
                  onPress={() => handleSelectApp(app.packageName)}
                  delayPressIn={80}
                  style={[
                    styles.row,
                    getTileStyle(index, launchableApps.length),
                    selected && styles.appRowSelected,
                  ]}>
                  <Text
                    style={[styles.rowTitle, selected && styles.appRowLabelSelected]}
                    numberOfLines={1}>
                    {app.label}
                  </Text>
                  {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={panelStyles.container}>
      <PluginScrollView>
        {GESTURE_FEATURES.map((feature, index) => (
          <View
            key={feature.key}
            style={[styles.row, getTileStyle(index, GESTURE_FEATURES.length)]}>
            <Text style={styles.rowTitle}>{feature.title}</Text>
            <FeatureToggle
              enabled={settings[feature.key]}
              onToggle={() => onToggle(feature.key, !settings[feature.key])}
            />
          </View>
        ))}

        {settings.commaLauncher ? (
          <Pressable
            onPress={() => {
              triggerKeyHaptic();
              setShowAppPicker(true);
            }}
            style={[styles.row, styles.launcherRow]}>
            <Text style={styles.launcherTitle}>Launch app</Text>
            <Text style={styles.launcherValue} numberOfLines={1}>
              {appsLoading ? '…' : selectedAppLabel}
            </Text>
            <ArrowIcon width={9} height={16} color={theme.iconMuted} />
          </Pressable>
        ) : null}
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
    rowTitle: {
      flex: 1,
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    launcherRow: {
      borderRadius: PLUGIN_OUTER_RADIUS,
      marginTop: 2,
    },
    launcherTitle: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    launcherValue: {
      flex: 1,
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      textAlign: 'right',
    },
    pickerBackRow: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 4,
    },
    pickerBackLabel: {
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    appRowSelected: {
      backgroundColor: theme.pluginCardSecondary,
    },
    appRowLabelSelected: {
      fontWeight: '600',
    },
    selectedMark: {
      color: TOGGLE_ON_COLOR,
      fontSize: 16,
      fontWeight: '700',
    },
    loadingRow: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    emptyAppsText: {
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      paddingHorizontal: 4,
      paddingVertical: 8,
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
