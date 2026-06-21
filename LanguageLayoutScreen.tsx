import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';

import BackIcon from './assets/back.svg';
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

const TEXT_KERNING = -0.7;
const KBDLAYOUT_INFO = 'https://kbdlayout.info/features/languages';

type LayoutEntry = {
  id: LetterLayoutId;
  label: string;
  language: string;
  family: string;
  custom?: boolean;
};

export function LanguageLayoutScreen({onBack}: {onBack: () => void}) {
  const [selectedId, setSelectedId] = useState<LetterLayoutId>('en-us');
  const [importing, setImporting] = useState(false);
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
    void refresh();
    const subscription = DeviceEventEmitter.addListener(
      CUSTOM_LAYOUTS_CHANGED_EVENT,
      () => {
        void refresh();
      },
    );
    return () => subscription.remove();
  }, [refresh]);

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
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
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
      const message =
        error instanceof Error ? error.message : 'Could not read that KLC file.';
      Alert.alert('Import failed', message);
    } finally {
      setImporting(false);
    }
  }, [refresh, selectLayout]);

  const confirmDeleteLayout = useCallback(
    (entry: LayoutEntry) => {
      Alert.alert(
        'Remove layout?',
        `"${entry.label}" will be deleted from this device.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const wasActive = selectedId === entry.id;
                await deleteCustomLayout(entry.id);
                await refresh();
                if (wasActive) {
                  await selectLayout('en-us');
                }
              })();
            },
          },
        ],
      );
    },
    [refresh, selectLayout, selectedId],
  );

  const current = getLetterLayoutMeta(selectedId);

  const renderSection = (
    title: string,
    groups: [string, LayoutEntry[]][],
    options?: {deletable?: boolean},
  ) =>
    groups.map(([language, entries]) => (
      <View key={`${title}-${language}`} style={styles.section}>
        <Text style={styles.sectionTitle}>{language}</Text>
        <View style={styles.card}>
          {entries.map((entry, index) => {
            const selected = entry.id === selectedId;
            return (
              <Pressable
                key={entry.id}
                onPress={() => selectLayout(entry.id)}
                onLongPress={
                  options?.deletable
                    ? () => confirmDeleteLayout(entry)
                    : undefined
                }
                style={[
                  styles.row,
                  index < entries.length - 1 && styles.rowBorder,
                ]}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{entry.label}</Text>
                  <Text style={styles.rowSub}>{entry.family}</Text>
                </View>
                {selected ? (
                  <View style={styles.check}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    ));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <BackIcon width={22} height={14} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Language & layout</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.currentCard}>
          <Text style={styles.currentEyebrow}>Active keyboard</Text>
          <Text style={styles.currentTitle}>{current.label}</Text>
          <Text style={styles.currentSub}>
            {current.language} · {current.family}
            {isCustomLayoutId(selectedId) ? ' · imported' : ''}
          </Text>
        </View>

        <Pressable
          onPress={() => void handleImportKlc()}
          disabled={importing}
          style={[styles.importCard, importing && styles.importCardDisabled]}>
          <View style={styles.importText}>
            <Text style={styles.importTitle}>Import KLC layout</Text>
            <Text style={styles.importSub}>
              Download the{' '}
              <Text style={styles.linkBold}>KLC text file</Text> (.klc or .txt)
              from{' '}
              <Text
                style={styles.link}
                onPress={() => void Linking.openURL(KBDLAYOUT_INFO)}>
                kbdlayout.info
              </Text>{' '}
              — not JSON. Windows saves these as .txt and that is fine.
            </Text>
          </View>
          {importing ? (
            <ActivityIndicator color={C.red} />
          ) : (
            <Text style={styles.importAction}>Upload</Text>
          )}
        </Pressable>

        <Text style={styles.sectionHint}>
          Built-in layouts cover common languages. Import any Windows layout as a
          .klc file. Numbers and symbols layers stay shared for now.
        </Text>

        {customEntries.length > 0 ? (
          <>
            <Text style={styles.groupHeading}>Your layouts</Text>
            {renderSection('custom', groupedCustom, {deletable: true})}
            <Text style={styles.deleteHint}>Long-press a custom layout to delete.</Text>
          </>
        ) : null}

        <Text style={styles.groupHeading}>Built-in</Text>
        {renderSection('built-in', groupedBuiltIn)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  currentCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  importCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  importCardDisabled: {
    opacity: 0.7,
  },
  importText: {
    flex: 1,
  },
  importTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  importSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: C.sub,
  },
  importAction: {
    fontSize: 15,
    fontWeight: '600',
    color: C.red,
  },
  currentEyebrow: {
    fontSize: 12,
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  currentTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  currentSub: {
    marginTop: 4,
    fontSize: 14,
    color: C.sub,
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: C.sub,
    marginBottom: 20,
  },
  deleteHint: {
    fontSize: 12,
    color: C.sub,
    marginTop: -8,
    marginBottom: 18,
    marginLeft: 4,
  },
  groupHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    marginBottom: 12,
    marginLeft: 4,
  },
  link: {
    color: C.text,
    textDecorationLine: 'underline',
  },
  linkBold: {
    color: C.text,
    fontWeight: '600',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.sub,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 13,
    color: C.sub,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
