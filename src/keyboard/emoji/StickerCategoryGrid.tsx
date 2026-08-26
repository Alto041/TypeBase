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
  fetchRecommendedStickerPacks,
  fetchStickerPackById,
  type StickerLyPack,
} from './stickerLyService';
import {
  ALL_STICKER_PACK_ID,
  chunkStickers,
  STICKER_COLUMNS,
  stickersFromAllPacks,
  stickersFromPack,
  type StickerLySticker,
} from './stickers';

type StickerCategoryGridProps = {
  width: number;
  height: number;
  onSelect: (sticker: StickerLySticker) => void;
};

type StickerRow = readonly StickerLySticker[];

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
  const [packs, setPacks] = useState<StickerLyPack[]>([]);
  const [packDetails, setPackDetails] = useState<Record<string, StickerLyPack>>({});
  const [selectedPackId, setSelectedPackId] = useState<string>(ALL_STICKER_PACK_ID);
  const [loading, setLoading] = useState(true);
  const [packLoading, setPackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchRecommendedStickerPacks()
      .then(nextPacks => {
        if (cancelled) {
          return;
        }
        const staticPacks = nextPacks.filter(pack => !pack.isAnimated);
        setPacks(staticPacks);
        setSelectedPackId(ALL_STICKER_PACK_ID);
        if (staticPacks.length === 0) {
          setError('No sticker packs available');
        }
      })
      .catch(loadError => {
        if (cancelled) {
          return;
        }
        setPacks([]);
        setSelectedPackId(ALL_STICKER_PACK_ID);
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

  const resolvedPacks = useMemo(
    () => packs.map(pack => packDetails[pack.packId] ?? pack),
    [packDetails, packs],
  );

  useEffect(() => {
    if (!selectedPackId || selectedPackId === ALL_STICKER_PACK_ID) {
      setPackLoading(false);
      return;
    }

    const listed = packs.find(pack => pack.packId === selectedPackId);
    const cached = packDetails[selectedPackId];
    if (
      cached &&
      cached.resourceFiles.length >= (listed?.resourceFiles.length ?? 0)
    ) {
      setPackLoading(false);
      return;
    }

    let cancelled = false;
    setPackLoading(true);
    void fetchStickerPackById(selectedPackId)
      .then(fullPack => {
        if (cancelled || !fullPack) {
          return;
        }
        setPackDetails(current => ({
          ...current,
          [fullPack.packId]: fullPack,
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setPackLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [packDetails, packs, selectedPackId]);

  const selectedPack = useMemo(() => {
    if (!selectedPackId || selectedPackId === ALL_STICKER_PACK_ID) {
      return null;
    }
    return (
      packDetails[selectedPackId] ??
      packs.find(pack => pack.packId === selectedPackId) ??
      null
    );
  }, [packDetails, packs, selectedPackId]);

  const stickers = useMemo(() => {
    if (selectedPackId === ALL_STICKER_PACK_ID) {
      return stickersFromAllPacks(resolvedPacks);
    }
    return selectedPack ? stickersFromPack(selectedPack) : [];
  }, [resolvedPacks, selectedPack, selectedPackId]);

  const rows = useMemo(() => chunkStickers(stickers, STICKER_COLUMNS), [stickers]);

  const handleStickerPress = useCallback(
    (sticker: StickerLySticker) => {
      triggerKeyHaptic();
      onSelect(sticker);
    },
    [onSelect],
  );

  const handleAllPress = useCallback(() => {
    triggerKeyHaptic();
    setSelectedPackId(ALL_STICKER_PACK_ID);
  }, []);

  const handlePackPress = useCallback((pack: StickerLyPack) => {
    triggerKeyHaptic();
    setSelectedPackId(pack.packId);
  }, []);

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
          <View style={styles.packBarWrap}>
            <ScrollView
              horizontal
              style={styles.packScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.packBar}
              keyboardShouldPersistTaps="handled">
              <Pressable
                accessibilityLabel="All sticker packs"
                onPress={handleAllPress}
                style={({pressed}) => [
                  styles.allChip,
                  selectedPackId === ALL_STICKER_PACK_ID &&
                    styles.packChipSelected,
                  pressed && styles.packChipPressed,
                ]}>
                <Text
                  style={[
                    styles.allChipLabel,
                    selectedPackId === ALL_STICKER_PACK_ID &&
                      styles.allChipLabelSelected,
                  ]}>
                  All
                </Text>
              </Pressable>
              {packs.map(pack => {
                const thumbUrl = `${pack.resourceUrlPrefix}${pack.resourceFiles[0] ?? ''}`;
                const selected = pack.packId === selectedPackId;
                return (
                  <Pressable
                    key={pack.packId}
                    accessibilityLabel={pack.name}
                    onPress={() => {
                      handlePackPress(pack);
                    }}
                    style={({pressed}) => [
                      styles.packChip,
                      selected && styles.packChipSelected,
                      pressed && styles.packChipPressed,
                    ]}>
                    {thumbUrl ? (
                      <Image
                        source={{uri: thumbUrl}}
                        style={styles.packThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.packThumbFallback} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <FlatList
            style={styles.scroll}
            contentContainerStyle={styles.content}
            data={rows}
            keyExtractor={(_, rowIndex) => `sticker-row-${selectedPackId}-${rowIndex}`}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              packLoading ? (
                <View style={styles.packLoadingRow}>
                  <ActivityIndicator color={theme.icon} size="small" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={sharedStyles.centeredLoader}>
                <Text style={sharedStyles.emptyTitle}>No stickers in pack</Text>
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
) {
  const horizontalPadding = 12;
  const cellWidth =
    (width - horizontalPadding * 2 - GIF_CELL_GAP * (STICKER_COLUMNS - 1)) /
    STICKER_COLUMNS;
  const packBarHeight = 36;

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
    packBarWrap: {
      height: packBarHeight,
      flexShrink: 0,
      flexGrow: 0,
    },
    packScroll: {
      height: packBarHeight,
      flexGrow: 0,
    },
    packBar: {
      paddingHorizontal: horizontalPadding,
      paddingVertical: 4,
      gap: 6,
      alignItems: 'center',
    },
    packChip: {
      width: 32,
      height: 28,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.pluginCardSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
    },
    packChipSelected: {
      borderColor: theme.chipSelectedBackground,
      borderWidth: 1.5,
    },
    packChipPressed: {
      opacity: 0.82,
    },
    allChip: {
      minWidth: 32,
      height: 28,
      paddingHorizontal: 8,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.pluginCardSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.borderSubtle,
    },
    allChipLabel: {
      fontSize: 11,
      color: theme.iconMuted,
      fontFamily: 'FragmentMono',
    },
    allChipLabelSelected: {
      color: theme.label,
    },
    packLoadingRow: {
      paddingVertical: 6,
      alignItems: 'center',
    },
    packThumb: {
      width: '100%',
      height: '100%',
    },
    packThumbFallback: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.pluginCard,
    },
    scroll: {
      flex: 1,
      minHeight: 0,
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
