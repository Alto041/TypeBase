import React, {useCallback, useMemo} from 'react';
import {
  FlatList,
  Image,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {
  createEmojiPanelSharedStyles,
  GIF_CELL_GAP,
} from './emojiPanelLayout';
import {
  chunkStickers,
  KEYBOARD_STICKERS,
  STICKER_COLUMNS,
  type KeyboardSticker,
} from './stickers';

type StickerCategoryGridProps = {
  width: number;
  height: number;
  onSelect: (sticker: KeyboardSticker) => void;
};

type StickerRow = readonly KeyboardSticker[];

export function StickerCategoryGrid({
  width,
  height,
  onSelect,
}: StickerCategoryGridProps) {
  const theme = useKeyboardTheme();
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const styles = useThemedStyles(themeValue =>
    createStickerCategoryGridStyles(themeValue, height, width),
  );
  const rows = useMemo(() => chunkStickers(KEYBOARD_STICKERS), []);

  const handleStickerPress = useCallback(
    (sticker: KeyboardSticker) => {
      triggerKeyHaptic();
      onSelect(sticker);
    },
    [onSelect],
  );

  const renderRow: ListRenderItem<StickerRow> = ({item: row, index: rowIndex}) => (
    <View style={styles.row}>
      {row.map(sticker => (
        <Pressable
          key={sticker.id}
          accessibilityLabel={sticker.label}
          onPress={() => {
            handleStickerPress(sticker);
          }}
          style={({pressed}) => [styles.cell, pressed && styles.cellPressed]}>
          <Image
            source={sticker.source}
            style={styles.preview}
            resizeMode="cover"
          />
        </Pressable>
      ))}
      {row.length < STICKER_COLUMNS
        ? Array.from({length: STICKER_COLUMNS - row.length}).map((_, index) => (
            <View
              key={`sticker-spacer-${rowIndex}-${index}`}
              style={styles.cellSpacer}
            />
          ))
        : null}
    </View>
  );

  return (
    <View style={[styles.container, {width, height}]}>
      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(_, rowIndex) => `sticker-row-${rowIndex}`}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={sharedStyles.attribution}>TypeBase stickers</Text>
        }
      />
    </View>
  );
}

function createStickerCategoryGridStyles(
  theme: KeyboardTheme,
  height: number,
  width: number,
) {
  const horizontalPadding = 12;
  const cellWidth =
    (width - horizontalPadding * 2 - GIF_CELL_GAP * (STICKER_COLUMNS - 1)) /
    STICKER_COLUMNS;

  return StyleSheet.create({
    container: {
      height,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: horizontalPadding,
      paddingTop: 4,
      paddingBottom: 8,
      gap: GIF_CELL_GAP,
    },
    row: {
      flexDirection: 'row',
      gap: GIF_CELL_GAP,
    },
    cell: {
      width: cellWidth,
      height: cellWidth,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: theme.pluginCardSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
    },
    cellPressed: {
      opacity: 0.82,
    },
    cellSpacer: {
      width: cellWidth,
      height: cellWidth,
    },
    preview: {
      width: '100%',
      height: '100%',
    },
  });
}
