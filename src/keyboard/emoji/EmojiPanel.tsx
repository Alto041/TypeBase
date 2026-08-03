import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Dimensions, View} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {EmojiSearchGrid} from './EmojiSearchGrid';
import {createEmojiPanelShellStyles} from './emojiPanelLayout';
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
  const emojiScrollHeight = Math.max(120, Math.round(panelHeight));
  const shellStyles = useThemedStyles(themeValue =>
    createEmojiPanelShellStyles(themeValue, emojiScrollHeight),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(280, Math.round(Dimensions.get('window').width)),
  );
  const [recentEmojis, setRecentEmojis] = useState<readonly string[]>([]);
  const [recentEmojisVersion, setRecentEmojisVersion] = useState(0);

  const contentWidth = useMemo(
    () => Math.max(200, panelWidth - 16),
    [panelWidth],
  );

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

  const content =
    category === 'gif' ? (
      <GifCategoryGrid
        width={contentWidth}
        height={emojiScrollHeight}
        query={gifSearchQuery}
        onSelect={onGifSelect}
      />
    ) : category === 'sfx' ? (
      <SfxCategoryGrid
        width={contentWidth}
        height={emojiScrollHeight}
        query={sfxSearchQuery}
        onSelect={onSfxSelect}
        onPreview={onSfxPreview}
        installingId={installingSfxId}
      />
    ) : emojiSearchQuery.trim().length > 0 ? (
      <EmojiSearchGrid
        width={contentWidth}
        height={emojiScrollHeight}
        query={emojiSearchQuery}
        onSelect={handleEmojiSelect}
      />
    ) : (
      <EmojiCategoryGrid
        category={category}
        width={contentWidth}
        height={emojiScrollHeight}
        recentEmojis={recentEmojis}
        recentEmojisVersion={recentEmojisVersion}
        onSelect={handleEmojiSelect}
      />
    );

  return (
    <View
      style={shellStyles.outer}
      onLayout={event => {
        const width = Math.round(event.nativeEvent.layout.width);
        if (width > 0 && width !== panelWidth) {
          setPanelWidth(width);
        }
      }}>
      <View style={shellStyles.card}>{content}</View>
    </View>
  );
}
