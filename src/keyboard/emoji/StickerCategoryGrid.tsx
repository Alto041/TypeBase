import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItem,
  Pressable,
  ScrollView,
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
  ensureRecentStickersLoaded,
  getRecentStickers,
  subscribeRecentStickers,
} from './recentStickersStore';
import {filterStickerPacksForChat, filterStickersForChat} from './stickerPackFilter';
import {fetchRecommendedStickerPacks, STICKERLY_RECOMMEND_PAGE_SIZE} from './stickerLyService';
import {
  chunkStickers,
  STICKER_COLUMNS,
  shuffledStickers,
  stickersFromAllPacks,
  type StickerLySticker,
} from './stickers';

type StickerCategoryGridProps = {
  width: number;
  height: number;
  onSelect: (sticker: StickerLySticker) => void;
};

type StickerRow = readonly StickerLySticker[];

const RECENT_CHIP_SIZE = 26;
const RECENT_BAR_HEIGHT = 34;

export function StickerCategoryGrid({
  width,
  height,
  onSelect,
}: StickerCategoryGridProps) {
  const theme = useKeyboardTheme();
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const [recentsVersion, setRecentsVersion] = useState(0);
  const recentStickers = useMemo(
    () => filterStickersForChat(getRecentStickers()),
    [recentsVersion],
  );
  const showRecentsBar = recentStickers.length > 0;
  const styles = useThemedStyles(themeValue =>
    createStickerCategoryGridStyles(
      themeValue,
      height,
      width,
      showRecentsBar,
    ),
  );
  const [stickers, setStickers] = useState<StickerLySticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeRecentStickers(() => setRecentsVersion(v => v + 1)),
    [],
  );

  useEffect(() => {
    void ensureRecentStickersLoaded();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchRecommendedStickerPacks(STICKERLY_RECOMMEND_PAGE_SIZE * 2)
      .then(nextPacks => {
        if (cancelled) {
          return;
        }
        const staticPacks = filterStickerPacksForChat(
          nextPacks.filter(pack => !pack.isAnimated),
        );
        const merged = shuffledStickers(stickersFromAllPacks(staticPacks));
        setStickers(merged);
        if (staticPacks.length === 0) {
          setError('No chat stickers available');
        }
      })
      .catch(loadError => {
        if (cancelled) {
          return;
        }
        setStickers([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load stickers',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => chunkStickers(stickers, STICKER_COLUMNS), [stickers]);

  const handleStickerPress = useCallback(
    (sticker: StickerLySticker) => {
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
            source={{uri: sticker.previewUrl}}
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
      {loading ? (
        <View style={sharedStyles.centeredLoader}>
          <ActivityIndicator color={theme.icon} />
        </View>
      ) : error ? (
        <View style={sharedStyles.centeredLoader}>
          <Text style={sharedStyles.emptyTitle}>Could not load stickers</Text>
          <Text style={sharedStyles.errorText}>{error}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {showRecentsBar ? (
            <View style={styles.recentsBarWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentsBar}
                keyboardShouldPersistTaps="handled">
                {recentStickers.map(sticker => (
                  <Pressable
                    key={`recent-${sticker.id}`}
                    accessibilityLabel={`Recent ${sticker.label}`}
                    onPress={() => {
                      handleStickerPress(sticker);
                    }}
                    style={({pressed}) => [
                      styles.recentChip,
                      pressed && styles.recentChipPressed,
                    ]}>
                    <Image
                      source={{uri: sticker.previewUrl}}
                      style={styles.recentPreview}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <FlatList
            style={styles.scroll}
            contentContainerStyle={styles.content}
            data={rows}
            keyExtractor={(_, rowIndex) => `sticker-row-${rowIndex}`}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={sharedStyles.centeredLoader}>
                <Text style={sharedStyles.emptyTitle}>No stickers available</Text>
              </View>
            }
            ListFooterComponent={
              <Text style={sharedStyles.attribution}>Powered by Sticker.ly</Text>
            }
          />
        </View>
      )}
    </View>
  );
}

function createStickerCategoryGridStyles(
  theme: KeyboardTheme,
  height: number,
  width: number,
  showRecentsBar: boolean,
) {
  const horizontalPadding = 12;
  const cellWidth =
    (width - horizontalPadding * 2 - GIF_CELL_GAP * (STICKER_COLUMNS - 1)) /
    STICKER_COLUMNS;

  return StyleSheet.create({
    container: {
      height,
      flexDirection: 'column',
    },
    body: {
      flex: 1,
      minHeight: 0,
      flexDirection: 'column',
    },
    recentsBarWrap: {
      height: showRecentsBar ? RECENT_BAR_HEIGHT : 0,
      flexShrink: 0,
      flexGrow: 0,
      borderBottomWidth: showRecentsBar ? StyleSheet.hairlineWidth : 0,
      borderBottomColor: theme.borderSubtle,
    },
    recentsBar: {
      paddingHorizontal: horizontalPadding,
      paddingVertical: 4,
      gap: 6,
      alignItems: 'center',
    },
    recentChip: {
      width: RECENT_CHIP_SIZE,
      height: RECENT_CHIP_SIZE,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.pluginCardSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
    },
    recentChipPressed: {
      opacity: 0.82,
    },
    recentPreview: {
      width: '100%',
      height: '100%',
    },
    scroll: {
      flex: 1,
      minHeight: 0,
    },
    content: {
      paddingHorizontal: horizontalPadding,
      paddingTop: showRecentsBar ? 4 : 6,
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
