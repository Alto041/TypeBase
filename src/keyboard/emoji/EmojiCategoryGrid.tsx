import React, {useMemo, useRef, type RefObject} from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {
  chunkEmojis,
  EMOJI_COLUMNS,
  EMOJIS_BY_CATEGORY,
  type EmojiCategoryId,
} from './emojis';

type EmojiCategoryGridProps = {
  category: Exclude<EmojiCategoryId, 'gif' | 'sfx'>;
  width: number;
  height: number;
  recentEmojis: readonly string[];
  recentEmojisVersion: number;
  selectionLockedRef?: RefObject<boolean>;
  onSelect: (emoji: string) => void;
};

function useScrollGuard() {
  const scrollingRef = useRef(false);

  const markScrollStart = () => {
    scrollingRef.current = true;
  };

  const markScrollEnd = () => {
    scrollingRef.current = false;
  };

  const onScroll = () => {
    scrollingRef.current = true;
  };

  return {scrollingRef, markScrollStart, markScrollEnd, onScroll};
}

export function EmojiCategoryGrid({
  category,
  width,
  height,
  recentEmojis,
  recentEmojisVersion,
  selectionLockedRef,
  onSelect,
}: EmojiCategoryGridProps) {
  const theme = useKeyboardTheme();
  const emojiScrollHeight = Math.max(120, Math.round(height));
  const styles = useMemo(
    () => createEmojiCategoryGridStyles(theme, emojiScrollHeight),
    [theme, emojiScrollHeight],
  );
  const emojiRowHeight = Math.floor(emojiScrollHeight / 4);
  const hasRecents = recentEmojis.length > 0;
  const dividerWidth = 1;
  const availableWidth = width - dividerWidth;
  const recentColumnWidth = Math.floor(
    availableWidth / (EMOJI_COLUMNS + 1),
  );
  const gridWidth = availableWidth - recentColumnWidth;
  const gridScrollGuard = useScrollGuard();
  const recentScrollGuard = useScrollGuard();

  // Keep guards in sync if one list starts scrolling; treat either as "user is scrolling emojis"
  const isAnyScrolling = () =>
    gridScrollGuard.scrollingRef.current || recentScrollGuard.scrollingRef.current;

  const gridRows = useMemo(
    () => chunkEmojis(EMOJIS_BY_CATEGORY[category], EMOJI_COLUMNS),
    [category],
  );

  const handleEmojiPress = (emoji: string) => {
    if (selectionLockedRef?.current || isAnyScrolling()) {
      return;
    }
    onSelect(emoji);
    triggerKeyHaptic();
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
          style={styles.cell}>
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
      style={styles.recentCell}>
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
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      updateCellsBatchingPeriod={16}
      getItemLayout={(_, index) => ({
        length: emojiRowHeight,
        offset: emojiRowHeight * index,
        index,
      })}
      scrollEventThrottle={16}
      onScroll={gridScrollGuard.onScroll}
      onScrollBeginDrag={gridScrollGuard.markScrollStart}
      onMomentumScrollBegin={gridScrollGuard.markScrollStart}
      onMomentumScrollEnd={gridScrollGuard.markScrollEnd}
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
          extraData={recentEmojisVersion}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={16}
          getItemLayout={(_, index) => ({
            length: emojiRowHeight,
            offset: emojiRowHeight * index,
            index,
          })}
          scrollEventThrottle={16}
          onScroll={recentScrollGuard.onScroll}
          onScrollBeginDrag={recentScrollGuard.markScrollStart}
          onMomentumScrollBegin={recentScrollGuard.markScrollStart}
          onMomentumScrollEnd={recentScrollGuard.markScrollEnd}
          onScrollEndDrag={recentScrollGuard.markScrollEnd}
        />
      </View>
      <View style={styles.columnDivider} />
      {gridList}
    </View>
  );
}

function createEmojiCategoryGridStyles(
  theme: KeyboardTheme,
  emojiScrollHeight: number,
) {
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
      backgroundColor: theme.pluginCard,
      borderRadius: 22,
      marginLeft: 5,
      marginTop: 2,
      marginBottom: 6,
      overflow: 'hidden',
    },
    recentList: {
      flex: 1,
      width: '100%',
    },
    recentContent: {
      paddingTop: 4,
      paddingBottom: 2,
      gap: 2,
    },
    columnDivider: {
      flexShrink: 0,
      width: 1,
      marginLeft: 4,
      marginVertical: 10,
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
    emoji: {
      fontSize: 22,
      lineHeight: emojiRowHeight,
    },
  });
}
