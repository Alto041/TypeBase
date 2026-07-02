import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {EmojiSearchGrid} from './EmojiSearchGrid';
import {GifCategoryGrid} from './GifCategoryGrid';
import {SfxCategoryGrid} from './SfxCategoryGrid';
import type {EmojiCategoryId} from './emojis';
import type {GiphyGif} from './giphyService';
import type {MyInstantsSound} from './myinstantsService';
import {
  ensureRecentEmojisLoaded,
  getRecentEmojis,
  getRecentEmojisVersion,
  touchRecentEmoji,
} from './recentEmojisStore';

type EmojiPanelProps = {
  category: EmojiCategoryId;
  emojiSearchQuery: string;
  panelHeight: number;
  onSelect: (emoji: string) => void;
  onGifSelect: (gif: GiphyGif) => void;
  gifSearchQuery: string;
  sfxSearchQuery: string;
  onSfxSelect: (sound: MyInstantsSound) => void;
  onSfxPreview: (sound: MyInstantsSound) => void;
  installingSfxId?: string | null;
};

export function EmojiPanel({
  category,
  emojiSearchQuery,
  panelHeight,
  onSelect,
  onGifSelect,
  gifSearchQuery,
  sfxSearchQuery,
  onSfxSelect,
  onSfxPreview,
  installingSfxId = null,
}: EmojiPanelProps) {
  const theme = useKeyboardTheme();
  const emojiScrollHeight = Math.max(120, Math.round(panelHeight));
  const styles = useMemo(
    () => createEmojiPanelStyles(theme, emojiScrollHeight),
    [theme, emojiScrollHeight],
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(280, Math.round(Dimensions.get('window').width)),
  );
  const [recentEmojis, setRecentEmojis] = useState<readonly string[]>([]);
  const [recentEmojisVersion, setRecentEmojisVersion] = useState(0);

  const reloadRecents = useCallback(() => {
    void ensureRecentEmojisLoaded().then(() => {
      setRecentEmojis(getRecentEmojis());
      setRecentEmojisVersion(getRecentEmojisVersion());
    });
  }, []);

  useEffect(() => {
    reloadRecents();
  }, [reloadRecents, category]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      const next = touchRecentEmoji(emoji);
      if (next) {
        setRecentEmojis(next);
        setRecentEmojisVersion(getRecentEmojisVersion());
      }
    },
    [onSelect],
  );

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const width = Math.round(event.nativeEvent.layout.width);
        if (width > 0 && width !== panelWidth) {
          setPanelWidth(width);
        }
      }}>
      {category === 'gif' ? (
        <GifCategoryGrid
          width={panelWidth}
          height={emojiScrollHeight}
          query={gifSearchQuery}
          onSelect={onGifSelect}
        />
      ) : category === 'sfx' ? (
        <SfxCategoryGrid
          width={panelWidth}
          height={emojiScrollHeight}
          query={sfxSearchQuery}
          onSelect={onSfxSelect}
          onPreview={onSfxPreview}
          installingId={installingSfxId}
        />
      ) : emojiSearchQuery.trim().length > 0 ? (
        <EmojiSearchGrid
          width={panelWidth}
          height={emojiScrollHeight}
          query={emojiSearchQuery}
          onSelect={handleEmojiSelect}
        />
      ) : (
        <EmojiCategoryGrid
          category={category}
          width={panelWidth}
          height={emojiScrollHeight}
          recentEmojis={recentEmojis}
          recentEmojisVersion={recentEmojisVersion}
          onSelect={handleEmojiSelect}
        />
      )}
    </View>
  );
}

function createEmojiPanelStyles(
  theme: KeyboardTheme,
  emojiScrollHeight: number,
) {
  return StyleSheet.create({
    container: {
      height: emojiScrollHeight,
      marginBottom: theme.emojiPanelGap,
      overflow: 'hidden',
    },
  });
}
