import React, {useMemo, useRef, type RefObject} from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import {
  chunkEmojis,
  EMOJI_COLUMNS,
  EMOJIS_BY_CATEGORY,
  type EmojiSubcategoryId,
} from './emojis';
import {
  createEmojiPanelSharedStyles,
  EMOJI_CELL_GAP,
} from './emojiPanelLayout';

type EmojiCategoryGridProps = {
  category: EmojiSubcategoryId;
  width: number;
  height: number;
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
  selectionLockedRef,
  onSelect,
}: EmojiCategoryGridProps) {
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const rowHeight = useMemo(() => Math.floor(height / 4), [height]);
  const styles = useThemedStyles(() =>
    createEmojiCategoryGridStyles(height, rowHeight),
  );
  const gridScrollGuard = useScrollGuard();

  const gridRows = useMemo(
    () => chunkEmojis(EMOJIS_BY_CATEGORY[category], EMOJI_COLUMNS),
    [category],
  );

  const handleEmojiPress = (emoji: string) => {
    if (selectionLockedRef?.current || gridScrollGuard.scrollingRef.current) {
      return;
    }
    onSelect(emoji);
    triggerKeyHaptic();
  };

  const renderEmojiCell = (
    emoji: string | undefined,
    key: string,
    onPress?: () => void,
  ) => {
    if (!emoji) {
      return (
        <View
          key={key}
          style={[sharedStyles.emojiCell, styles.cell]}
        />
      );
    }

    return (
      <Pressable
        key={key}
        onPress={onPress}
        style={({pressed}) => [
          sharedStyles.emojiCell,
          styles.cell,
          pressed && sharedStyles.emojiCellPressed,
        ]}>
        <Text style={[sharedStyles.emojiText, styles.emoji]}>{emoji}</Text>
      </Pressable>
    );
  };

  const renderGridRow: ListRenderItem<readonly string[]> = ({
    item: row,
    index: rowIndex,
  }) => (
    <View style={styles.row}>
      {row.map(emoji =>
        renderEmojiCell(emoji, `${category}-${rowIndex}-${emoji}`, () => {
          handleEmojiPress(emoji);
        }),
      )}
      {row.length < EMOJI_COLUMNS
        ? Array.from({length: EMOJI_COLUMNS - row.length}).map((_, index) =>
            renderEmojiCell(undefined, `${category}-spacer-${rowIndex}-${index}`),
          )
        : null}
    </View>
  );

  return (
    <View style={[styles.panel, {width}]}>
      <FlatList
        style={styles.gridScroll}
        contentContainerStyle={sharedStyles.scrollContent}
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
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
        scrollEventThrottle={16}
        onScroll={gridScrollGuard.onScroll}
        onScrollBeginDrag={gridScrollGuard.markScrollStart}
        onMomentumScrollBegin={gridScrollGuard.markScrollStart}
        onMomentumScrollEnd={gridScrollGuard.markScrollEnd}
        onScrollEndDrag={gridScrollGuard.markScrollEnd}
      />
    </View>
  );
}

function createEmojiCategoryGridStyles(panelHeight: number, rowHeight: number) {
  return StyleSheet.create({
    panel: {
      height: panelHeight,
    },
    gridScroll: {
      flex: 1,
      height: panelHeight,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: rowHeight,
      gap: EMOJI_CELL_GAP,
    },
    cell: {
      height: rowHeight,
    },
    emoji: {
      lineHeight: rowHeight,
    },
  });
}
