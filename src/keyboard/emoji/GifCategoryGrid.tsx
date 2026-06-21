import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
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
  chunkGifs,
  fetchTrendingGifs,
  getGifPreviewUrl,
  GIF_COLUMNS,
  GIF_PAGE_SIZE,
  searchGifs,
  type GiphyGif,
} from './giphyService';

type GifCategoryGridProps = {
  width: number;
  height: number;
  query: string;
  onSelect: (gif: GiphyGif) => void;
};

type GifRow = readonly GiphyGif[];

export function GifCategoryGrid({
  width,
  height,
  query,
  onSelect,
}: GifCategoryGridProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(themeValue =>
    createGifCategoryGridStyles(themeValue, height),
  );
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const activeQueryRef = useRef('');
  const requestIdRef = useRef(0);

  const rows = useMemo(() => chunkGifs(gifs, GIF_COLUMNS), [gifs]);

  const loadPage = useCallback(async (reset: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const querySnapshot = activeQueryRef.current;
    const offset = reset ? 0 : offsetRef.current;

    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const next =
        querySnapshot.trim().length > 0
          ? await searchGifs(querySnapshot, offset)
          : await fetchTrendingGifs(offset);

      if (requestId !== requestIdRef.current) {
        return;
      }

      hasMoreRef.current = next.length >= GIF_PAGE_SIZE;
      offsetRef.current = offset + next.length;
      setGifs(current => (reset ? next : [...current, ...next]));
      setError(null);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load GIFs',
      );
      if (reset) {
        setGifs([]);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      activeQueryRef.current = query;
      offsetRef.current = 0;
      hasMoreRef.current = true;
      void loadPage(true);
    }, query.trim() ? 300 : 0);

    return () => clearTimeout(timer);
  }, [loadPage, query]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || !hasMoreRef.current) {
      return;
    }
    void loadPage(false);
  }, [loadPage, loading, loadingMore]);

  const handleGifPress = useCallback(
    (gif: GiphyGif) => {
      triggerKeyHaptic();
      onSelect(gif);
    },
    [onSelect],
  );

  const renderRow: ListRenderItem<GifRow> = ({item: row, index: rowIndex}) => (
    <View style={styles.row}>
      {row.map(gif => {
        const previewUrl = getGifPreviewUrl(gif);
        return (
          <Pressable
            key={gif.id}
            onPress={() => {
              handleGifPress(gif);
            }}
            style={({pressed}) => [
              styles.cell,
              pressed && styles.cellPressed,
            ]}>
            {previewUrl ? (
              <Image
                source={{uri: previewUrl}}
                style={styles.preview}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.previewFallback} />
            )}
          </Pressable>
        );
      })}
      {row.length < GIF_COLUMNS
        ? Array.from({length: GIF_COLUMNS - row.length}).map((_, index) => (
            <View
              key={`gif-spacer-${rowIndex}-${index}`}
              style={styles.cell}
            />
          ))
        : null}
    </View>
  );

  return (
    <View style={[styles.container, {width, height}]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.icon} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.content}
          data={rows}
          keyExtractor={(_, rowIndex) => `gif-row-${rowIndex}`}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={theme.icon} />
              </View>
            ) : (
              <Text style={styles.attribution}>Powered by GIPHY</Text>
            )
          }
        />
      )}
    </View>
  );
}

function createGifCategoryGridStyles(theme: KeyboardTheme, panelHeight: number) {
  const rowHeight = Math.max(
    theme.keyHeight,
    Math.floor((panelHeight - 16) / 2.2),
  );

  return StyleSheet.create({
    container: {
      height: panelHeight,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 6,
      paddingTop: 2,
      gap: 6,
      paddingBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: rowHeight,
    },
    cell: {
      flex: 1,
      height: rowHeight,
      borderRadius: theme.keyRadius,
      overflow: 'hidden',
      backgroundColor: theme.letterKey,
    },
    cellPressed: {
      opacity: 0.75,
    },
    preview: {
      width: '100%',
      height: '100%',
    },
    previewFallback: {
      flex: 1,
      backgroundColor: theme.modifierKey,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    errorText: {
      color: theme.iconMuted,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      textAlign: 'center',
    },
    footer: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    attribution: {
      textAlign: 'center',
      color: theme.iconMuted,
      fontSize: 10,
      fontFamily: theme.fontFamily,
      paddingVertical: 8,
      opacity: 0.8,
    },
  });
}
