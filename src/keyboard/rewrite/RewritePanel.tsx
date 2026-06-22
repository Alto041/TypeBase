import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  PLUGIN_PANEL_HEIGHT,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyboardTheme} from '../theme';
import {rewriteText} from './geminiRewriteService';
import {DEFAULT_REWRITE_TONE, REWRITE_TONES, type RewriteTone} from './rewriteTones';

const FADE_HEIGHT = Math.round(PLUGIN_PANEL_HEIGHT * 0.52);
const FIELD_SNIPPET_LENGTH = 600;

export function RewritePanel() {
  const [sourceText, setSourceText] = useState('');
  const [sourceReplaceLength, setSourceReplaceLength] = useState(0);
  const [toneId, setToneId] = useState(DEFAULT_REWRITE_TONE);
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const sourceTextRef = useRef('');

  const runRewrite = useCallback(async (input: string, nextToneId: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setRewritten(null);

    try {
      const result = await rewriteText(input, nextToneId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setRewritten(result.rewritten);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Rewrite failed');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const syncSourceFromField = useCallback(async () => {
    const beforeCursor = await keyboardBridge.getTextBeforeCursor(
      FIELD_SNIPPET_LENGTH,
    );
    requestIdRef.current += 1;
    sourceTextRef.current = beforeCursor;
    setSourceText(beforeCursor);
    setSourceReplaceLength(beforeCursor.length);
    setRewritten(null);
    setError(null);
    setLoading(false);
  }, []);

  const loadSourceText = useCallback(async () => {
    const beforeCursor = await keyboardBridge.getTextBeforeCursor(
      FIELD_SNIPPET_LENGTH,
    );
    requestIdRef.current += 1;
    sourceTextRef.current = beforeCursor;
    setSourceText(beforeCursor);
    setSourceReplaceLength(beforeCursor.length);
    setLoading(false);
    setRewritten(null);
    setError(null);
  }, []);

  useEffect(() => {
    void loadSourceText();
  }, [loadSourceText]);

  const handleToneSelect = useCallback(
    (tone: RewriteTone) => {
      triggerKeyHaptic();
      setToneId(tone.id);
      setError(null);

      void (async () => {
        let input = sourceTextRef.current.trim();
        if (!input) {
          const beforeCursor = await keyboardBridge.getTextBeforeCursor(
            FIELD_SNIPPET_LENGTH,
          );
          sourceTextRef.current = beforeCursor;
          setSourceText(beforeCursor);
          setSourceReplaceLength(beforeCursor.length);
          input = beforeCursor.trim();
        }

        if (input) {
          await runRewrite(input, tone.id);
        }
      })();
    },
    [runRewrite],
  );

  const handleReplace = useCallback(() => {
    if (!rewritten || sourceReplaceLength <= 0) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.replaceWordPrefix(sourceReplaceLength, rewritten);
    void syncSourceFromField();
  }, [rewritten, sourceReplaceLength, syncSourceFromField]);

  const handleInsert = useCallback(() => {
    if (!rewritten) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.insertText(rewritten);
  }, [rewritten]);

  const hasResult = Boolean(rewritten);
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createRewriteStyles);

  return (
    <View style={panelStyles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toneRowContent}
          nestedScrollEnabled>
          {REWRITE_TONES.map(tone => {
            const selected = tone.id === toneId;
            return (
              <Pressable
                key={tone.id}
                onPressIn={() => handleToneSelect(tone)}
                style={({pressed}) => [
                  styles.toneChip,
                  selected && styles.toneChipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.toneChipText,
                    selected && styles.toneChipTextSelected,
                  ]}>
                  {tone.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => {
            triggerKeyHaptic();
            void loadSourceText();
          }}
          style={({pressed}) => [
            styles.sourceCard,
            pressed && styles.pressed,
          ]}>
          <View style={styles.sourceRow}>
            {sourceText.trim() ? (
              <Text style={styles.sourceText} numberOfLines={3}>
                {sourceText.trim()}
              </Text>
            ) : (
              <Text style={styles.placeholder}>
                Type text, then tap here to refresh
              </Text>
            )}
            {loading ? (
              <ActivityIndicator color={theme.label} size="small" />
            ) : (
              <Text style={styles.refreshHint}>↻</Text>
            )}
          </View>
        </Pressable>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : hasResult ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Rewritten</Text>
              <View style={styles.resultActions}>
                <Pressable
                  onPress={handleReplace}
                  disabled={sourceReplaceLength <= 0}
                  hitSlop={6}
                  style={({pressed}) => [
                    pressed &&
                      sourceReplaceLength > 0 &&
                      styles.actionPressed,
                    sourceReplaceLength <= 0 && styles.actionDisabled,
                  ]}>
                  <Text style={styles.actionPrimary}>Replace</Text>
                </Pressable>
                <Text style={styles.actionSep}>·</Text>
                <Pressable
                  onPress={handleInsert}
                  hitSlop={6}
                  style={({pressed}) => [
                    pressed && styles.actionPressed,
                  ]}>
                  <Text style={styles.actionSecondary}>Insert</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.resultText}>{rewritten}</Text>
          </View>
        ) : loading ? (
          <Text style={styles.placeholder}>Rewriting…</Text>
        ) : sourceText.trim() ? (
          <Text style={styles.placeholder}>Choose a tone to rewrite.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="rewriteSmoke" x1="0" y1="1" x2="0" y2="0">
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
            fill="url(#rewriteSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createRewriteStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: FADE_HEIGHT + 12,
      gap: 8,
    },
    toneRowContent: {
      gap: 6,
      paddingRight: 4,
    },
    toneChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.pluginCard,
    },
    toneChipSelected: {
      backgroundColor: theme.essentialsAccent,
    },
    toneChipText: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    toneChipTextSelected: {
      color: theme.label,
    },
    sourceCard: {
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 8,
      justifyContent: 'center',
    },
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sourceText: {
      flex: 1,
      color: theme.spaceLabel,
      fontSize: 14,
      fontFamily: theme.fontFamily,
      lineHeight: 19,
    },
    refreshHint: {
      color: theme.spaceLabel,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    resultCard: {
      borderRadius: 10,
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    resultLabel: {
      flex: 1,
      color: theme.spaceLabel,
      fontSize: 11,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    resultActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionPrimary: {
      color: theme.label,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    actionSecondary: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
    },
    actionSep: {
      color: theme.suggestionDivider,
      fontSize: 13,
      lineHeight: 13,
    },
    actionPressed: {
      opacity: 0.65,
    },
    actionDisabled: {
      opacity: 0.35,
    },
    resultText: {
      color: theme.label,
      fontSize: 16,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      lineHeight: 22,
    },
    placeholder: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      lineHeight: 18,
    },
    errorText: {
      color: '#FF8A8A',
      fontSize: 13,
      fontFamily: theme.fontFamily,
      lineHeight: 18,
    },
    pressed: {
      opacity: 0.85,
    },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: FADE_HEIGHT,
    },
  });
}
