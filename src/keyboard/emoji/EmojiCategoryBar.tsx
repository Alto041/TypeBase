import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {EMOJI_CATEGORIES, type EmojiCategoryId} from './emojis';

type EmojiCategoryBarProps = {
  selected: EmojiCategoryId;
  onSelect: (category: EmojiCategoryId) => void;
};

const ICON_SIZE = 20;

export function EmojiCategoryBar({selected, onSelect}: EmojiCategoryBarProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createEmojiCategoryBarStyles);

  return (
    <View style={styles.container}>
      {EMOJI_CATEGORIES.map(({id, Icon}) => {
        const isSelected = selected === id;

        return (
          <Pressable
            key={id}
            onPressIn={() => {
              triggerKeyHaptic();
              onSelect(id);
            }}
            style={({pressed}) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            hitSlop={3}>
            <Icon
              width={ICON_SIZE}
              height={ICON_SIZE}
              color={theme.icon}
              style={{opacity: isSelected ? 1 : 0.45}}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function createEmojiCategoryBarStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: theme.keyHeight,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 0,
      paddingVertical: 2,
      borderRadius: 6,
    },
    buttonPressed: {
      opacity: 0.75,
    },
  });
}
