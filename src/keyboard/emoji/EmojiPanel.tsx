import React, {useMemo, useState} from 'react';
import {Dimensions, View} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {EmojiSearchGrid} from './EmojiSearchGrid';
import {EmojiSubcategoryBar} from './EmojiSubcategoryBar';
import {createEmojiPanelShellStyles} from './emojiPanelLayout';
import {GifCategoryGrid} from './GifCategoryGrid';
import {SfxCategoryGrid} from './SfxCategoryGrid';
import {StickerCategoryGrid} from './StickerCategoryGrid';
import type {EmojiPanelTab, EmojiSubcategoryId} from './emojis';
import type {KeyboardSticker} from './stickers';
import type {GiphyGif} from './giphyService';
import type {MyInstantsSound} from './myinstantsService';

const SUBCATEGORY_BAR_HEIGHT = 38;

type EmojiPanelProps = {
  panelTab: EmojiPanelTab;
  emojiSubcategory: EmojiSubcategoryId;
  onEmojiSubcategorySelect: (subcategory: EmojiSubcategoryId) => void;
  emojiSearchQuery: string;
  panelHeight: number;
  onSelect: (emoji: string) => void;
  onGifSelect: (gif: GiphyGif) => void;
  onStickerSelect: (sticker: KeyboardSticker) => void;
  gifSearchQuery: string;
  sfxSearchQuery: string;
  onSfxSelect: (sound: MyInstantsSound) => void;
  onSfxPreview: (sound: MyInstantsSound) => void;
  installingSfxId?: string | null;
};

export function EmojiPanel({
  panelTab,
  emojiSubcategory,
  onEmojiSubcategorySelect,
  emojiSearchQuery,
  panelHeight,
  onSelect,
  onGifSelect,
  onStickerSelect,
  gifSearchQuery,
  sfxSearchQuery,
  onSfxSelect,
  onSfxPreview,
  installingSfxId = null,
}: EmojiPanelProps) {
  const showEmojiSubcategories =
    panelTab === 'emojis' && emojiSearchQuery.trim().length === 0;
  const emojiScrollHeight = Math.max(
    120,
    Math.round(
      panelHeight - (showEmojiSubcategories ? SUBCATEGORY_BAR_HEIGHT : 0),
    ),
  );
  const shellStyles = useThemedStyles(themeValue =>
    createEmojiPanelShellStyles(themeValue, panelHeight),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(280, Math.round(Dimensions.get('window').width)),
  );

  const contentWidth = useMemo(
    () => Math.max(200, panelWidth - 16),
    [panelWidth],
  );

  const content =
    panelTab === 'gif' ? (
      <GifCategoryGrid
        width={contentWidth}
        height={emojiScrollHeight}
        query={gifSearchQuery}
        onSelect={onGifSelect}
      />
    ) : panelTab === 'stickers' ? (
      <StickerCategoryGrid
        width={contentWidth}
        height={emojiScrollHeight}
        onSelect={onStickerSelect}
      />
    ) : panelTab === 'sfx' ? (
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
        onSelect={onSelect}
      />
    ) : (
      <EmojiCategoryGrid
        category={emojiSubcategory}
        width={contentWidth}
        height={emojiScrollHeight}
        onSelect={onSelect}
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
      <View style={shellStyles.card}>
        {showEmojiSubcategories ? (
          <EmojiSubcategoryBar
            selected={emojiSubcategory}
            onSelect={onEmojiSubcategorySelect}
          />
        ) : null}
        {content}
      </View>
    </View>
  );
}
