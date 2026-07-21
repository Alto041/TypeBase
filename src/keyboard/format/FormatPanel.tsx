import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  getPluginMenuFadeHeight,
  usePluginPanelStyles,
} from '../components/pluginPanelLayout';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyboardTheme} from '../theme';
import {FORMAT_FOLLOW_UPS} from './formatFollowUps';
import {formatText} from './geminiFormatService';
import {
  beginFormatSession,
  clearFormatSession,
  getFormatSession,
  recordFormatTurn,
  updateFormatSessionFormat,
} from './formatSessionStore';
import {
  FORMAT_TYPES,
  getFormatType,
  type FormatType,
} from './formatTypes';

const FIELD_SNIPPET_LENGTH = 2000;

export function FormatPanel() {
  const [sourceText, setSourceText] = useState('');
  const [sourceReplaceLength, setSourceReplaceLength] = useState(0);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [formatted, setFormatted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const formattedRef = useRef<string | null>(null);
  formattedRef.current = formatted;

  const runFormat = useCallback(
    async (input: string, nextFormatId: string, replaceSession: boolean) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setFormatted(null);

      try {
        if (replaceSession || !getFormatSession()) {
          beginFormatSession(input, nextFormatId);
        } else {
          updateFormatSessionFormat(nextFormatId);
        }

        const format = getFormatType(nextFormatId);
        const result = await formatText({
          sourceText: input,
          formatId: nextFormatId,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        recordFormatTurn('user', `Format as ${format.label}`);
        recordFormatTurn('model', result.formatted);
        setFormatted(result.formatted);
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Format failed');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const runFollowUp = useCallback(
    async (label: string, followUpInstruction: string) => {
      const currentOutput = formattedRef.current?.trim();
      if (!currentOutput) {
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const session = getFormatSession();
        const result = await formatText({
          sourceText: session?.sourceText ?? sourceText,
          formatId: session?.formatId ?? formatId,
          session,
          followUpInstruction,
          currentOutput,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        recordFormatTurn('user', label);
        recordFormatTurn('model', result.formatted);
        setFormatted(result.formatted);
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Format failed');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [formatId, sourceText],
  );

  const syncSourceFromField = useCallback(async () => {
    const beforeCursor = await keyboardBridge.getTextBeforeCursor(
      FIELD_SNIPPET_LENGTH,
    );
    requestIdRef.current += 1;
    clearFormatSession();
    setSourceText(beforeCursor);
    setSourceReplaceLength(beforeCursor.length);
    setFormatted(null);
    setError(null);
    setLoading(false);
  }, []);

  const readSourceFromField = useCallback(async () => {
    const beforeCursor = await keyboardBridge.getTextBeforeCursor(
      FIELD_SNIPPET_LENGTH,
    );
    setSourceText(beforeCursor);
    setSourceReplaceLength(beforeCursor.length);
  }, []);

  const refreshSource = useCallback(async () => {
    requestIdRef.current += 1;
    clearFormatSession();
    await readSourceFromField();
    setFormatted(null);
    setError(null);
    setLoading(false);
  }, [readSourceFromField]);

  useEffect(() => {
    void readSourceFromField();
    return () => {
      requestIdRef.current += 1;
    };
  }, [readSourceFromField]);

  const handleFormatSelect = useCallback(
    (format: FormatType) => {
      triggerKeyHaptic();
      setFormatId(format.id);
      setError(null);
      const input = sourceText.trim();
      if (!input) {
        setError('Add text in the field first.');
        return;
      }
      void runFormat(input, format.id, true);
    },
    [runFormat, sourceText],
  );

  const handleFollowUp = useCallback(
    (label: string, instruction: string) => {
      triggerKeyHaptic();
      void runFollowUp(label, instruction);
    },
    [runFollowUp],
  );

  const handleReplace = useCallback(() => {
    if (!formatted || sourceReplaceLength <= 0) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.replaceWordPrefix(sourceReplaceLength, formatted);
    void syncSourceFromField();
  }, [formatted, sourceReplaceLength, syncSourceFromField]);

  const handleInsert = useCallback(() => {
    if (!formatted) {
      return;
    }
    triggerKeyHaptic();
    keyboardBridge.insertText(formatted);
  }, [formatted]);

  const hasResult = Boolean(formatted);
  const theme = useKeyboardTheme();
  const panelStyles = usePluginPanelStyles();
  const styles = useThemedStyles(createFormatStyles);

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
          contentContainerStyle={styles.chipRowContent}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled>
          {FORMAT_TYPES.map(format => {
            const selected = format.id === formatId;
            return (
              <TouchableOpacity
                key={format.id}
                activeOpacity={0.7}
                delayPressIn={80}
                onPress={() => handleFormatSelect(format)}
                style={[
                  styles.chip,
                  selected && styles.chipSelected,
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}>
                  {format.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sourceCard}>
          <View style={styles.sourceRow}>
            {sourceText.trim() ? (
              <Text style={styles.sourceText} selectable={false}>
                {sourceText.trim()}
              </Text>
            ) : (
              <Text style={styles.placeholder}>
                Type or paste text in the field, then tap ↻ to refresh
              </Text>
            )}
            {loading ? (
              <ActivityIndicator color={theme.label} size="small" />
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                delayPressIn={80}
                hitSlop={8}
                onPress={() => {
                  triggerKeyHaptic();
                  void refreshSource();
                }}
                style={styles.refreshButton}>
                <Text style={styles.refreshHint}>↻</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {hasResult ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Formatted</Text>
              <View style={styles.resultActions}>
                <Pressable
                  onPressIn={handleReplace}
                  disabled={sourceReplaceLength <= 0 || loading}
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
                  onPressIn={handleInsert}
                  disabled={loading}
                  hitSlop={6}
                  style={({pressed}) => [
                    pressed && styles.actionPressed,
                  ]}>
                  <Text style={styles.actionSecondary}>Insert</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.resultText}>{formatted}</Text>
          </View>
        ) : loading ? (
          <Text style={styles.placeholder}>Formatting…</Text>
        ) : !formatId ? (
          <Text style={styles.placeholder}>Choose a format to get started</Text>
        ) : null}
      </ScrollView>

      {hasResult ? (
        <View style={styles.followUpFooter}>
          <Text style={styles.followUpTitle}>Would you like to add?</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRowContent}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled>
            {FORMAT_FOLLOW_UPS.map(item => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                delayPressIn={80}
                disabled={loading}
                onPress={() => handleFollowUp(item.label, item.instruction)}
                style={[
                  styles.followUpChip,
                  loading && styles.followUpChipDisabled,
                ]}>
                <Text style={styles.followUpChipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.fade} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="formatSmoke" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={theme.container} stopOpacity="1" />
              <Stop
                offset="0.5"
                stopColor={theme.container}
                stopOpacity="0.4"
              />
              <Stop offset="1" stopColor={theme.container} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#formatSmoke)"
          />
        </Svg>
      </View>
    </View>
  );
}

function createFormatStyles(theme: KeyboardTheme) {
  const fadeHeight = getPluginMenuFadeHeight(theme);

  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 12,
      gap: 8,
    },
    chipRowContent: {
      gap: 6,
      paddingRight: 4,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.pluginCard,
    },
    chipSelected: {
      backgroundColor: theme.essentialsAccent,
    },
    chipText: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    chipTextSelected: {
      // Quivox accent chips are white — use dark selected text.
      color:
        theme.design === 'quivox' ? theme.chipSelectedText : theme.label,
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
    refreshButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
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
      fontSize: 15,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      lineHeight: 21,
    },
    followUpFooter: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 8,
      gap: 6,
      zIndex: 2,
    },
    followUpTitle: {
      color: theme.spaceLabel,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    followUpChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: theme.modifierKey,
    },
    followUpChipDisabled: {
      opacity: 0.45,
    },
    followUpChipText: {
      color: theme.label,
      fontSize: 12,
      fontFamily: theme.fontFamily,
      fontWeight: '500',
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
      height: fadeHeight,
    },
  });
}
