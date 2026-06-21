import React, {useMemo, useState} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {EmojiCategoryGrid} from './EmojiCategoryGrid';
import {GifCategoryGrid} from './GifCategoryGrid';
import type {EmojiCategoryId} from './emojis';
import type {GiphyGif} from './giphyService';

type EmojiPanelProps = {
  category: EmojiCategoryId;
  onSelect: (emoji: string) => void;
  onGifSelect: (gif: GiphyGif) => void;
  gifSearchQuery: string;
};

export function EmojiPanel({
  category,
  onSelect,
  onGifSelect,
  gifSearchQuery,
}: EmojiPanelProps) {
  const theme = useKeyboardTheme();
  const emojiScrollHeight = theme.emojiPanelHeight - theme.emojiPanelGap;
  const emojiFadeHeight = Math.round(emojiScrollHeight * 0.52);
  const styles = useMemo(
    () => createEmojiPanelStyles(theme, emojiScrollHeight, emojiFadeHeight),
    [theme, emojiScrollHeight, emojiFadeHeight],
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(280, Math.round(Dimensions.get('window').width)),
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
      ) : (
        <EmojiCategoryGrid
          category={category}
          width={panelWidth}
          onSelect={onSelect}
        />
      )}
      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="emojiSmoke" x1="0" y1="1" x2="0" y2="0">
              <Stop
                offset="0"
                stopColor={theme.container}
                stopOpacity="1"
              />
              <Stop
                offset="0.5"
                stopColor={theme.container}
                stopOpacity="0.4"
              />
              <Stop
                offset="1"
                stopColor={theme.container}
                stopOpacity="0"
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#emojiSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createEmojiPanelStyles(
  theme: KeyboardTheme,
  emojiScrollHeight: number,
  emojiFadeHeight: number,
) {
  return StyleSheet.create({
    container: {
      height: emojiScrollHeight,
      marginBottom: theme.emojiPanelGap,
      overflow: 'hidden',
    },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: emojiFadeHeight,
    },
  });
}
