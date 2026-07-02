import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
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
import SpeakerIcon from '../../../assets/speaker.svg';
import {
  chunkSounds,
  fetchTrendingSounds,
  searchSounds,
  SFX_COLUMNS,
  type MyInstantsSound,
} from './myinstantsService';

type SfxCategoryGridProps = {
  width: number;
  height: number;
  query: string;
  onSelect: (sound: MyInstantsSound) => void;
  onPreview: (sound: MyInstantsSound) => void;
  installingId?: string | null;
};

type SfxRow = readonly MyInstantsSound[];

export function SfxCategoryGrid({
  width,
  height,
  query,
  onSelect,
  onPreview,
  installingId = null,
}: SfxCategoryGridProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(themeValue =>
    createSfxCategoryGridStyles(themeValue, height),
  );
  const [sounds, setSounds] = useState<MyInstantsSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const rows = useMemo(() => chunkSounds(sounds, SFX_COLUMNS), [sounds]);

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
      onPreview(sound);
    },
    [onPreview],
  );

  const renderRow: ListRenderItem<SfxRow> = ({item: row, index: rowIndex}) => (
    <View style={styles.row}>
      {row.map(sound => {
        const isInstalling = installingId === sound.id;
        return (
          <Pressable
            key={sound.id}
            onPress={() => {
              handleSoundPress(sound);
            }}
            disabled={Boolean(installingId)}
            style={({pressed}) => [
              styles.cell,
              pressed && !installingId && styles.cellPressed,
              installingId && !isInstalling && styles.cellDisabled,
            ]}>
            <Text style={styles.cellTitle} numberOfLines={2}>
              {sound.title}
            </Text>
            <View style={styles.cellFooter}>
              <Pressable
                onPress={() => {
                  handlePreviewPress(sound);
                }}
                hitSlop={8}
                style={({pressed}) => [
                  styles.previewButton,
                  pressed && styles.previewButtonPressed,
                ]}>
                <SpeakerIcon width={16} height={16} fill={theme.label} />
              </Pressable>
              {isInstalling ? (
                <ActivityIndicator color={theme.label} size="small" />
              ) : (
                <Text style={styles.cellHint}>Tap to send</Text>
              )}
            </View>
          </Pressable>
        );
      })}
      {row.length < SFX_COLUMNS
        ? Array.from({length: SFX_COLUMNS - row.length}).map((_, index) => (
            <View
              key={`sfx-spacer-${rowIndex}-${index}`}
              style={styles.cellSpacer}
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
      ) : sounds.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No sounds found</Text>
        </View>
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.content}
          data={rows}
          keyExtractor={(_, rowIndex) => `sfx-row-${rowIndex}`}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Text style={styles.attribution}>
              Sounds via{' '}
              <Text style={styles.attributionLink}>MyInstants</Text>
            </Text>
          }
        />
      )}
    </View>
  );
}

function createSfxCategoryGridStyles(theme: KeyboardTheme, panelHeight: number) {
  return StyleSheet.create({
    container: {
      height: panelHeight,
      overflow: 'hidden',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 8,
    },
    row: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
    },
    cell: {
      flex: 1,
      minHeight: 72,
      borderRadius: 10,
      backgroundColor: theme.modifierKey,
      paddingHorizontal: 10,
      paddingVertical: 10,
      justifyContent: 'space-between',
    },
    cellPressed: {
      opacity: 0.82,
    },
    cellDisabled: {
      opacity: 0.55,
    },
    cellSpacer: {
      flex: 1,
    },
    cellTitle: {
      fontFamily: 'Geist',
      fontSize: 13,
      lineHeight: 16,
      color: theme.label,
      letterSpacing: -0.3,
    },
    cellFooter: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    previewButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.letterKey,
    },
    previewButtonPressed: {
      opacity: 0.7,
    },
    cellHint: {
      fontFamily: 'Inter',
      fontSize: 11,
      color: theme.icon,
      opacity: 0.7,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    errorText: {
      fontFamily: 'Inter',
      fontSize: 13,
      color: theme.icon,
      textAlign: 'center',
    },
    emptyText: {
      fontFamily: 'Inter',
      fontSize: 13,
      color: theme.icon,
      textAlign: 'center',
    },
    attribution: {
      marginTop: 4,
      marginBottom: 6,
      textAlign: 'center',
      fontFamily: 'Inter',
      fontSize: 11,
      color: theme.icon,
      opacity: 0.65,
    },
    attributionLink: {
      fontFamily: 'Inter',
      color: theme.label,
    },
  });
}
