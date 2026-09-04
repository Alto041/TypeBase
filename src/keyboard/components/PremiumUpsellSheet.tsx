import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {openPremiumUpgradeScreen} from '../../licensing/premium';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';

type PremiumUpsellSheetProps = {
  title?: string;
  body?: string;
  onDismiss: () => void;
};

export function PremiumUpsellSheet({
  title = 'Premium feature',
  body = 'Unlock TypeBase to use plugins, themes, gestures, and full autocorrection.',
  onDismiss,
}: PremiumUpsellSheetProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, {backgroundColor: theme.pluginCard}]}>
        <Text style={[styles.title, {color: theme.label}]}>{title}</Text>
        <Text style={[styles.body, {color: theme.iconMuted}]}>{body}</Text>
        <Pressable
          style={[styles.primaryBtn, {backgroundColor: '#D71921'}]}
          onPress={() => {
            void openPremiumUpgradeScreen();
            onDismiss();
          }}>
          <Text style={styles.primaryBtnText}>Unlock in app</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
          <Text style={[styles.secondaryBtnText, {color: theme.iconMuted}]}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(_theme: KeyboardTheme) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      zIndex: 200,
    },
    card: {
      width: '100%',
      borderRadius: 16,
      padding: 20,
      gap: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
    },
    primaryBtn: {
      marginTop: 4,
      borderRadius: 12,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryBtn: {
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      fontSize: 14,
    },
  });
}
