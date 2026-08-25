import React, {useEffect, useRef} from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {EMOJI_SUBCATEGORIES, type EmojiSubcategoryId} from './emojis';
import {animateSelectorTranslate} from './emojiSelectorAnimation';

type EmojiSubcategoryBarProps = {
  selected: EmojiSubcategoryId;
  onSelect: (subcategory: EmojiSubcategoryId) => void;
};

type ItemLayout = {
  x: number;
  width: number;
};

const ICON_SIZE = 18;
const BUTTON_WIDTH = 34;
const BUTTON_HEIGHT = 30;

export function EmojiSubcategoryBar({
  selected,
  onSelect,
}: EmojiSubcategoryBarProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createEmojiSubcategoryBarStyles);
  const scrollRef = useRef<ScrollView>(null);
  const itemLayoutsRef = useRef<Partial<Record<EmojiSubcategoryId, ItemLayout>>>(
    {},
  );
  const pillTranslateX = useRef(new Animated.Value(0)).current;
  const hasInitialLayoutRef = useRef(false);

  useEffect(() => {
    const layout = itemLayoutsRef.current[selected];
    if (!layout) {
      return;
    }

    animateSelectorTranslate(pillTranslateX, layout.x);

    if (!hasInitialLayoutRef.current) {
      hasInitialLayoutRef.current = true;
      return;
    }

    scrollRef.current?.scrollTo({
      x: Math.max(0, layout.x - BUTTON_WIDTH),
      animated: true,
    });
  }, [pillTranslateX, selected]);

  const onItemLayout = (id: EmojiSubcategoryId) => (event: LayoutChangeEvent) => {
    const {x, width} = event.nativeEvent.layout;
    itemLayoutsRef.current[id] = {x, width};

    if (id === selected) {
      animateSelectorTranslate(pillTranslateX, x);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: BUTTON_WIDTH,
              transform: [{translateX: pillTranslateX}],
            },
          ]}
        />

        {EMOJI_SUBCATEGORIES.map(({id, Icon}) => {
          const isSelected = selected === id;

          return (
            <Pressable
              key={id}
              onLayout={onItemLayout(id)}
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
      </ScrollView>
    </View>
  );
}

function createEmojiSubcategoryBarStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.borderSubtle,
      backgroundColor: theme.pluginCard,
    },
    content: {
      position: 'relative',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    pill: {
      position: 'absolute',
      left: 0,
      top: 4,
      height: BUTTON_HEIGHT,
      borderRadius: 8,
      backgroundColor: theme.pluginCardSecondary,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      borderRadius: 8,
      zIndex: 1,
    },
    buttonPressed: {
      opacity: 0.78,
    },
  });
}
