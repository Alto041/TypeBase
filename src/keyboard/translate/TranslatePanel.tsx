import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import {translateText} from './geminiTranslateService';
import {
  DEFAULT_TARGET_LANGUAGE,
  TARGET_LANGUAGES,
  type TargetLanguage,
} from './languages';

type TranslatePanelProps = {
  onResultChange?: (result: string | null) => void;
};

const FADE_HEIGHT = Math.round(PLUGIN_PANEL_HEIGHT * 0.52);
const FIELD_SNIPPET_LENGTH = 600;

export function TranslatePanel({onResultChange}: TranslatePanelProps) {
  const [sourceText, setSourceText] = useState('');
  const [sourceReplaceLength, setSourceReplaceLength] = useState(0);
  const [targetCode, setTargetCode] = useState(DEFAULT_TARGET_LANGUAGE);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const targetLanguage = useMemo(
    () =>
      TARGET_LANGUAGES.find(language => language.code === targetCode)?.label ??
      'English',
    [targetCode],
  );

  const runTranslate = useCallback(async (input: string, language: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setTranslation(null);
    setDetectedLanguage(null);

    try {
      const result = await translateText(input, language);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setDetectedLanguage(result.detectedLanguage);
      setTranslation(result.translation);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Translation failed');
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
    setSourceText(beforeCursor);
    setSourceReplaceLength(beforeCursor.length);
    setTranslation(null);
    setDetectedLanguage(null);
    setError(null);
    setLoading(false);
  }, []);

  const loadSourceText = useCallback(
    async (language = targetLanguage) => {
      const beforeCursor = await keyboardBridge.getTextBeforeCursor(
        FIELD_SNIPPET_LENGTH,
      );
      setSourceText(beforeCursor);
      setSourceReplaceLength(beforeCursor.length);

      const input = beforeCursor.trim();
      if (input) {
        await runTranslate(input, language);
      } else {
        requestIdRef.current += 1;
        setLoading(false);
        setTranslation(null);
        setDetectedLanguage(null);
        setError(null);
      }
    },
    [runTranslate, targetLanguage],
  );

  useEffect(() => {
    void loadSourceText();
  }, [loadSourceText]);

  useEffect(() => {
    onResultChange?.(translation);
  }, [onResultChange, translation]);

  const handleTargetSelect = useCallback(
    (language: TargetLanguage) => {
      triggerKeyHaptic();
      setTargetCode(language.code);
      setError(null);
      const input = sourceText.trim();
      if (input) {
        void runTranslate(input, language.label);
      }
    },
    [runTranslate, sourceText],
  );

  const handleReplace = useCallback(() => {
    if (!translation || sourceReplaceLength <= 0) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.replaceWordPrefix(sourceReplaceLength, translation);
    void syncSourceFromField();
  }, [sourceReplaceLength, syncSourceFromField, translation]);

  const handleInsert = useCallback(() => {
    if (!translation) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.insertText(translation);
  }, [translation]);

  const hasResult = Boolean(translation);
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createTranslateStyles);

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
          contentContainerStyle={styles.languageRowContent}
          nestedScrollEnabled>
          {TARGET_LANGUAGES.map(language => {
            const selected = language.code === targetCode;
            return (
              <Pressable
                key={language.code}
                onPress={() => handleTargetSelect(language)}
                style={({pressed}) => [
                  styles.languageChip,
                  selected && styles.languageChipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.languageChipText,
                    selected && styles.languageChipTextSelected,
                  ]}>
                  {language.label}
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
              {detectedLanguage ? (
                <Text style={styles.detectedHint}>From {detectedLanguage}</Text>
              ) : (
                <View />
              )}
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
            <Text style={styles.resultText}>{translation}</Text>
          </View>
        ) : loading ? (
          <Text style={styles.placeholder}>Translating…</Text>
        ) : null}
      </ScrollView>

      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="translateSmoke" x1="0" y1="1" x2="0" y2="0">
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
            fill="url(#translateSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createTranslateStyles(theme: KeyboardTheme) {
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
    languageRowContent: {
      gap: 6,
      paddingRight: 4,
    },
    languageChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.pluginCard,
    },
    languageChipSelected: {
      backgroundColor: theme.chipSelectedBackground,
    },
    languageChipText: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    languageChipTextSelected: {
      color: theme.chipSelectedText,
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
    detectedHint: {
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
