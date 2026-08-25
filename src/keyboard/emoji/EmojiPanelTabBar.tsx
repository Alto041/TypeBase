import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, Pressable, StyleSheet, View} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {EMOJI_PANEL_TABS, type EmojiPanelTab} from './emojis';
import {animateSelectorTranslate} from './emojiSelectorAnimation';

type EmojiPanelTabBarProps = {
  selected: EmojiPanelTab;
  onSelect: (tab: EmojiPanelTab) => void;
};

const ICON_SIZE = 22;
const PILL_INSET = 4;

export function EmojiPanelTabBar({selected, onSelect}: EmojiPanelTabBarProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createEmojiPanelTabBarStyles);
  const [barWidth, setBarWidth] = useState(0);
  const pillTranslateX = useRef(new Animated.Value(PILL_INSET)).current;

  const selectedIndex = useMemo(
    () => Math.max(0, EMOJI_PANEL_TABS.findIndex(tab => tab.id === selected)),
    [selected],
  );
  const tabWidth = barWidth > 0 ? barWidth / EMOJI_PANEL_TABS.length : 0;
  const pillWidth = Math.max(0, tabWidth - PILL_INSET * 2);

  useEffect(() => {
    if (tabWidth <= 0) {
      return;
    }
    animateSelectorTranslate(
      pillTranslateX,
      selectedIndex * tabWidth + PILL_INSET,
    );
  }, [pillTranslateX, selectedIndex, tabWidth]);

  const onBarLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== barWidth) {
      setBarWidth(width);
    }
  };

  return (
    <View style={styles.container} onLayout={onBarLayout}>
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: pillWidth,
              transform: [{translateX: pillTranslateX}],
            },
          ]}
        />
      ) : null}

      {EMOJI_PANEL_TABS.map(({id, Icon}) => {
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
            hitSlop={4}>
            <Icon
              width={ICON_SIZE}
              height={ICON_SIZE}
              color={theme.icon}
              style={{opacity: isSelected ? 1 : 0.42}}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function createEmojiPanelTabBarStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-evenly',
      minHeight: theme.keyHeight,
      position: 'relative',
    },
    pill: {
      position: 'absolute',
      left: 0,
      top: 4,
      bottom: 4,
      borderRadius: 8,
      backgroundColor: theme.pluginCardSecondary,
    },
    button: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      borderRadius: 8,
      zIndex: 1,
    },
    buttonPressed: {
      opacity: 0.78,
    },
  });
}
