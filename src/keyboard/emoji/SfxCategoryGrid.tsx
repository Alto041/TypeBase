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
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import {
  fetchTrendingSounds,
  searchSounds,
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

  const renderSound: ListRenderItem<MyInstantsSound> = ({item: sound}) => {
    const isInstalling = installingId === sound.id;

    return (
      <View
        style={[
          styles.row,
          isInstalling && styles.rowDisabled,
        ]}>
        <Pressable
          onPress={() => {
            handlePreviewPress(sound);
          }}
          hitSlop={10}
          style={({pressed}) => [
            styles.playButton,
            pressed && styles.playButtonPressed,
          ]}>
          <Text style={styles.playSymbol}>▶</Text>
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
        ) : null}
      </View>
    );
  };

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
          data={sounds}
          keyExtractor={item => item.id}
          renderItem={renderSound}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.letterKey,
      gap: 10,
    },
    rowDisabled: {
      opacity: 0.6,
    },
    playButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.modifierKey,
    },
    playButtonPressed: {
      opacity: 0.65,
    },
    playSymbol: {
      color: theme.label,
      fontSize: 15,
      marginLeft: 1,
    },
    titleArea: {
      flex: 1,
      paddingVertical: 2,
    },
    titleAreaPressed: {
      opacity: 0.7,
    },
    title: {
      fontFamily: 'Geist',
      fontSize: 15,
      lineHeight: 20,
      color: theme.label,
      letterSpacing: -0.2,
    },
    separator: {
      height: 6,
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
      marginTop: 8,
      marginBottom: 4,
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
