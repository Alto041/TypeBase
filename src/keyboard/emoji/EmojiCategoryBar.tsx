import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {triggerKeyHaptic} from '../haptics';
import {keyboardTheme} from '../theme';
import {EMOJI_CATEGORIES, type EmojiCategoryId} from './emojis';

type EmojiCategoryBarProps = {
  selected: EmojiCategoryId;
  onSelect: (category: EmojiCategoryId) => void;
};

const ICON_SIZE = 22;

export function EmojiCategoryBar({selected, onSelect}: EmojiCategoryBarProps) {
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
              style={{opacity: isSelected ? 1 : 0.45}}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: keyboardTheme.keyHeight,
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
