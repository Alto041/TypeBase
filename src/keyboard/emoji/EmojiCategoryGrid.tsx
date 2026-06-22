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
  chunkEmojis,
  EMOJI_COLUMNS,
  EMOJIS_BY_CATEGORY,
  type EmojiCategoryId,
} from './emojis';

type EmojiCategoryGridProps = {
  category: Exclude<EmojiCategoryId, 'gif'>;
  width: number;
  recentEmojis: readonly string[];
  selectionLockedRef?: RefObject<boolean>;
  onSelect: (emoji: string) => void;
};

function useScrollGuard() {
  const scrollingRef = useRef(false);

  const markScrollStart = () => {
    scrollingRef.current = true;
  };

  const markScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocityY = event.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(velocityY) < 0.15) {
      scrollingRef.current = false;
    }
  };

  const clearScroll = () => {
    scrollingRef.current = false;
  };

  return {scrollingRef, markScrollStart, markScrollEnd, clearScroll};
}

export function EmojiCategoryGrid({
  category,
  width,
  recentEmojis,
  selectionLockedRef,
  onSelect,
}: EmojiCategoryGridProps) {
  const styles = useThemedStyles(createEmojiCategoryGridStyles);
  const hasRecents = recentEmojis.length > 0;
  const dividerWidth = 1;
  const availableWidth = width - dividerWidth;
  const recentColumnWidth = Math.floor(
    availableWidth / (EMOJI_COLUMNS + 1),
  );
  const gridWidth = availableWidth - recentColumnWidth;
  const gridScrollGuard = useScrollGuard();
  const recentScrollGuard = useScrollGuard();

  const gridRows = useMemo(
    () => chunkEmojis(EMOJIS_BY_CATEGORY[category], EMOJI_COLUMNS),
    [category],
  );

  const handleEmojiPress = (emoji: string) => {
    if (
      selectionLockedRef?.current ||
      gridScrollGuard.scrollingRef.current ||
      recentScrollGuard.scrollingRef.current
    ) {
      return;
    }
    triggerKeyHaptic();
    onSelect(emoji);
  };

  const renderGridRow: ListRenderItem<readonly string[]> = ({
    item: row,
    index: rowIndex,
  }) => (
    <View style={styles.row}>
      {row.map(emoji => (
        <Pressable
          key={`${category}-${rowIndex}-${emoji}`}
          onPress={() => {
            handleEmojiPress(emoji);
          }}
          style={({pressed}) => [styles.cell, pressed && styles.cellPressed]}>
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

  const renderRecentItem: ListRenderItem<string> = ({item: emoji, index}) => (
    <Pressable
      onPress={() => {
        handleEmojiPress(emoji);
      }}
      style={({pressed}) => [
        styles.recentCell,
        pressed && styles.cellPressed,
      ]}>
      <Text style={styles.emoji}>{emoji}</Text>
    </Pressable>
  );

  const gridList = (
    <FlatList
      style={[styles.gridScroll, {width: hasRecents ? gridWidth : width}]}
      contentContainerStyle={styles.gridContent}
      data={gridRows}
      keyExtractor={(_, rowIndex) => `${category}-row-${rowIndex}`}
      renderItem={renderGridRow}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      onScrollBeginDrag={gridScrollGuard.markScrollStart}
      onMomentumScrollBegin={gridScrollGuard.markScrollStart}
      onMomentumScrollEnd={gridScrollGuard.clearScroll}
      onScrollEndDrag={gridScrollGuard.markScrollEnd}
    />
  );

  if (!hasRecents) {
    return (
      <View style={[styles.panel, {width}]}>
        {gridList}
      </View>
    );
  }

  return (
    <View style={[styles.panel, {width}]}>
      <View style={[styles.recentColumn, {width: recentColumnWidth}]}>
        <FlatList
          style={styles.recentList}
          contentContainerStyle={styles.recentContent}
          data={recentEmojis as string[]}
          keyExtractor={(emoji, index) => `recent-${emoji}-${index}`}
          renderItem={renderRecentItem}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={recentScrollGuard.markScrollStart}
          onMomentumScrollBegin={recentScrollGuard.markScrollStart}
          onMomentumScrollEnd={recentScrollGuard.clearScroll}
          onScrollEndDrag={recentScrollGuard.markScrollEnd}
        />
      </View>
      <View style={styles.columnDivider} />
      {gridList}
    </View>
  );
}

function createEmojiCategoryGridStyles(theme: KeyboardTheme) {
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiRowHeight = Math.floor(emojiScrollHeight / 4);

  return StyleSheet.create({
    panel: {
      flexDirection: 'row',
      height: emojiScrollHeight,
      alignItems: 'stretch',
    },
    recentColumn: {
      flexGrow: 0,
      flexShrink: 0,
      height: emojiScrollHeight,
      backgroundColor: theme.pluginCard,
      borderTopLeftRadius: 8,
      borderBottomLeftRadius: 8,
      overflow: 'hidden',
    },
    recentList: {
      flexGrow: 0,
      flexShrink: 0,
      width: '100%',
      height: emojiScrollHeight,
    },
    recentContent: {
      paddingTop: 2,
      gap: 2,
    },
    columnDivider: {
      flexShrink: 0,
      width: 1,
      marginVertical: 6,
      backgroundColor: theme.modifierKeyPressed,
    },
    gridScroll: {
      flexGrow: 0,
      flexShrink: 0,
      height: emojiScrollHeight,
    },
    gridContent: {
      paddingLeft: 4,
      paddingRight: 6,
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
    recentCell: {
      width: '100%',
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
