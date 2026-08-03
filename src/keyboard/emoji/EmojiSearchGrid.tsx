import React, {useMemo, useRef} from 'react';
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
import {chunkEmojis, EMOJI_COLUMNS} from './emojis';
import {
  createEmojiPanelSharedStyles,
  EMOJI_CELL_GAP,
} from './emojiPanelLayout';
import {searchEmojis} from './gboardEmojiData';

type EmojiSearchGridProps = {
  width: number;
  height: number;
  query: string;
  onSelect: (emoji: string) => void;
};

export function EmojiSearchGrid({
  width,
  height,
  query,
  onSelect,
}: EmojiSearchGridProps) {
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const rowHeight = useMemo(() => Math.floor(height / 4), [height]);
  const styles = useMemo(
    () => createEmojiSearchGridStyles(rowHeight),
    [rowHeight],
  );
  const results = useMemo(() => searchEmojis(query), [query]);
  const rows = useMemo(
    () => chunkEmojis(results, EMOJI_COLUMNS),
    [results],
  );

  const scrollingRef = useRef(false);
  const markScrolling = () => {
    scrollingRef.current = true;
  };
  const clearScrolling = () => {
    scrollingRef.current = false;
  };
  const handleEmojiPress = (emoji: string) => {
    if (scrollingRef.current) {
      return;
    }
    onSelect(emoji);
    triggerKeyHaptic();
  };

  const renderRow: ListRenderItem<readonly string[]> = ({item: row, index}) => (
    <View style={styles.row}>
      {row.map(emoji => (
        <Pressable
          key={`search-${index}-${emoji}`}
          onPress={() => {
            handleEmojiPress(emoji);
          }}
          style={({pressed}) => [
            sharedStyles.emojiCell,
            styles.cell,
            pressed && sharedStyles.emojiCellPressed,
          ]}>
          <Text style={[sharedStyles.emojiText, styles.emoji]}>{emoji}</Text>
        </Pressable>
      ))}
      {row.length < EMOJI_COLUMNS
        ? Array.from({length: EMOJI_COLUMNS - row.length}).map((_, spacer) => (
            <View
              key={`search-spacer-${index}-${spacer}`}
              style={[sharedStyles.emojiCell, styles.cell]}
            />
          ))
        : null}
    </View>
  );

  if (!query.trim()) {
    return (
      <View style={[sharedStyles.emptyState, {width, height}]}>
        <Text style={sharedStyles.emptyTitle}>Search emojis</Text>
        <Text style={sharedStyles.emptyHint}>
          Tap the search bar above and type a keyword.
        </Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[sharedStyles.emptyState, {width, height}]}>
        <Text style={sharedStyles.emptyTitle}>No emojis found</Text>
        <Text style={sharedStyles.emptyHint}>
          Try a different word or spelling.
        </Text>
      </View>
    );
  }

  return (
    <View style={{width, height}}>
      <View style={sharedStyles.sectionHeader}>
        <Text style={sharedStyles.sectionHeaderText}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </Text>
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={sharedStyles.scrollContent}
        data={rows}
        keyExtractor={(_, rowIndex) => `search-row-${rowIndex}`}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={16}
        scrollEventThrottle={16}
        onScroll={markScrolling}
        onScrollBeginDrag={markScrolling}
        onScrollEndDrag={clearScrolling}
        onMomentumScrollEnd={clearScrolling}
        getItemLayout={(_, index) => ({
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
      />
    </View>
  );
}

function createEmojiSearchGridStyles(rowHeight: number) {
  return StyleSheet.create({
    list: {
      flex: 1,
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
