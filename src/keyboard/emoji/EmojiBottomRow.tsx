import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Key} from '../components/Key';
import type {KeyDefinition} from '../layouts/qwerty';
import {useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {EmojiCategoryBar} from './EmojiCategoryBar';
import type {EmojiCategoryId} from './emojis';

const ABC_KEY: KeyDefinition = {
  id: 'abc',
  label: 'ABC',
  type: 'numbers',
};

const BACKSPACE_KEY: KeyDefinition = {
  id: 'emoji-backspace',
  label: '⌫',
  type: 'enter-backspace',
};

type EmojiBottomRowProps = {
  category: EmojiCategoryId;
  onCategorySelect: (category: EmojiCategoryId) => void;
  onKeyPress: (keyDef: KeyDefinition) => void;
};

export function EmojiBottomRow({
  category,
  onCategorySelect,
  onKeyPress,
}: EmojiBottomRowProps) {
  const styles = useThemedStyles(createEmojiBottomRowStyles);

  return (
    <View style={styles.row}>
      <View style={styles.sideKey}>
        <Key
          keyDef={ABC_KEY}
          isUppercase={false}
          isShiftOn={false}
          isCapsLocked={false}
          onPress={onKeyPress}
        />
      </View>
      <View style={styles.categories}>
        <EmojiCategoryBar selected={category} onSelect={onCategorySelect} />
      </View>
      <View style={styles.sideKey}>
        <Key
          keyDef={BACKSPACE_KEY}
          isUppercase={false}
          isShiftOn={false}
          isCapsLocked={false}
          onPress={onKeyPress}
        />
      </View>
    </View>
  );
}

function createEmojiBottomRowStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.keyGap,
      marginBottom: theme.keyRowMargin,
      paddingHorizontal: theme.keyRowPaddingHorizontal,
      alignItems: 'center',
    },
    sideKey: {
      flex: 1.2,
    },
    categories: {
      flex: 6,
    },
  });
}
