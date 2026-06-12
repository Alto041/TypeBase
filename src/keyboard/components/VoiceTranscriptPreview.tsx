import React, {useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import {useThemedStyles} from '../KeyboardThemeContext';
import {VOICE_PREVIEW_MAX_WORDS} from '../voice/voiceTranscriptPreview';
import type {KeyboardTheme} from '../theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type VoiceTranscriptPreviewProps = {
  transcript: string;
  maxWords?: number;
};

function wordOpacity(index: number, total: number): number {
  if (total <= 1) {
    return 1;
  }

  const minOpacity = 0.22;
  return minOpacity + ((1 - minOpacity) * index) / (total - 1);
}

export function VoiceTranscriptPreview({
  transcript,
  maxWords = VOICE_PREVIEW_MAX_WORDS,
}: VoiceTranscriptPreviewProps) {
  const styles = useThemedStyles(createVoiceTranscriptPreviewStyles);
  const words = useMemo(() => {
    const all = transcript.trim().split(/\s+/).filter(Boolean);
    return all.slice(-maxWords);
  }, [maxWords, transcript]);

  const previousWordsKeyRef = useRef('');
  const fadeIns = useRef<Animated.Value[]>([]).current;

  while (fadeIns.length < words.length) {
    fadeIns.push(new Animated.Value(1));
  }

  useEffect(() => {
    const nextKey = words.join('\u0001');
    if (nextKey === previousWordsKeyRef.current) {
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const previousWords = previousWordsKeyRef.current
      ? previousWordsKeyRef.current.split('\u0001')
      : [];

    words.forEach((word, index) => {
      const anim = fadeIns[index];
      const isNew =
        index >= previousWords.length || previousWords[index] !== word;

      if (isNew) {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      } else {
        anim.setValue(1);
      }
    });

    previousWordsKeyRef.current = nextKey;
  }, [fadeIns, words]);

  if (words.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {words.map((word, index) => {
        const baseOpacity = wordOpacity(index, words.length);

        return (
          <Animated.Text
            key={`${index}-${word}`}
            style={[
              styles.word,
              {
                opacity: fadeIns[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, baseOpacity],
                }),
              },
            ]}
            numberOfLines={1}>
            {index > 0 ? ' ' : ''}
            {word}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function createVoiceTranscriptPreviewStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 4,
      overflow: 'hidden',
    },
    word: {
      color: theme.spaceLabel,
      fontSize: 17,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
      flexShrink: 1,
    },
  });
}
