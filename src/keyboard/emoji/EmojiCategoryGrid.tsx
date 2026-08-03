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
  type EmojiCategoryId,
} from './emojis';
import {
  createEmojiPanelSharedStyles,
  EMOJI_CELL_GAP,
  RECENTS_CONTAINER_GAP,
  RECENTS_STRIP_V_PADDING,
} from './emojiPanelLayout';

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
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const hasRecents = recentEmojis.length > 0;
  const recentsStripHeight = hasRecents
    ? RECENTS_STRIP_V_PADDING * 2
    : 0;
  const rowHeight = useMemo(() => {
    if (hasRecents) {
      return Math.floor(
        (height - recentsStripHeight - RECENTS_CONTAINER_GAP) / 5,
      );
    }
    return Math.floor(height / 4);
  }, [hasRecents, height, recentsStripHeight]);
  const styles = useThemedStyles(() =>
    createEmojiCategoryGridStyles(height, hasRecents, rowHeight, recentsStripHeight),
  );
  const gridScrollGuard = useScrollGuard();

  const gridRows = useMemo(
    () => chunkEmojis(EMOJIS_BY_CATEGORY[category], EMOJI_COLUMNS),
    [category],
  );

  const recentSlots = useMemo(
    () => recentEmojis.slice(0, EMOJI_COLUMNS),
    [recentEmojis, recentEmojisVersion],
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

  const recentsStrip = hasRecents ? (
    <View style={[sharedStyles.recentsStrip, styles.recentsStrip]}>
      <View style={[sharedStyles.recentsRow, styles.row]}>
        {Array.from({length: EMOJI_COLUMNS}).map((_, index) =>
          renderEmojiCell(
            recentSlots[index],
            `recent-${recentSlots[index] ?? 'empty'}-${index}`,
            recentSlots[index]
              ? () => {
                  handleEmojiPress(recentSlots[index]!);
                }
              : undefined,
          ),
        )}
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.panel, {width}]}>
      {recentsStrip}
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

function createEmojiCategoryGridStyles(
  panelHeight: number,
  hasRecents: boolean,
  rowHeight: number,
  recentsStripHeight: number,
) {
  const recentsBlockHeight = hasRecents ? rowHeight + recentsStripHeight : 0;
  const recentsGap = hasRecents ? RECENTS_CONTAINER_GAP : 0;
  const gridHeight = panelHeight - recentsBlockHeight - recentsGap;

  return StyleSheet.create({
    panel: {
      height: panelHeight,
    },
    recentsStrip: {
      height: recentsBlockHeight,
      marginBottom: recentsGap,
    },
    gridScroll: {
      flex: 1,
      height: gridHeight,
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
