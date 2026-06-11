import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {EMOJI_CATEGORIES, type EmojiCategoryId} from './emojis';

type EmojiPanelProps = {
  category: EmojiCategoryId;
  onCategoryChange: (category: EmojiCategoryId) => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPanel({
  category,
  onCategoryChange,
  onSelect,
}: EmojiPanelProps) {
  const theme = useKeyboardTheme();
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiFadeHeight = Math.round(emojiScrollHeight * 0.52);
  const styles = useMemo(
    () => createEmojiPanelStyles(theme, emojiScrollHeight, emojiFadeHeight),
    [theme, emojiScrollHeight, emojiFadeHeight],
  );
  const pagerRef = useRef<ScrollView>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const isDraggingPager = useRef(false);
  const selectionLockedRef = useRef(false);
  const hasInitializedPager = useRef(false);

  const scrollToCategory = useCallback(
    (nextCategory: EmojiCategoryId, animated: boolean) => {
      if (panelWidth <= 0) {
        return;
      }
      const index = EMOJI_CATEGORIES.findIndex(item => item.id === nextCategory);
      if (index < 0) {
        return;
      }
      pagerRef.current?.scrollTo({
        x: index * panelWidth,
        animated,
      });
    },
    [panelWidth],
  );

  useEffect(() => {
    if (panelWidth <= 0 || isDraggingPager.current) {
      return;
    }
    scrollToCategory(category, hasInitializedPager.current);
    hasInitializedPager.current = true;
  }, [category, panelWidth, scrollToCategory]);

  const releasePagerSelectionLock = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const velocityX = event.nativeEvent.velocity?.x ?? 0;
    if (Math.abs(velocityX) < 0.15) {
      isDraggingPager.current = false;
      selectionLockedRef.current = false;
    }
  };

  const handlePagerScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (panelWidth <= 0) {
      return;
    }
    const index = Math.round(event.nativeEvent.contentOffset.x / panelWidth);
    const nextCategory = EMOJI_CATEGORIES[index]?.id;
    isDraggingPager.current = false;
    selectionLockedRef.current = false;
    if (nextCategory && nextCategory !== category) {
      onCategoryChange(nextCategory);
    }
  };

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const width = Math.round(event.nativeEvent.layout.width);
        if (width > 0 && width !== panelWidth) {
          setPanelWidth(width);
        }
      }}>
      {panelWidth > 0 ? (
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          decelerationRate="fast"
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => {
            isDraggingPager.current = true;
            selectionLockedRef.current = true;
          }}
          onMomentumScrollBegin={() => {
            selectionLockedRef.current = true;
          }}
          onMomentumScrollEnd={handlePagerScrollEnd}
          onScrollEndDrag={releasePagerSelectionLock}
          style={styles.pager}
          contentContainerStyle={styles.pagerContent}>
          {EMOJI_CATEGORIES.map(({id}) => (
            <EmojiCategoryGrid
              key={id}
              category={id}
              width={panelWidth}
              selectionLockedRef={selectionLockedRef}
              onSelect={onSelect}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="emojiSmoke" x1="0" y1="1" x2="0" y2="0">
              <Stop
                offset="0"
                stopColor={theme.container}
                stopOpacity="1"
              />
              <Stop
                offset="0.5"
                stopColor={theme.container}
                stopOpacity="0.4"
              />
              <Stop
                offset="1"
                stopColor={theme.container}
                stopOpacity="0"
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#emojiSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createEmojiPanelStyles(
  theme: KeyboardTheme,
  emojiScrollHeight: number,
  emojiFadeHeight: number,
) {
  return StyleSheet.create({
    container: {
      height: emojiScrollHeight,
      marginBottom: theme.emojiPanelGap,
      overflow: 'hidden',
    },
    pager: {
      flex: 1,
    },
    pagerContent: {
      alignItems: 'flex-start',
    },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: emojiFadeHeight,
    },
  });
}
