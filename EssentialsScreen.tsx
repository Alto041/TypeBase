import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import DeleteIcon from './assets/delete.svg';
import EssentialsIcon from './assets/plugins/essentials.svg';
import AutoCapIcon from './assets/format-letter-case-upper.svg';
import {playSwitchOffSound, playSwitchOnSound} from './src/app/switchSound';
import {
  deleteEssential,
  ensureEssentialsLoaded,
  formatSnippetTriggerLabel,
  getEssentialsList,
  isValidEssentialKeyword,
  saveEssential,
} from './src/keyboard/essentials/essentialsStore';
import {
  FREE_SNIPPET_LIMIT,
  saveEssentialFailureMessage,
} from './src/keyboard/essentials/snippetTier';
import type {Essential} from './src/keyboard/essentials/types';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  KEYBOARD_LAYOUT_CHANGED_EVENT,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {usePremium} from './src/licensing/PremiumContext';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  red: '#D71921',
  muted: '#b0b0b5',
  border: '#e8e8ea',
} as const;

const CARD_R = 14;
const ROW_GAP = 8;
const ROW_ICON = 20;
const TEXT_KERNING = -0.7;

type EditorMode =
  | {kind: 'closed'}
  | {kind: 'new'}
  | {kind: 'edit'; id: string};

