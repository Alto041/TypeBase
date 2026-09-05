import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import PremiumIcon from '../../../assets/premium.svg';
import {openPremiumUpgradeScreen} from '../../licensing/premium';
import {
  PLUGIN_OUTER_RADIUS,
  PluginPanelIcon,
} from './pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {keyboardTypefaceStyle, type KeyboardTheme} from '../theme';

type PremiumUpsellSheetProps = {
  title?: string;
  body?: string;
  placement?: 'panel' | 'keyboard';
  onDismiss: () => void;
};

export function PremiumUpsellSheet({
  title = 'Premium feature',
  body = 'Unlock TypeBase in the app to use this.',
  placement = 'keyboard',
  onDismiss,
}: PremiumUpsellSheetProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);
  const isPanel = placement === 'panel';

  return (
    <View style={[styles.wrap, isPanel && styles.wrapPanel]} pointerEvents="box-none">
      <Pressable style={[styles.backdrop, isPanel && styles.backdropPanel]} onPress={onDismiss} />
      <View style={[styles.bar, {backgroundColor: theme.pluginCard}]}>
        <PluginPanelIcon Icon={PremiumIcon} size={20} />
        <View style={styles.copy}>
          <Text style={[styles.title, {color: theme.label}]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.body, {color: theme.spaceLabel}]} numberOfLines={2}>
            {body}
          </Text>
        </View>
        <Pressable
          style={[styles.unlockBtn, {backgroundColor: theme.label}]}
          onPress={() => {
            void openPremiumUpgradeScreen();
            onDismiss();
          }}>
          <Text style={[styles.unlockBtnText, {color: theme.container}]}>
            Unlock
          </Text>
        </Pressable>
        <Pressable style={styles.dismissBtn} onPress={onDismiss} hitSlop={8}>
          <Text style={[styles.dismissText, {color: theme.iconMuted}]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    wrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      paddingHorizontal: 12,
      zIndex: 200,
    },
    wrapPanel: {
      zIndex: 50,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.container,
      opacity: 0.82,
    },
    backdropPanel: {
      opacity: 0.55,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: PLUGIN_OUTER_RADIUS,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      minHeight: 52,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontSize: 15,
      ...keyboardTypefaceStyle(theme, '600'),
    },
    body: {
      fontSize: 12,
      ...keyboardTypefaceStyle(theme),
      lineHeight: 16,
    },
    unlockBtn: {
      borderRadius: 8,
      paddingHorizontal: 12,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unlockBtnText: {
      fontSize: 13,
      ...keyboardTypefaceStyle(theme, '600'),
    },
    dismissBtn: {
      paddingHorizontal: 2,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissText: {
      fontSize: 12,
      ...keyboardTypefaceStyle(theme, '500'),
    },
  });
}
