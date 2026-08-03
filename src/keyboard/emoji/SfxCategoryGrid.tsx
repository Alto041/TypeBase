import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PauseIcon from '../../../assets/pause.svg';
import PlayIcon from '../../../assets/play.svg';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {keyboardTypefaceStyle} from '../theme';
import {
  createEmojiPanelSharedStyles,
  getStackedTileRadius,
  SFX_TILE_GAP,
} from './emojiPanelLayout';
import {
  fetchTrendingSounds,
  searchSounds,
  type MyInstantsSound,
} from './myinstantsService';
import {stopSfxPreview} from './sfxInsert';

type SfxCategoryGridProps = {
  width: number;
  height: number;
  query: string;
  onSelect: (sound: MyInstantsSound) => void;
  onPreview: (sound: MyInstantsSound) => void;
  installingId?: string | null;
};

export function SfxCategoryGrid({
  width,
  height,
  query,
  onSelect,
  onPreview,
  installingId = null,
}: SfxCategoryGridProps) {
  const theme = useKeyboardTheme();
  const sharedStyles = useThemedStyles(createEmojiPanelSharedStyles);
  const styles = useThemedStyles(themeValue =>
    createSfxCategoryGridStyles(themeValue),
  );
  const [sounds, setSounds] = useState<MyInstantsSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const sectionTitle = query.trim().length > 0 ? 'Search results' : 'Trending sounds';

  const loadSounds = useCallback(async (searchQuery: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const next =
        searchQuery.trim().length > 0
          ? await searchSounds(searchQuery)
          : await fetchTrendingSounds();

      if (requestId !== requestIdRef.current) {
        return;
      }
      setSounds(next);
      setError(null);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSounds([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load sounds',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSounds(query);
    }, query.trim() ? 300 : 0);

    return () => clearTimeout(timer);
  }, [loadSounds, query]);

  useEffect(() => {
    return () => {
      stopSfxPreview();
    };
  }, []);

  useEffect(() => {
    if (previewingId != null && !sounds.some(s => s.id === previewingId)) {
      setPreviewingId(null);
    }
  }, [sounds, previewingId]);

  const handleSoundPress = useCallback(
    (sound: MyInstantsSound) => {
      if (installingId) {
        return;
      }
      triggerKeyHaptic();
      onSelect(sound);
    },
    [installingId, onSelect],
  );

  const handlePreviewPress = useCallback(
    (sound: MyInstantsSound) => {
      triggerKeyHaptic();
      if (previewingId === sound.id) {
        setPreviewingId(null);
        stopSfxPreview();
      } else {
        setPreviewingId(sound.id);
        onPreview(sound);
      }
    },
    [previewingId, onPreview],
  );

  const renderSound: ListRenderItem<MyInstantsSound> = ({item: sound, index}) => {
    const isInstalling = installingId === sound.id;
    const isPreviewing = previewingId === sound.id;
    const tileStyle = getStackedTileRadius(index, sounds.length);

    return (
      <View
        style={[
          styles.row,
          tileStyle,
          isInstalling && styles.rowDisabled,
          isPreviewing && styles.rowPreviewing,
        ]}>
        <Pressable
          onPress={() => {
            handlePreviewPress(sound);
          }}
          hitSlop={8}
          style={({pressed}) => [
            styles.playButton,
            pressed && styles.playButtonPressed,
            isPreviewing && styles.playButtonActive,
          ]}>
          {isPreviewing ? (
            <PauseIcon width={15} height={15} color={theme.label} />
          ) : (
            <PlayIcon width={15} height={15} color={theme.label} />
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            handleSoundPress(sound);
          }}
          disabled={Boolean(installingId)}
          style={({pressed}) => [
            styles.titleArea,
            pressed && !installingId && styles.titleAreaPressed,
          ]}>
          <Text style={styles.title} numberOfLines={1}>
            {sound.title}
          </Text>
        </Pressable>

        {isInstalling ? (
          <ActivityIndicator color={theme.label} size="small" />
        ) : (
          <Text style={styles.insertHint}>›</Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, {width, height}]}>
      {loading ? (
        <View style={sharedStyles.centeredLoader}>
          <ActivityIndicator color={theme.icon} />
        </View>
      ) : error ? (
        <View style={sharedStyles.centeredLoader}>
          <Text style={sharedStyles.emptyTitle}>Could not load sounds</Text>
          <Text style={sharedStyles.errorText}>{error}</Text>
        </View>
      ) : sounds.length === 0 ? (
        <View style={sharedStyles.centeredLoader}>
          <Text style={sharedStyles.emptyTitle}>No sounds found</Text>
          <Text style={sharedStyles.emptyHint}>
            Try another keyword or browse trending sounds.
          </Text>
        </View>
      ) : (
        <>
          <View style={sharedStyles.sectionHeader}>
            <Text style={sharedStyles.sectionHeaderText}>{sectionTitle}</Text>
          </View>
          <FlatList
            style={styles.scroll}
            contentContainerStyle={styles.content}
            data={sounds}
            keyExtractor={item => item.id}
            renderItem={renderSound}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListFooterComponent={
              <Text style={sharedStyles.attribution}>
                Sounds via MyInstants
              </Text>
            }
          />
        </>
      )}
    </View>
  );
}

function createSfxCategoryGridStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 11,
      backgroundColor: theme.pluginCardSecondary,
      gap: 10,
    },
    rowDisabled: {
      opacity: 0.6,
    },
    rowPreviewing: {
      backgroundColor: theme.modifierKeyPressed,
    },
    playButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.modifierKey,
    },
    playButtonActive: {
      backgroundColor: theme.letterKey,
    },
    playButtonPressed: {
      opacity: 0.7,
    },
    titleArea: {
      flex: 1,
      paddingVertical: 2,
    },
    titleAreaPressed: {
      opacity: 0.7,
    },
    title: {
      ...keyboardTypefaceStyle(theme, '500'),
      fontSize: 15,
      lineHeight: 20,
      color: theme.label,
      letterSpacing: -0.2,
    },
    insertHint: {
      width: 22,
      textAlign: 'center',
      fontSize: 20,
      lineHeight: 22,
      color: theme.iconMuted,
      opacity: 0.7,
    },
    separator: {
      height: SFX_TILE_GAP,
    },
  });
}
