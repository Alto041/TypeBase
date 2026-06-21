import React, {useMemo, useRef, type RefObject} from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {
  EMOJI_COLUMNS,
  EMOJI_ROWS_BY_CATEGORY,
  type EmojiCategoryId,
} from './emojis';

type EmojiCategoryGridProps = {
  category: Exclude<EmojiCategoryId, 'gif'>;
  width: number;
  selectionLockedRef?: RefObject<boolean>;
  onSelect: (emoji: string) => void;
};

export function EmojiCategoryGrid({
  category,
  width,
  selectionLockedRef,
  onSelect,
}: EmojiCategoryGridProps) {
  const styles = useThemedStyles(createEmojiCategoryGridStyles);
  const isVerticalScrollingRef = useRef(false);
  const rows = useMemo(
    () => EMOJI_ROWS_BY_CATEGORY[category] ?? [],
    [category],
  );

  const handleVerticalScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const velocityY = event.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(velocityY) < 0.15) {
      isVerticalScrollingRef.current = false;
    }
  };

  const handleEmojiPress = (emoji: string) => {
    if (selectionLockedRef?.current || isVerticalScrollingRef.current) {
      return;
    }
    triggerKeyHaptic();
    onSelect(emoji);
  };

  const renderRow: ListRenderItem<readonly string[]> = ({item: row, index: rowIndex}) => (
    <View style={styles.row}>
      {row.map(emoji => (
        <Pressable
          key={`${category}-${emoji}`}
          onPress={() => {
            handleEmojiPress(emoji);
          }}
          style={({pressed}) => [
            styles.cell,
            pressed && styles.cellPressed,
          ]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
      {row.length < EMOJI_COLUMNS
        ? Array.from({length: EMOJI_COLUMNS - row.length}).map((_, index) => (
            <View
              key={`${category}-spacer-${rowIndex}-${index}`}
              style={styles.cell}
            />
          ))
        : null}
    </View>
  );

  return (
    <FlatList
      style={[styles.scroll, {width}]}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(_, rowIndex) => `${category}-row-${rowIndex}`}
      renderItem={renderRow}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      onScrollBeginDrag={() => {
        isVerticalScrollingRef.current = true;
      }}
      onMomentumScrollBegin={() => {
        isVerticalScrollingRef.current = true;
      }}
      onMomentumScrollEnd={() => {
        isVerticalScrollingRef.current = false;
      }}
      onScrollEndDrag={handleVerticalScrollEnd}
    />
  );
}

function createEmojiCategoryGridStyles(theme: KeyboardTheme) {
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiRowHeight = Math.floor(emojiScrollHeight / 4);

  return StyleSheet.create({
    scroll: {
      height: emojiScrollHeight,
    },
    content: {
      paddingHorizontal: 6,
      paddingTop: 2,
      gap: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: emojiRowHeight,
    },
    cell: {
      flex: 1,
      height: emojiRowHeight,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    cellPressed: {
      backgroundColor: theme.letterKeyPressed,
    },
    emoji: {
      fontSize: 22,
      lineHeight: emojiRowHeight,
    },
  });
}
