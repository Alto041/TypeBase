import React, {useMemo, useState} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import {PremiumUpsellSheet} from '../components/PremiumUpsellSheet';
import {useThemedStyles} from '../KeyboardThemeContext';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {EmojiSearchGrid} from './EmojiSearchGrid';
import {EmojiSubcategoryBar} from './EmojiSubcategoryBar';
import {createEmojiPanelShellStyles} from './emojiPanelLayout';
import {GifCategoryGrid} from './GifCategoryGrid';
import {SfxCategoryGrid} from './SfxCategoryGrid';
import {StickerCategoryGrid} from './StickerCategoryGrid';
import {getContextPrefaceEmojis} from './subtoneEngine';
import type {EmojiPanelTab, EmojiSubcategoryId} from './emojis';
import type {StickerLySticker} from './stickers';
import type {GiphyGif} from './giphyService';
import type {MyInstantsSound} from './myinstantsService';

const SUBCATEGORY_BAR_HEIGHT = 38;

type EmojiPanelProps = {
  panelTab: EmojiPanelTab;
  emojiSubcategory: EmojiSubcategoryId;
  onEmojiSubcategorySelect: (subcategory: EmojiSubcategoryId) => void;
  emojiSearchQuery: string;
  emojiSearchActive?: boolean;
  panelHeight: number;
  onSelect: (emoji: string) => void;
  onGifSelect: (gif: GiphyGif) => void;
  onStickerSelect: (sticker: StickerLySticker) => void;
  gifSearchQuery: string;
  sfxSearchQuery: string;
  onSfxSelect: (sound: MyInstantsSound) => void;
  onSfxPreview: (sound: MyInstantsSound) => void;
  installingSfxId?: string | null;
  stickersLocked?: boolean;
  sfxLocked?: boolean;
  showUpsell?: boolean;
  onLockedPress?: () => void;
  onDismissUpsell?: () => void;
  /** Text before cursor — context emojis prepend the grid when non-empty. */
  contextSnippet?: string;
};

export function EmojiPanel({
  panelTab,
  emojiSubcategory,
  onEmojiSubcategorySelect,
  emojiSearchQuery,
  emojiSearchActive = false,
  panelHeight,
  onSelect,
  onGifSelect,
  onStickerSelect,
  gifSearchQuery,
  sfxSearchQuery,
  onSfxSelect,
  onSfxPreview,
  installingSfxId = null,
  stickersLocked = false,
  sfxLocked = false,
  showUpsell = false,
  onLockedPress,
  onDismissUpsell,
  contextSnippet = '',
}: EmojiPanelProps) {
  const showEmojiSubcategories =
    panelTab === 'emojis' &&
    !emojiSearchActive &&
    emojiSearchQuery.trim().length === 0;
  const showEmojiSearch =
    panelTab === 'emojis' &&
    (emojiSearchActive || emojiSearchQuery.trim().length > 0);
  const contextPrefaceEmojis = useMemo(
    () => getContextPrefaceEmojis(contextSnippet),
    [contextSnippet],
  );
  const emojiScrollHeight = Math.max(
    120,
    Math.round(
      panelHeight - (panelTab === 'emojis' ? SUBCATEGORY_BAR_HEIGHT : 0),
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
  const isLockedTab =
    (panelTab === 'stickers' && stickersLocked) ||
    (panelTab === 'sfx' && sfxLocked);
  const upsellTitle =
    panelTab === 'stickers'
      ? 'Premium stickers'
      : panelTab === 'sfx'
        ? 'Premium sound effects'
        : 'Premium feature';
  const upsellBody =
    panelTab === 'stickers'
      ? 'Unlock TypeBase to send stickers.'
      : panelTab === 'sfx'
        ? 'Unlock TypeBase to send sound effects.'
        : 'Unlock TypeBase to use this.';

  const handleStickerSelect = (sticker: StickerLySticker) => {
    if (stickersLocked) {
      onLockedPress?.();
      return;
    }
    onStickerSelect(sticker);
  };

  const handleSfxSelect = (sound: MyInstantsSound) => {
    if (sfxLocked) {
      onLockedPress?.();
      return;
    }
    onSfxSelect(sound);
  };

  const handleSfxPreview = (sound: MyInstantsSound) => {
    if (sfxLocked) {
      onLockedPress?.();
      return;
    }
    onSfxPreview(sound);
  };

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
        onSelect={handleStickerSelect}
      />
    ) : panelTab === 'sfx' ? (
      <SfxCategoryGrid
        width={contentWidth}
        height={emojiScrollHeight}
        query={sfxSearchQuery}
        onSelect={handleSfxSelect}
        onPreview={handleSfxPreview}
        installingId={installingSfxId}
        locked={sfxLocked}
      />
    ) : showEmojiSearch ? (
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
        contextPrefaceEmojis={contextPrefaceEmojis}
        onSelect={onSelect}
      />
    );

  return (
    <View
      style={[shellStyles.outer, styles.container]}
      onLayout={event => {
        const width = Math.round(event.nativeEvent.layout.width);
        if (width > 0 && width !== panelWidth) {
          setPanelWidth(width);
        }
      }}>
      <View style={shellStyles.card}>
        {panelTab === 'emojis' ? (
          showEmojiSubcategories ? (
            <EmojiSubcategoryBar
              selected={emojiSubcategory}
              onSelect={onEmojiSubcategorySelect}
            />
          ) : (
            <View style={styles.subcategorySpacer} />
          )
        ) : null}
        <View style={[styles.contentHost, isLockedTab && styles.lockedContent]}>
          {content}
        </View>
      </View>
      {showUpsell && isLockedTab ? (
        <PremiumUpsellSheet
          placement="panel"
          title={upsellTitle}
          body={upsellBody}
          onDismiss={onDismissUpsell ?? (() => {})}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  subcategorySpacer: {
    height: SUBCATEGORY_BAR_HEIGHT,
  },
  contentHost: {
    flex: 1,
  },
  lockedContent: {
    opacity: 0.72,
  },
});
