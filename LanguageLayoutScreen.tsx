import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Alert,
  Animated,
  ActivityIndicator,
  DeviceEventEmitter,
  Easing,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {File} from 'expo-file-system';

import {
  formatDocumentPickerError,
  pickDocumentAsync,
} from './lib/pickDocumentAsync';

import DeleteIcon from './assets/delete.svg';
import UploadIcon from './assets/file-upload.svg';
import {
  getLetterLayoutMeta,
  isCustomLayoutId,
  LETTER_LAYOUT_CATALOG,
  type LetterLayoutId,
} from './src/keyboard/layouts/index';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {decodeKlcFile} from './src/keyboard/layouts/parseKlc';
import {
  CUSTOM_LAYOUTS_CHANGED_EVENT,
  deleteCustomLayout,
  ensureCustomLayoutsLoaded,
  importKlcLayout,
  listCustomLayoutMeta,
} from './src/keyboard/settings/customLayoutStore';
import {hapticTap} from './lib/haptics';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  red: '#D71921',
} as const;

const CARD_R = 14;
const INNER_R = 5;
const TEXT_KERNING = -0.5;
const KBDLAYOUT_INFO = 'https://kbdlayout.info/features/languages';
const DELETE_ACTION_WIDTH = 72;

type LayoutEntry = {
  id: LetterLayoutId;
  label: string;
  language: string;
  family: string;
  custom?: boolean;
};

type LayoutSwipeRowProps = {
  entry: LayoutEntry;
  selected: boolean;
  isSolo: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (id: LetterLayoutId) => void;
  onDelete: (entry: LayoutEntry) => void;
};

