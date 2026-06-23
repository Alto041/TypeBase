import React, {useMemo, useRef} from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {chunkEmojis, EMOJI_COLUMNS} from './emojis';
import {searchEmojis} from './gboardEmojiData';

type EmojiSearchGridProps = {
  width: number;
  query: string;
  onSelect: (emoji: string) => void;
};

export function EmojiSearchGrid({width, query, onSelect}: EmojiSearchGridProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createEmojiSearchGridStyles);
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiRowHeight = Math.floor(emojiScrollHeight / 4);
  const results = useMemo(() => searchEmojis(query), [query]);
  const rows = useMemo(
    () => chunkEmojis(results, EMOJI_COLUMNS),
    [results],
  );

  // Guard to avoid treating scroll gestures as emoji picks
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
          style={styles.cell}>
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
      {row.length < EMOJI_COLUMNS
        ? Array.from({length: EMOJI_COLUMNS - row.length}).map((_, spacer) => (
            <View key={`search-spacer-${index}-${spacer}`} style={styles.cell} />
          ))
        : null}
    </View>
  );

  if (!query.trim()) {
    return (
      <View style={[styles.emptyState, {width}]}>
        <Text style={styles.emptyText}>Type to search emojis</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[styles.emptyState, {width}]}>
        <Text style={styles.emptyText}>No emojis found</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{width}}
      contentContainerStyle={styles.content}
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
        length: emojiRowHeight,
        offset: emojiRowHeight * index,
        index,
      })}
    />
  );
}

function createEmojiSearchGridStyles(theme: KeyboardTheme) {
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiRowHeight = Math.floor(emojiScrollHeight / 4);

  return StyleSheet.create({
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
    emoji: {
      fontSize: 22,
      lineHeight: emojiRowHeight,
    },
    emptyState: {
      height: emojiScrollHeight,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    emptyText: {
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      textAlign: 'center',
    },
  });
}