export function EssentialsScreen({
  onBack,
  onOpenPremium,
}: {
  onBack: () => void;
  onOpenPremium?: () => void;
}) {
  const {isPremium} = usePremium();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Essential[]>([]);
  const [essentialsEnabled, setEssentialsEnabled] = useState(true);
  const [editor, setEditor] = useState<EditorMode>({kind: 'closed'});
  const [keyword, setKeyword] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const essentialsAnim = useRef(new Animated.Value(1)).current;
  const matchCaseAnim = useRef(new Animated.Value(0)).current;
  const [matchCaseEnabled, setMatchCaseEnabled] = useState(false);

  const animateToggle = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const reload = useCallback(async () => {
    await ensureLayoutLoaded();
    await ensureEssentialsLoaded();
    const layout = getKeyboardLayoutSettings();
    const enabled = layout.essentialsEnabled ?? true;
    const matchCase = layout.essentialsMatchCaseEnabled ?? false;
    setEssentialsEnabled(enabled);
    setMatchCaseEnabled(matchCase);
    essentialsAnim.setValue(enabled ? 1 : 0);
    matchCaseAnim.setValue(matchCase ? 1 : 0);
    setItems(getEssentialsList());
    setReady(true);
  }, [essentialsAnim, matchCaseAnim]);

  useEffect(() => {
    void reload();
    const sub = DeviceEventEmitter.addListener(KEYBOARD_LAYOUT_CHANGED_EVENT, () => {
      const layout = getKeyboardLayoutSettings();
      const enabled = layout.essentialsEnabled ?? true;
      const matchCase = layout.essentialsMatchCaseEnabled ?? false;
      setEssentialsEnabled(enabled);
      setMatchCaseEnabled(matchCase);
      essentialsAnim.setValue(enabled ? 1 : 0);
      matchCaseAnim.setValue(matchCase ? 1 : 0);
    });
    return () => sub.remove();
  }, [essentialsAnim, matchCaseAnim, reload]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editor.kind !== 'closed') {
        setEditor({kind: 'closed'});
        setError(null);
        return true;
      }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [editor.kind, onBack]);

  const openNew = useCallback(() => {
    if (!isPremium && items.length >= FREE_SNIPPET_LIMIT) {
      setError(saveEssentialFailureMessage('limit'));
      setEditor({kind: 'closed'});
      return;
    }
    setKeyword('');
    setValue('');
    setError(null);
    setEditor({kind: 'new'});
  }, [isPremium, items.length]);

  const openEdit = useCallback((essential: Essential) => {
    setKeyword(essential.keyword);
    setValue(essential.value);
    setError(null);
    setEditor({kind: 'edit', id: essential.id});
  }, []);

  const closeEditor = useCallback(() => {
    setEditor({kind: 'closed'});
    setError(null);
  }, []);

  const toggleEssentials = async () => {
    const next = !essentialsEnabled;
    setEssentialsEnabled(next);
    await updateKeyboardLayoutSetting('essentialsEnabled', next);
    animateToggle(essentialsAnim, next ? 1 : 0);
    if (next) {
      playSwitchOnSound();
    } else {
      playSwitchOffSound();
    }
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const toggleMatchCase = async () => {
    const next = !matchCaseEnabled;
    setMatchCaseEnabled(next);
    await updateKeyboardLayoutSetting('essentialsMatchCaseEnabled', next);
    animateToggle(matchCaseAnim, next ? 1 : 0);
    if (next) {
      playSwitchOnSound();
    } else {
      playSwitchOffSound();
    }
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const handleSave = useCallback(() => {
    if (saving) {
      return;
    }
    void (async () => {
      setSaving(true);
      try {
        const essentialId = editor.kind === 'edit' ? editor.id : undefined;
        const result = await saveEssential(
          keyword,
          value,
          essentialId,
          isPremium,
          matchCaseEnabled,
        );
        if (!result.ok) {
          setError(saveEssentialFailureMessage(result.reason));
          return;
        }
        closeEditor();
        await reload();
      } finally {
        setSaving(false);
      }
    })();
  }, [closeEditor, editor, isPremium, keyword, reload, saving, value]);

  const handleDelete = useCallback(
    (essential: Essential) => {
      void (async () => {
        await deleteEssential(essential.id);
        if (editor.kind === 'edit' && editor.id === essential.id) {
          closeEditor();
        }
        await reload();
      })();
    },
    [closeEditor, editor, reload],
  );

  const canSave =
    isValidEssentialKeyword(keyword, matchCaseEnabled) &&
    value.trim().length > 0 &&
    !saving;

  const renderToggleRow = (
    icon: React.ReactNode,
    label: string,
    enabled: boolean,
    anim: Animated.Value,
    onToggle: () => void,
    options?: {premiumBadge?: boolean},
  ) => (
    <View style={styles.rowInner}>
      {icon}
      <View style={styles.rowTitleWrap}>
        <Text style={styles.rowTitle}>{label}</Text>
        {options?.premiumBadge && !isPremium ? (
          <View style={styles.premiumPill}>
            <Text style={styles.premiumPillText}>PREMIUM</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.toggleWrap}>
        <Pressable
          onPress={onToggle}
          style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
          <Animated.View
            style={[
              styles.toggleThumb,
              {
                transform: [
                  {
                    translateX: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 18],
                    }),
                  },
                ],
              },
            ]}
          />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Essentials</Text>
        <Text style={styles.pageIntro}>
          ;keyword + space
          {!isPremium ? ` · ${FREE_SNIPPET_LIMIT} max on free` : ''}
        </Text>

        {!isPremium ? (
          <Pressable
            style={[styles.rowCard, styles.unlockCard, {marginBottom: ROW_GAP}]}
            onPress={() => onOpenPremium?.()}>
            <View style={styles.rowInner}>
              <Text style={styles.rowTitle}>Unlock TypeBase Premium</Text>
              <Text style={styles.rowValue}>→</Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>Behavior</Text>
        <View style={styles.mainStack}>
          <View style={[styles.rowCard, styles.firstCard]}>
            {renderToggleRow(
              <EssentialsIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />,
              'Use essentials',
              essentialsEnabled,
              essentialsAnim,
              () => void toggleEssentials(),
              {premiumBadge: true},
            )}
          </View>
          <View style={[styles.rowCard, styles.lastCard]}>
            {renderToggleRow(
              <AutoCapIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />,
              'Match case',
              matchCaseEnabled,
              matchCaseAnim,
              () => void toggleMatchCase(),
            )}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Saved essentials</Text>
        <View style={styles.mainStack}>
          {!ready ? (
            <Text style={styles.emptyInline}>Loading…</Text>
          ) : items.length === 0 ? (
            <View style={[styles.rowCard, styles.soloCard]}>
              <Text style={styles.emptyInline}>None yet</Text>
            </View>
          ) : (
            items.map((item, index) => {
              const cardStyle =
                items.length === 1
                  ? [styles.rowCard, styles.soloCard]
                  : index === 0
                    ? [styles.rowCard, styles.firstCard]
                    : index === items.length - 1
                      ? [styles.rowCard, styles.lastCard]
                      : [styles.rowCard, styles.middleCard];
              return (
                <View key={item.id} style={[cardStyle, styles.snippetCard]}>
                  <Pressable style={styles.snippetRow} onPress={() => openEdit(item)}>
                    <EssentialsIcon width={ROW_ICON} height={ROW_ICON} color={C.text} />
                    <View style={styles.snippetBody}>
                      <Text style={styles.snippetTrigger} numberOfLines={1}>
                        {formatSnippetTriggerLabel(item.keyword)}
                      </Text>
                      <Text style={styles.snippetPreview} numberOfLines={1}>
                        {item.value || 'Empty'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    onPress={() => handleDelete(item)}
                    style={styles.deleteIconBtn}>
                    <DeleteIcon width={18} height={18} color={C.text} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <Pressable
          style={[styles.addCard, !ready && styles.addCardDisabled]}
          disabled={!ready}
          onPress={openNew}>
          <Text style={styles.addCardText}>Add essential</Text>
        </Pressable>

        <View style={styles.builtinRow}>
          {(['date', 'time', 'clipboard'] as const).map(key => (
            <View key={key} style={styles.builtinChip}>
              <Text style={styles.builtinChipText}>;{key}</Text>
            </View>
          ))}
        </View>

        {error && editor.kind === 'closed' ? (
          <Text style={styles.errorBanner}>{error}</Text>
        ) : null}

        {editor.kind !== 'closed' ? (
          <View style={styles.editorCard}>
            <Text style={styles.editorLabel}>Keyword</Text>
            <View style={styles.keywordRow}>
              <Text style={styles.keywordPrefix}>;</Text>
              <TextInput
                value={keyword}
              onChangeText={text => {
                const cleaned = text.replace(/[^a-zA-Z0-9_]/g, '');
                setKeyword(matchCaseEnabled ? cleaned : cleaned.toLowerCase());
              }}
                placeholder="email"
                placeholderTextColor={C.muted}
                style={styles.keywordInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            <Text style={styles.editorLabel}>Inserts</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="Text to insert"
              placeholderTextColor={C.muted}
              style={styles.valueInput}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
            />
            {error ? <Text style={styles.errorInline}>{error}</Text> : null}
            <View style={styles.editorActions}>
              <Pressable onPress={closeEditor} hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 110,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
  },
  pageIntro: {
    fontSize: 11,
    lineHeight: 15,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  mainStack: {
    gap: 4,
    marginBottom: ROW_GAP,
  },
  rowCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  unlockCard: {
    borderRadius: 20,
  },
  firstCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  middleCard: {
    borderRadius: 10,
  },
  lastCard: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  soloCard: {
    borderRadius: 20,
  },
  snippetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    paddingRight: 0,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
  },
  rowTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowTitle: {
    color: C.text,
    fontSize: 16,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  rowValue: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    marginLeft: 'auto',
    letterSpacing: TEXT_KERNING,
  },
  premiumPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: C.border,
  },
  premiumPillText: {
    fontSize: 9,
    fontFamily: 'FragmentMono',
    color: C.text,
    letterSpacing: 0.4,
  },
  toggleWrap: {
    marginLeft: 'auto',
  },
  toggleTrack: {
    width: 44,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1D1D6',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#2CC642',
  },
  toggleThumb: {
    width: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  snippetRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingVertical: 4,
    paddingLeft: 14,
  },
  snippetBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  snippetTrigger: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    fontWeight: '600',
  },
  snippetPreview: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
  },
  deleteIconBtn: {
    padding: 14,
    justifyContent: 'center',
  },
  addCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addCardDisabled: {
    opacity: 0.5,
  },
  addCardText: {
    fontSize: 15,
    color: C.text,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: TEXT_KERNING,
  },
  builtinRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  builtinChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: C.card,
  },
  builtinChipText: {
    fontFamily: 'FragmentMono',
    fontSize: 11,
    color: C.text,
  },
  emptyInline: {
    fontSize: 12,
    color: C.sub,
    fontFamily: 'FragmentMono',
    paddingVertical: 16,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  errorBanner: {
    fontSize: 12,
    color: C.red,
    fontFamily: 'FragmentMono',
    lineHeight: 16,
    marginTop: 8,
  },
  editorCard: {
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  editorLabel: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'FragmentMono',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keywordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keywordPrefix: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    fontWeight: '600',
  },
  keywordInput: {
    flex: 1,
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    paddingVertical: 4,
  },
  valueInput: {
    minHeight: 88,
    fontSize: 15,
    color: C.text,
    fontFamily: 'FragmentMono',
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  errorInline: {
    fontSize: 12,
    color: C.red,
    fontFamily: 'FragmentMono',
    lineHeight: 16,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 13,
    color: C.sub,
    fontFamily: 'FragmentMono',
  },
  saveBtn: {
    backgroundColor: C.text,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'FragmentMono',
  },
});