function LayoutSwipeRow({
  entry,
  selected,
  isSolo,
  isFirst,
  isLast,
  onSelect,
  onDelete,
}: LayoutSwipeRowProps) {
  const translateX = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const rowHeight = React.useRef(new Animated.Value(0)).current;
  const rowWidthRef = React.useRef(0);
  const isDeletingRef = React.useRef(false);
  const dragStartX = React.useRef(0);
  const [rowWidth, setRowWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const setDeleting = (deleting: boolean) => {
    isDeletingRef.current = deleting;
    setIsDeleting(deleting);
  };

  const snapClosed = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 280,
      mass: 0.8,
    }).start();
  };

  const runDeleteAnimation = (startX: number) => {
    if (isDeletingRef.current) {
      return;
    }
    setDeleting(true);

    const slideTarget = -(rowWidthRef.current + DELETE_ACTION_WIDTH);
    const distance = Math.abs(slideTarget - startX);
    const slideDuration = Math.round(Math.min(320, Math.max(240, distance * 0.9)));

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: slideTarget,
        duration: slideDuration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: slideDuration * 0.9,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(rowHeight, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(() => onDelete(entry));
    });
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !isDeletingRef.current &&
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation(value => {
          dragStartX.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(
          0,
          Math.max(-DELETE_ACTION_WIDTH, dragStartX.current + gesture.dx),
        );
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        translateX.stopAnimation(value => {
          if (value < -DELETE_ACTION_WIDTH * 0.45 || gesture.vx < -0.5) {
            runDeleteAnimation(value);
            return;
          }
          snapClosed();
        });
      },
      onPanResponderTerminate: snapClosed,
    }),
  ).current;

  const containerRadius = isSolo
    ? styles.stackItemSolo
    : isFirst
    ? styles.stackItemTop
    : isLast
    ? styles.stackItemBottom
    : styles.stackItemMid;

  return (
    <Animated.View
      style={[
        styles.rowOuter,
        containerRadius,
        layoutReady ? {height: rowHeight} : null,
      ]}
      collapsable={false}
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        rowWidthRef.current = width;
        setRowWidth(width);
        if (!layoutReady && height > 0) {
          rowHeight.setValue(height);
          setLayoutReady(true);
        }
      }}>
      {rowWidth > 0 ? (
        <Animated.View
          style={[
            styles.slidingRow,
            {
              width: rowWidth + DELETE_ACTION_WIDTH,
              opacity,
              transform: [{translateX}],
            },
          ]}
          {...(isDeleting ? {} : panResponder.panHandlers)}>
          <View style={[styles.stackItem, styles.layoutCard, {width: rowWidth}]}>
            <Pressable
              disabled={isDeleting}
              onPress={() => {
                translateX.stopAnimation(value => {
                  if (Math.abs(value) > 4) {
                    snapClosed();
                    return;
                  }
                  onSelect(entry.id);
                });
              }}
              style={({pressed}) => [
                styles.layoutBody,
                pressed && !isDeleting && styles.layoutBodyPressed,
              ]}>
              <View style={styles.linkTextWrap}>
                <Text style={styles.rowTitle}>{entry.label}</Text>
                <Text style={styles.rowSub}>
                  {entry.family} - hold to remove
                </Text>
              </View>
              {selected ? <View style={styles.selectionDot} /> : null}
            </Pressable>
          </View>
          <View style={styles.deleteAction}>
            <DeleteIcon width={24} height={24} color={C.card} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function LanguageLayoutScreen({onBack}: {onBack: () => void}) {
  const [selectedId, setSelectedId] = useState<LetterLayoutId>('en-us');
  const [importing, setImporting] = useState(false);
  const importInFlightRef = useRef(false);
  const [customEntries, setCustomEntries] = useState<LayoutEntry[]>([]);

  const refresh = useCallback(async () => {
    await ensureCustomLayoutsLoaded();
    await ensureLayoutLoaded();
    setCustomEntries(
      listCustomLayoutMeta().map(entry => ({
        ...entry,
        custom: true,
      })),
    );
    setSelectedId(getKeyboardLayoutSettings().letterLayoutId);
  }, []);

  useEffect(() => {
    refresh();
    const subscription = DeviceEventEmitter.addListener(
      CUSTOM_LAYOUTS_CHANGED_EVENT,
      () => {
        refresh();
      },
    );
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onBack]);

  const groupedBuiltIn = useMemo(() => {
    const map = new Map<string, LayoutEntry[]>();
    for (const entry of LETTER_LAYOUT_CATALOG) {
      const list = map.get(entry.language) ?? [];
      list.push(entry);
      map.set(entry.language, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const groupedCustom = useMemo(() => {
    const map = new Map<string, LayoutEntry[]>();
    for (const entry of customEntries) {
      const list = map.get(entry.language) ?? [];
      list.push(entry);
      map.set(entry.language, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [customEntries]);

  const selectLayout = useCallback(async (id: LetterLayoutId) => {
    hapticTap();
    setSelectedId(id);
    await updateKeyboardLayoutSetting('letterLayoutId', id);
  }, []);

  const handleImportKlc = useCallback(async () => {
    if (importInFlightRef.current) {
      return;
    }
    importInFlightRef.current = true;
    try {
      setImporting(true);
      const result = await pickDocumentAsync({
        copyToCacheDirectory: true,
        type: ['text/plain', 'text/*', '*/*'],
      });
      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const bytes = await new File(asset.uri).arrayBuffer();
      const text = decodeKlcFile(bytes);
      const layout = await importKlcLayout(text);
      await refresh();
      await selectLayout(layout.id);
      Alert.alert('Layout imported', `"${layout.label}" is now active.`);
    } catch (error) {
      const message = formatDocumentPickerError(error);
      Alert.alert('Import failed', message);
    } finally {
      importInFlightRef.current = false;
      setImporting(false);
    }
  }, [refresh, selectLayout]);

  const deleteLayout = useCallback(
    (entry: LayoutEntry) => {
      const runDelete = async () => {
        const wasActive = selectedId === entry.id;
        await deleteCustomLayout(entry.id);
        await refresh();
        if (wasActive) {
          await selectLayout('en-us');
        }
      };
      runDelete();
    },
    [refresh, selectLayout, selectedId],
  );

  const current = getLetterLayoutMeta(selectedId);

  const renderSection = (
    title: string,
    groups: [string, LayoutEntry[]][],
  ) =>
    groups.map(([language, entries]) => (
      <View key={`${title}-${language}`} style={styles.stack}>
        {entries.length > 1 ? (
          <Text style={styles.sectionTitle}>{language}</Text>
        ) : null}
        {entries.map((entry, index) => {
          const isSolo = entries.length === 1;
          const isFirst = index === 0;
          const isLast = index === entries.length - 1;
          if (entry.custom) {
            return (
              <LayoutSwipeRow
                key={entry.id}
                entry={entry}
                selected={entry.id === selectedId}
                isSolo={isSolo}
                isFirst={isFirst}
                isLast={isLast}
                onSelect={selectLayout}
                onDelete={deleteLayout}
              />
            );
          }
          return (
            <Pressable
              key={entry.id}
              onPress={() => {
                selectLayout(entry.id);
              }}
              style={[
                styles.stackItem,
                styles.linkRow,
                isSolo
                  ? styles.stackItemSolo
                  : isFirst
                  ? styles.stackItemTop
                  : isLast
                  ? styles.stackItemBottom
                  : styles.stackItemMid,
              ]}>
              <View style={styles.linkTextWrap}>
                <Text style={styles.rowTitle}>
                  {entries.length > 1 ? entry.label : language}
                </Text>
                <Text style={styles.rowSub}>{entry.family}</Text>
              </View>
              {entry.id === selectedId ? <View style={styles.selectionDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    ));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces>
        <Text style={styles.pageTitle}>Language & layout</Text>

        <View style={styles.mainContent}>
          <View style={styles.stack}>
            <View style={[styles.stackItem, styles.stackItemSolo, styles.currentRow]}>
              <Text style={styles.currentEyebrow}>Active keyboard</Text>
              <Text style={styles.currentTitle}>{current.label}</Text>
              <Text style={styles.currentSub}>
                {current.language} - {current.family}
                {isCustomLayoutId(selectedId) ? ' - imported' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.stack}>
            <Pressable
              onPress={() => {
                void handleImportKlc();
              }}
              disabled={importing}
              style={[
                styles.stackItem,
                styles.stackItemSolo,
                styles.linkRow,
                importing && styles.importRowDisabled,
              ]}>
              <View style={styles.linkTextWrap}>
                <Text style={styles.rowTitle}>Import KLC layout</Text>
                <Text style={styles.rowSub}>
                  From{' '}
                  <Text
                    style={styles.link}
                    onPress={() => {
                      Linking.openURL(KBDLAYOUT_INFO);
                    }}>
                    kbdlayout.info
                  </Text>
                </Text>
              </View>
              {importing ? (
                <ActivityIndicator color={C.red} />
              ) : (
                <View style={styles.importActionWrap}>
                  <UploadIcon width={16} height={16} />
                </View>
              )}
            </Pressable>
          </View>

          {customEntries.length > 0 ? (
            <>
              <Text style={styles.groupHeading}>Your layouts</Text>
              {renderSection('custom', groupedCustom)}
            </>
          ) : null}

          <Text style={styles.groupHeading}>Built-in</Text>
          {renderSection('built-in', groupedBuiltIn)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 104,
    paddingBottom: 120,
  },
  pageTitle: {
    fontSize: 40,
    fontFamily: 'Geist',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    marginBottom: 20,
  },
  mainContent: {
    flex: 1,
  },
  stack: {
    marginBottom: 8,
  },
  rowOuter: {
    overflow: 'hidden',
  },
  slidingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stackItem: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
  },
  layoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  layoutBody: {
    flex: 1,
    paddingVertical: 14,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  layoutBodyPressed: {
    opacity: 0.85,
  },
  stackItemTop: {
    borderTopLeftRadius: CARD_R,
    borderTopRightRadius: CARD_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
  },
  stackItemMid: {
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
  },
  stackItemBottom: {
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: CARD_R,
    borderBottomRightRadius: CARD_R,
  },
  stackItemSolo: {
    borderRadius: CARD_R,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  linkTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Geist',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: 'Inter',
    color: C.sub,
  },
  currentRow: {
    paddingVertical: 18,
  },
  currentEyebrow: {
    fontSize: 12,
    fontFamily: 'Inter',
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  currentTitle: {
    fontSize: 22,
    fontFamily: 'Geist',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  currentSub: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    color: C.sub,
  },
  importRowDisabled: {
    opacity: 0.7,
  },
  importActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  link: {
    fontFamily: 'Inter',
    color: C.text,
    textDecorationLine: 'underline',
  },
  groupHeading: {
    fontSize: 15,
    fontFamily: 'Geist',
    color: C.text,
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Geist',
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  selectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
  },
  deleteAction: {
    width: DELETE_ACTION_WIDTH,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
