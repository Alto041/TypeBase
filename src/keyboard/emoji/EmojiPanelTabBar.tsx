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
const SELECTED_SCALE = 1.15;
const IDLE_SCALE = 1;

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

  const iconScales = useRef(
    EMOJI_PANEL_TABS.map(() => new Animated.Value(IDLE_SCALE)),
  ).current;
  const iconOpacities = useRef(
    EMOJI_PANEL_TABS.map(() => new Animated.Value(0.42)),
  ).current;

  useEffect(() => {
    if (tabWidth <= 0) {
      return;
    }
    animateSelectorTranslate(
      pillTranslateX,
      selectedIndex * tabWidth + PILL_INSET,
    );
  }, [pillTranslateX, selectedIndex, tabWidth]);

  useEffect(() => {
    EMOJI_PANEL_TABS.forEach((tab, index) => {
      const isSelected = tab.id === selected;
      Animated.parallel([
        Animated.spring(iconScales[index]!, {
          toValue: isSelected ? SELECTED_SCALE : IDLE_SCALE,
          friction: 8,
          tension: 220,
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacities[index]!, {
          toValue: isSelected ? 1 : 0.42,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [selected, iconScales, iconOpacities]);

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

      {EMOJI_PANEL_TABS.map(({id, Icon}, index) => {
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
            <Animated.View
              style={{
                transform: [{scale: iconScales[index]!}],
                opacity: iconOpacities[index]!,
              }}>
              <Icon
                width={ICON_SIZE}
                height={ICON_SIZE}
                color={isSelected ? theme.icon : theme.icon}
              />
            </Animated.View>
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
