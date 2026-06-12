import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  InteractionManager,
  StyleSheet,
  View,
} from 'react-native';
import {useFonts} from 'expo-font';
import {KeyboardRow} from './components/Key';
import {SuggestionBar} from './components/SuggestionBar';
import {CalculatorPanel} from './calculator/CalculatorPanel';
import {ClipboardProPanel} from './clipboard/ClipboardProPanel';
import {EmojiBottomRow} from './emoji/EmojiBottomRow';
import {EmojiPanel} from './emoji/EmojiPanel';
import type {EmojiCategoryId} from './emoji/emojis';
import {
  captureSystemClipboard,
  deleteClipboardItem,
  ensureClipboardLoaded,
  getClipboardItems,
  toggleClipboardPin,
} from './clipboard/clipboardStore';
import type {ClipboardItem} from './clipboard/types';
import {useClipboardPasteSuggestion} from './clipboard/useClipboardPasteSuggestion';
import {EssentialsListPanel} from './essentials/EssentialsListPanel';
import {ItemsMenuPanel} from './essentials/ItemsMenuPanel';
import {
  deleteEssential,
  ensureEssentialsLoaded,
  getEssentialsList,
  isValidEssentialKeyword,
  matchEssentialSuggestions,
  saveEssential,
} from './essentials/essentialsStore';
import {
  extractEssentialTrigger,
  resolveEssentialExpansion,
} from './essentials/essentialsTrigger';
import type {Essential, KeyboardMode} from './essentials/types';
import type {KeyGesturesConfig} from './components/Key';
import {GestureTypingLayer} from './gesture/GestureTypingLayer';
import {SwipeTypingKeysHost} from './gesture/SwipeTypingContext';
import {KeyLayoutProvider} from './gesture/KeyLayoutContext';
import {AutocorrectPanel} from './autocorrect/AutocorrectPanel';
import {
  ensureAutocorrectLoaded,
  getAutocorrectSettings,
  reloadAutocorrectFromStorage,
  setAutoApplyOnSpace,
  setAutocorrectEnabled,
} from './autocorrect/autocorrectStore';
import {
  getAutocorrectCandidate,
  getSuggestionBarAutocorrect,
  shouldAutoApply,
} from './autocorrect/autocorrectEngine';
import {
  ensureLearnedPhrasesLoaded,
  extractTrailingWords,
  getPhraseCorrection,
  getPhraseSuggestions,
  learnPhrasesFromContext,
  recordLearnedPhrase,
} from './autocorrect/learnedPhrases';
import type {AutocorrectSettings} from './autocorrect/types';
import {GesturesPanel} from './gestures/GesturesPanel';
import {TranslatePanel} from './translate/TranslatePanel';
import {RewritePanel} from './rewrite/RewritePanel';
import {
  endsWithRewriteCommand,
  REWRITE_COMMAND,
} from './rewrite/rewriteTrigger';
import {
  getCommaLauncherArmed,
  getGestureSettings,
  getLauncherAppPackage,
  reloadGesturesFromStorage,
  setCommaLauncherArmed,
  setGestureSetting,
  setLauncherAppPackage,
} from './gestures/gesturesStore';
import type {GestureSettings, LaunchableApp} from './gestures/types';
import {keyboardBridge} from './keyboardBridge';
import {
  LAYOUTS,
  type KeyDefinition,
  type KeyboardLayout,
} from './layouts/qwerty';
import {
  ensureLearnedDictionaryLoaded,
  recordLearnedWord,
} from './suggestions/learnedDictionary';
import {
  extractCurrentWord,
  getWordSuggestions,
} from './suggestions/wordSuggestions';
import {ensureApiKeysLoaded} from './settings/apiKeysStore';
import {
  ensureThemeLoaded,
  getKeyboardColorScheme,
  KEYBOARD_THEME_CHANGED_EVENT,
} from './settings/themeStore';
import {
  KeyboardThemeProvider,
  useKeyboardTheme,
  useThemedStyles,
} from './KeyboardThemeContext';
import type {KeyboardColorScheme, KeyboardTheme} from './theme';
import {useVoiceInput} from './voice/useVoiceInput';

const DOUBLE_TAP_MS = 350;
const SUGGESTION_REFRESH_DEBOUNCE_MS = 160;

type LetterKeyboardRowsProps = {
  rows: KeyDefinition[][];
  layout: KeyboardLayout;
  modeType: KeyboardMode['type'];
  isUppercase: boolean;
  shiftOn: boolean;
  capsLocked: boolean;
  onKeyPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
};

const LetterKeyboardRows = React.memo(function LetterKeyboardRows({
  rows,
  layout,
  modeType,
  isUppercase,
  shiftOn,
  capsLocked,
  onKeyPress,
  keyGestures,
}: LetterKeyboardRowsProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createKeyboardAppStyles);

  return (
    <SwipeTypingKeysHost>
      {rows.map((row, index) => (
        <KeyboardRow
          key={`${layout}-${modeType}-${index}`}
          keys={row}
          isUppercase={layout === 'letters' && isUppercase}
          isShiftOn={layout === 'letters' && shiftOn}
          isCapsLocked={capsLocked}
          onKeyPress={onKeyPress}
          keyGestures={keyGestures}
          keyHeight={
            layout === 'numpad' ? theme.numpadKeyHeight : undefined
          }
          variant={layout === 'numpad' ? 'numpad' : undefined}
          rowStyle={layout === 'numpad' ? styles.numpadRow : undefined}
        />
      ))}
    </SwipeTypingKeysHost>
  );
});

function KeyboardBody() {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createKeyboardAppStyles);
  const [mode, setMode] = useState<KeyboardMode>({type: 'typing'});
  const [layout, setLayout] = useState<KeyboardLayout>('letters');
  const [shiftOn, setShiftOn] = useState(false);
  const [capsLocked, setCapsLocked] = useState(false);
  const lastShiftTapRef = useRef(0);
  const userChoseLettersRef = useRef(false);
  const suggestionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [prefersNumpad, setPrefersNumpad] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [essentialSuggestions, setEssentialSuggestions] = useState<Essential[]>(
    [],
  );
  const [essentialTriggerLength, setEssentialTriggerLength] = useState(0);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [essentials, setEssentials] = useState<Essential[]>([]);
  const [formKeyword, setFormKeyword] = useState('');
  const [formValue, setFormValue] = useState('');
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>('mood');
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>(
    getGestureSettings(),
  );
  const [autocorrectSettings, setAutocorrectSettings] =
    useState<AutocorrectSettings>(getAutocorrectSettings());
  const [autocorrectPreview, setAutocorrectPreview] = useState<string | null>(
    null,
  );
  const [typedKeepSuggestion, setTypedKeepSuggestion] = useState<string | null>(
    null,
  );
  const [launcherAppPackage, setLauncherAppPackageState] = useState(
    getLauncherAppPackage(),
  );
  const [launchableApps, setLaunchableApps] = useState<LaunchableApp[]>([]);
  const [launchableAppsLoading, setLaunchableAppsLoading] = useState(false);
  const [commaLauncherActive, setCommaLauncherActive] = useState(false);
  const [periodRewriteActive, setPeriodRewriteActive] = useState(false);
  const [calculatorDisplay, setCalculatorDisplay] = useState('0');
  const {
    isListening,
    isVoiceConnecting,
    isVoiceProcessing,
    partialTranscript,
    toggleListening,
  } = useVoiceInput();
  const clipboardPasteEnabled = mode.type === 'typing';
  const {
    clipboardPasteSuggestion,
    clearClipboardPasteSuggestion,
  } = useClipboardPasteSuggestion({enabled: clipboardPasteEnabled});

  const isUppercase = shiftOn || capsLocked;
  const isFormMode = mode.type === 'essentials-form';
  const isClipboardMode = mode.type === 'clipboard';
  const isEssentialsListMode = mode.type === 'essentials-list';
  const isGesturesMode = mode.type === 'gestures';
  const isCalculatorMode = mode.type === 'calculator';
  const isTranslateMode = mode.type === 'translate';
  const isRewriteMode = mode.type === 'rewrite';
  const isEmojiMode = mode.type === 'emoji';
  const gestureEnabled =
    gestureSettings.swipeTyping &&
    layout === 'letters' &&
    mode.type === 'typing';

  const rows = useMemo(() => LAYOUTS[layout], [layout]);

  useEffect(() => {
    void keyboardBridge.getPrefersNumpad().then(setPrefersNumpad);
    const subscription = DeviceEventEmitter.addListener(
      'keyboardPrefersNumpad',
      (prefers: boolean) => {
        userChoseLettersRef.current = false;
        setPrefersNumpad(prefers);
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (mode.type !== 'typing') {
      return;
    }
    if (prefersNumpad && !userChoseLettersRef.current) {
      setLayout('numpad');
      return;
    }
    if (!prefersNumpad && layout === 'numpad') {
      setLayout('letters');
    }
  }, [layout, mode.type, prefersNumpad]);

  const reloadEssentials = useCallback(() => {
    setEssentials(getEssentialsList());
  }, []);

  const reloadClipboard = useCallback(async () => {
    await ensureClipboardLoaded();
    setClipboardItems(getClipboardItems());
  }, []);

  const resetCase = useCallback(() => {
    setShiftOn(false);
    setCapsLocked(false);
  }, []);

  const closeItemsFlow = useCallback(() => {
    setMode({type: 'typing'});
    setFormKeyword('');
    setFormValue('');
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openItemsMenu = useCallback(() => {
    reloadEssentials();
    setMode({type: 'items-menu'});
    setLayout('letters');
    resetCase();
  }, [reloadEssentials, resetCase]);

  const openEssentialsList = useCallback(() => {
    reloadEssentials();
    setMode({type: 'essentials-list'});
    setLayout('letters');
    resetCase();
  }, [reloadEssentials, resetCase]);

  const reloadGestures = useCallback(async () => {
    await reloadGesturesFromStorage();
    setGestureSettings(getGestureSettings());
    setLauncherAppPackageState(getLauncherAppPackage());
    setCommaLauncherActive(getCommaLauncherArmed());
  }, []);

  const loadLaunchableApps = useCallback(async () => {
    setLaunchableAppsLoading(true);
    try {
      const apps = await keyboardBridge.getLaunchableApps();
      setLaunchableApps(apps);
    } finally {
      setLaunchableAppsLoading(false);
    }
  }, []);

  const reloadAutocorrect = useCallback(async () => {
    await reloadAutocorrectFromStorage();
    await ensureLearnedPhrasesLoaded();
    setAutocorrectSettings(getAutocorrectSettings());
  }, []);

  const openAutocorrect = useCallback(() => {
    setMode({type: 'autocorrect'});
    setLayout('letters');
    resetCase();
    void reloadAutocorrect();
  }, [reloadAutocorrect, resetCase]);

  const openGestures = useCallback(() => {
    setMode({type: 'gestures'});
    setLayout('letters');
    resetCase();
    void reloadGestures();
    void loadLaunchableApps();
  }, [loadLaunchableApps, reloadGestures, resetCase]);

  const openCalculator = useCallback(() => {
    setCalculatorDisplay('0');
    setMode({type: 'calculator'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openRewritePanel = useCallback(async () => {
    if (isListening) {
      await toggleListening();
    }
    if (mode.type !== 'typing' && mode.type !== 'emoji') {
      closeItemsFlow();
    }
    setMode({type: 'rewrite'});
    setLayout('letters');
    resetCase();
  }, [closeItemsFlow, isListening, mode.type, resetCase, toggleListening]);

  const closeRewritePanel = useCallback(() => {
    setMode({type: 'typing'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const toggleRewritePanel = useCallback(async () => {
    if (mode.type === 'rewrite') {
      closeRewritePanel();
      return;
    }
    await openRewritePanel();
  }, [closeRewritePanel, mode.type, openRewritePanel]);

  const toggleTranslatePanel = useCallback(async () => {
    if (mode.type === 'translate') {
      setMode({type: 'typing'});
      setLayout('letters');
      resetCase();
      return;
    }
    if (isListening) {
      await toggleListening();
    }
    if (mode.type !== 'typing' && mode.type !== 'emoji') {
      closeItemsFlow();
    }
    setMode({type: 'translate'});
    setLayout('letters');
    resetCase();
  }, [closeItemsFlow, isListening, mode.type, resetCase, toggleListening]);

  const handleSelectLauncherApp = useCallback(
    (packageName: string) => {
      void setLauncherAppPackage(packageName).then(() => {
        setLauncherAppPackageState(getLauncherAppPackage());
      });
    },
    [],
  );

  const openClipboard = useCallback(async () => {
    await reloadClipboard();
    await captureSystemClipboard();
    await reloadClipboard();
    setMode({type: 'clipboard'});
    setLayout('letters');
    resetCase();
  }, [reloadClipboard, resetCase]);

  const toggleEmojiPanel = useCallback(async () => {
    if (mode.type === 'emoji') {
      setMode({type: 'typing'});
      setLayout('letters');
      resetCase();
      return;
    }
    if (isListening) {
      await toggleListening();
    }
    setEmojiCategory('mood');
    setMode({type: 'emoji'});
    setLayout('letters');
    resetCase();
  }, [isListening, mode.type, resetCase, toggleListening]);

  const toggleItemsMenu = useCallback(() => {
    if (mode.type === 'translate') {
      setMode({type: 'typing'});
      setLayout('letters');
      resetCase();
      return;
    }
    if (mode.type === 'rewrite') {
      closeRewritePanel();
      return;
    }
    if (mode.type === 'typing' || mode.type === 'emoji') {
      openItemsMenu();
      return;
    }
    closeItemsFlow();
  }, [closeItemsFlow, closeRewritePanel, mode.type, openItemsMenu, resetCase]);

  const openEssentialsForm = useCallback(
    (essential?: Essential) => {
      setFormKeyword(essential?.keyword ?? '');
      setFormValue(essential?.value ?? '');
      setMode({
        type: 'essentials-form',
        essentialId: essential?.id,
        focusField: 'keyword',
      });
      setLayout('letters');
      resetCase();
    },
    [resetCase],
  );

  const handleFormBack = useCallback(() => {
    setFormKeyword('');
    setFormValue('');
    setMode({type: 'essentials-list'});
    reloadEssentials();
  }, [reloadEssentials]);

  const handleSaveEssential = useCallback(async () => {
    if (!isValidEssentialKeyword(formKeyword) || !formValue.trim()) {
      return;
    }
    const essentialId =
      mode.type === 'essentials-form' ? mode.essentialId : undefined;
    const saved = await saveEssential(formKeyword, formValue, essentialId);
    if (!saved) {
      return;
    }
    reloadEssentials();
    setFormKeyword('');
    setFormValue('');
    setMode({type: 'essentials-list'});
  }, [formKeyword, formValue, mode, reloadEssentials]);

  const handleFormConfirm = useCallback(() => {
    if (mode.type !== 'essentials-form') {
      return;
    }
    if (mode.focusField === 'keyword') {
      if (!isValidEssentialKeyword(formKeyword)) {
        return;
      }
      setMode({...mode, focusField: 'value'});
      return;
    }
    void handleSaveEssential();
  }, [formKeyword, handleSaveEssential, mode]);

  const refreshSuggestions = useCallback(async () => {
    if (
      layout !== 'letters' ||
      isFormMode ||
      isClipboardMode ||
      isEmojiMode ||
      isRewriteMode ||
      isTranslateMode
    ) {
      startTransition(() => {
        setSuggestions([]);
        setEssentialSuggestions([]);
        setEssentialTriggerLength(0);
        setCurrentPrefix('');
        setAutocorrectPreview(null);
        setTypedKeepSuggestion(null);
      });
      return;
    }

    await ensureEssentialsLoaded();
    const context = await keyboardBridge.getTextBeforeCursor(96);
    const essentialTrigger = extractEssentialTrigger(context);
    if (essentialTrigger) {
      startTransition(() => {
        setEssentialTriggerLength(essentialTrigger.triggerLength);
        setEssentialSuggestions(
          matchEssentialSuggestions(essentialTrigger.query, 3),
        );
        setSuggestions([]);
        setCurrentPrefix('');
        setAutocorrectPreview(null);
        setTypedKeepSuggestion(null);
      });
      return;
    }

    await ensureLearnedDictionaryLoaded();
    await ensureLearnedPhrasesLoaded();
    await ensureAutocorrectLoaded();

    const prefix = extractCurrentWord(context);

    const barAutocorrect =
      getAutocorrectSettings().enabled && prefix.length >= 2
        ? getSuggestionBarAutocorrect(prefix)
        : {keepTyped: null, correction: null};

    const phraseSuggestions = getPhraseSuggestions(context, 2);
    let wordSuggestions = getWordSuggestions(prefix, 3);
    const reserved = new Set<string>();
    if (barAutocorrect.keepTyped) {
      reserved.add(barAutocorrect.keepTyped.toLowerCase());
    }
    if (barAutocorrect.correction) {
      reserved.add(barAutocorrect.correction.toLowerCase());
    }
    if (reserved.size > 0) {
      wordSuggestions = wordSuggestions.filter(
        word => !reserved.has(word.toLowerCase()),
      );
    }

    const nextSuggestions = [...phraseSuggestions, ...wordSuggestions].slice(
      0,
      3,
    );

    startTransition(() => {
      setCurrentPrefix(prefix);
      setTypedKeepSuggestion(barAutocorrect.keepTyped);
      setAutocorrectPreview(barAutocorrect.correction);
      setSuggestions(nextSuggestions);
      setEssentialSuggestions([]);
      setEssentialTriggerLength(0);
    });
  }, [
    isClipboardMode,
    isEmojiMode,
    isFormMode,
    isRewriteMode,
    isTranslateMode,
    layout,
  ]);

  const scheduleRefreshSuggestions = useCallback(() => {
    if (layout !== 'letters' || mode.type !== 'typing') {
      return;
    }

    if (suggestionRefreshTimerRef.current) {
      clearTimeout(suggestionRefreshTimerRef.current);
    }
    suggestionRefreshTimerRef.current = setTimeout(() => {
      suggestionRefreshTimerRef.current = null;
      void refreshSuggestions();
    }, SUGGESTION_REFRESH_DEBOUNCE_MS);
  }, [layout, mode.type, refreshSuggestions]);

  useEffect(() => {
    return () => {
      if (suggestionRefreshTimerRef.current) {
        clearTimeout(suggestionRefreshTimerRef.current);
      }
    };
  }, []);

  const commitTypedWordBoundary = useCallback(
    async (insertBoundary: () => void) => {
      const context = await keyboardBridge.getTextBeforeCursor(96);
      if (endsWithRewriteCommand(context)) {
        keyboardBridge.replaceWordPrefix(REWRITE_COMMAND.length, '');
        await openRewritePanel();
        return;
      }
      const expansion = resolveEssentialExpansion(context);
      if (expansion) {
        keyboardBridge.replaceWordPrefix(
          expansion.triggerLength,
          expansion.value,
        );
        insertBoundary();
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
        return;
      }

      await ensureLearnedDictionaryLoaded();
      await ensureLearnedPhrasesLoaded();
      await ensureAutocorrectLoaded();

      const typedWord = extractCurrentWord(context);
      const autocorrectOn = getAutocorrectSettings().enabled;

      if (autocorrectOn && typedWord.length >= 2) {
        const phraseFix = getPhraseCorrection(context, typedWord);
        if (phraseFix) {
          keyboardBridge.replaceWordPrefix(
            phraseFix.replaceLength,
            phraseFix.phrase,
          );
          recordLearnedPhrase(phraseFix.phrase);
          for (const part of phraseFix.phrase.split(' ')) {
            recordLearnedWord(part);
          }
          learnPhrasesFromContext(
            context.slice(0, context.length - phraseFix.replaceLength) +
              phraseFix.phrase,
          );
          insertBoundary();
          requestAnimationFrame(() => {
            void refreshSuggestions();
          });
          return;
        }

        const candidate = getAutocorrectCandidate(typedWord);
        if (shouldAutoApply(candidate, typedWord)) {
          keyboardBridge.replaceWordPrefix(typedWord.length, candidate!.correction);
          recordLearnedWord(candidate!.correction);
          learnPhrasesFromContext(
            context.slice(0, -typedWord.length) + candidate!.correction,
          );
          insertBoundary();
          requestAnimationFrame(() => {
            void refreshSuggestions();
          });
          return;
        }
      }

      if (typedWord) {
        recordLearnedWord(typedWord);
      }
      learnPhrasesFromContext(context);
      insertBoundary();
      requestAnimationFrame(() => {
        void refreshSuggestions();
      });
    },
    [openRewritePanel, refreshSuggestions],
  );

  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      Promise.all([
        ensureEssentialsLoaded(),
        ensureClipboardLoaded(),
        ensureLearnedDictionaryLoaded(),
        ensureLearnedPhrasesLoaded(),
        ensureAutocorrectLoaded(),
        ensureApiKeysLoaded(),
        reloadGesturesFromStorage(),
      ]).finally(() => {
        reloadEssentials();
        void reloadClipboard();
        void reloadGestures();
        void reloadAutocorrect();
        refreshSuggestions();
      });
    });
    return () => interaction.cancel();
  }, [
    refreshSuggestions,
    reloadAutocorrect,
    reloadClipboard,
    reloadEssentials,
    reloadGestures,
  ]);

  useEffect(() => {
    const height =
      layout === 'numpad'
        ? theme.numpadKeyboardHeightDp
        : theme.keyboardHeightDp;
    keyboardBridge.setKeyboardHeight(height);
  }, [layout, theme]);

  const appendToFormField = useCallback(
    (text: string) => {
      if (mode.type !== 'essentials-form') {
        return;
      }
      if (mode.focusField === 'keyword') {
        const next = `${formKeyword}${text}`.toLowerCase();
        if (/^[a-z0-9_]*$/.test(next)) {
          setFormKeyword(next);
        }
        return;
      }
      setFormValue(current => current + text);
    },
    [formKeyword, mode],
  );

  const backspaceFormField = useCallback(() => {
    if (mode.type !== 'essentials-form') {
      return;
    }
    if (mode.focusField === 'keyword') {
      setFormKeyword(current => current.slice(0, -1));
      return;
    }
    setFormValue(current => current.slice(0, -1));
  }, [mode]);

  const handleShiftPress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastShiftTapRef.current < DOUBLE_TAP_MS;
    lastShiftTapRef.current = now;

    if (isDoubleTap) {
      setCapsLocked(locked => !locked);
      setShiftOn(false);
      return;
    }

    if (capsLocked) {
      setCapsLocked(false);
      setShiftOn(false);
      return;
    }

    setShiftOn(current => !current);
  }, [capsLocked]);

  const handleEssentialSuggestionSelect = useCallback(
    (essential: {value: string}) => {
      keyboardBridge.replaceWordPrefix(
        essentialTriggerLength,
        essential.value,
      );
      setEssentialSuggestions([]);
      setEssentialTriggerLength(0);
      requestAnimationFrame(() => {
        refreshSuggestions();
      });
    },
    [essentialTriggerLength, refreshSuggestions],
  );

  const handleSuggestionSelect = useCallback(
    (word: string) => {
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        if (word.includes(' ')) {
          const trailing = extractTrailingWords(context, 4);
          const replaceLength = trailing.join(' ').length;
          keyboardBridge.replaceWordPrefix(replaceLength, word);
          recordLearnedPhrase(word);
          for (const part of word.split(' ')) {
            recordLearnedWord(part);
          }
        } else {
          recordLearnedWord(word);
          if (!currentPrefix) {
            keyboardBridge.insertText(word);
          } else {
            keyboardBridge.replaceWordPrefix(currentPrefix.length, word);
          }
        }
        keyboardBridge.insertText(' ');
        if (shiftOn && !capsLocked) {
          setShiftOn(false);
        }
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
      });
    },
    [capsLocked, currentPrefix, refreshSuggestions, shiftOn],
  );

  const handleClipboardPasteSelect = useCallback(() => {
    const item = clipboardPasteSuggestion;
    if (!item) {
      return;
    }
    clearClipboardPasteSuggestion();
    if (item.kind === 'image' && item.imageUri) {
      const imagePath = item.imageUri.replace(/^file:\/\//, '');
      void keyboardBridge.insertClipboardImage(imagePath);
    } else if (item.text) {
      keyboardBridge.insertText(item.text);
    }
    scheduleRefreshSuggestions();
  }, [
    clearClipboardPasteSuggestion,
    clipboardPasteSuggestion,
    scheduleRefreshSuggestions,
  ]);

  const handleKeyPress = useCallback(
    (keyDef: KeyDefinition) => {
      if (mode.type === 'typing') {
        clearClipboardPasteSuggestion();
      }

      if (mode.type === 'emoji') {
        switch (keyDef.type) {
          case 'numbers':
            setMode({type: 'typing'});
            setLayout('letters');
            resetCase();
            return;
          case 'backspace':
          case 'enter-backspace':
            keyboardBridge.deleteBackward();
            return;
          default:
            break;
        }
        return;
      }

      if (mode.type === 'essentials-form') {
        switch (keyDef.type) {
          case 'backspace':
            backspaceFormField();
            return;
          case 'space':
            appendToFormField(' ');
            return;
          case 'enter':
            handleFormConfirm();
            return;
          case 'shift':
            if (mode.focusField === 'value') {
              handleShiftPress();
            }
            return;
          case 'numbers':
            setLayout(current => (current === 'letters' ? 'numbers' : 'letters'));
            return;
          case 'symbols':
            setLayout(current => (current === 'symbols' ? 'numbers' : 'symbols'));
            return;
          default:
            if (keyDef.value) {
              const text =
                mode.focusField === 'value' && isUppercase
                  ? keyDef.value.toUpperCase()
                  : mode.focusField === 'value'
                    ? keyDef.value
                    : keyDef.value.toLowerCase();
              appendToFormField(text);
              if (mode.focusField === 'value' && shiftOn && !capsLocked) {
                setShiftOn(false);
              }
            }
        }
        return;
      }

      switch (keyDef.type) {
        case 'backspace':
          keyboardBridge.deleteBackward();
          scheduleRefreshSuggestions();
          return;
        case 'space':
          void commitTypedWordBoundary(() => {
            keyboardBridge.insertText(' ');
          });
          return;
        case 'enter':
          void commitTypedWordBoundary(() => {
            keyboardBridge.insertNewline();
          });
          return;
        case 'shift':
          handleShiftPress();
          return;
        case 'letters':
          userChoseLettersRef.current = true;
          setLayout('letters');
          resetCase();
          return;
        case 'numpad-back':
          keyboardBridge.deleteBackward();
          scheduleRefreshSuggestions();
          return;
        case 'numbers':
          if (layout === 'letters') {
            setLayout('numbers');
            resetCase();
          } else if (layout === 'numpad') {
            userChoseLettersRef.current = true;
            setLayout('letters');
            resetCase();
          } else {
            setLayout('letters');
            resetCase();
          }
          return;
        case 'symbols':
          setLayout(current => (current === 'symbols' ? 'numbers' : 'symbols'));
          return;
        default:
          if (keyDef.value) {
            const text =
              layout === 'letters' && isUppercase
                ? keyDef.value.toUpperCase()
                : keyDef.value;
            keyboardBridge.insertText(text);
            const shouldReleaseShift = shiftOn && !capsLocked;
            scheduleRefreshSuggestions();
            if (shouldReleaseShift) {
              startTransition(() => setShiftOn(false));
            }
          }
      }
    },
    [
      appendToFormField,
      backspaceFormField,
      capsLocked,
      commitTypedWordBoundary,
      handleFormConfirm,
      handleShiftPress,
      isUppercase,
      layout,
      mode,
      resetCase,
      clearClipboardPasteSuggestion,
      scheduleRefreshSuggestions,
      shiftOn,
    ],
  );

  const handleWordCommitted = useCallback(
    (word: string) => {
      clearClipboardPasteSuggestion();
      recordLearnedWord(word);
      keyboardBridge.insertText(word);
      keyboardBridge.insertText(' ');
      if (shiftOn && !capsLocked) {
        setShiftOn(false);
      }
      requestAnimationFrame(() => {
        void refreshSuggestions();
      });
    },
    [capsLocked, clearClipboardPasteSuggestion, refreshSuggestions, shiftOn],
  );

  const showKeys =
    mode.type === 'typing' ||
    mode.type === 'essentials-form' ||
    isEmojiMode;
  const itemsSelected =
    mode.type === 'items-menu' ||
    mode.type === 'essentials-list' ||
    mode.type === 'clipboard' ||
    mode.type === 'gestures' ||
    mode.type === 'autocorrect' ||
    mode.type === 'calculator';

  const handleCalculatorInsert = useCallback((value: string) => {
    if (!value || value === 'Error' || value === '0') {
      return;
    }
    keyboardBridge.insertText(value);
  }, []);

  const typingGesturesActive =
    mode.type === 'typing' && layout === 'letters' && !isFormMode;
  const keyGesturesActive = mode.type === 'typing' && !isFormMode;

  useEffect(() => {
    if (!gestureSettings.commaLauncher) {
      setCommaLauncherActive(false);
      void setCommaLauncherArmed(false);
    }
  }, [gestureSettings.commaLauncher]);

  useEffect(() => {
    const preserveArmedKeys =
      mode.type === 'rewrite' ||
      mode.type === 'translate' ||
      mode.type === 'emoji';
    if (mode.type === 'typing' || preserveArmedKeys) {
      return;
    }
    setPeriodRewriteActive(false);
    setCommaLauncherActive(false);
    void setCommaLauncherArmed(false);
  }, [mode.type]);

  const keyGestures = useMemo<KeyGesturesConfig | undefined>(() => {
    if (!keyGesturesActive) {
      return undefined;
    }
    return {
      spaceCursorSwipe:
        layout === 'letters' && gestureSettings.spaceCursorSwipe,
      backspaceWordSwipe: gestureSettings.backspaceWordSwipe,
      backspaceSentenceHold: gestureSettings.backspaceSentenceHold,
      onCursorMove: offset => {
        void keyboardBridge.moveCursor(offset);
      },
      onDeleteWord: () => {
        void keyboardBridge.deleteWordBackward().then(() => {
          requestAnimationFrame(() => {
            refreshSuggestions();
          });
        });
      },
      onDeleteSentence: () => {
        void keyboardBridge.deleteSentenceBackward().then(() => {
          requestAnimationFrame(() => {
            refreshSuggestions();
          });
        });
      },
      onBackspaceRelease: () => {
        scheduleRefreshSuggestions();
      },
      swipeTyping: gestureSettings.swipeTyping,
      commaLauncher: gestureSettings.commaLauncher,
      commaLauncherActive,
      onCommaLongPress: () => {
        setCommaLauncherActive(true);
        void setCommaLauncherArmed(true);
      },
      onCommaLauncherPress: () => {
        void keyboardBridge.launchApp(launcherAppPackage);
      },
      onCommaLauncherDisarm: () => {
        setCommaLauncherActive(false);
        void setCommaLauncherArmed(false);
      },
      periodRewrite: true,
      periodRewriteActive,
      onPeriodLongPress: () => {
        setPeriodRewriteActive(true);
      },
      onPeriodRewritePress: () => {
        void openRewritePanel();
      },
      onPeriodRewriteDisarm: () => {
        setPeriodRewriteActive(false);
      },
    };
  }, [
    commaLauncherActive,
    gestureSettings,
    keyGesturesActive,
    layout,
    launcherAppPackage,
    openRewritePanel,
    periodRewriteActive,
    refreshSuggestions,
    scheduleRefreshSuggestions,
  ]);

  const handleGestureToggle = useCallback(
    (key: keyof GestureSettings, enabled: boolean) => {
      void setGestureSetting(key, enabled).then(() => {
        reloadGestures();
      });
    },
    [reloadGestures],
  );

  const handleAutocorrectToggle = useCallback(
    (enabled: boolean) => {
      void setAutocorrectEnabled(enabled).then(() => {
        void reloadAutocorrect();
        void refreshSuggestions();
      });
    },
    [reloadAutocorrect, refreshSuggestions],
  );

  const handleAutoApplyToggle = useCallback(
    (autoApplyOnSpace: boolean) => {
      void setAutoApplyOnSpace(autoApplyOnSpace).then(() => {
        void reloadAutocorrect();
      });
    },
    [reloadAutocorrect],
  );

  const formCanConfirm =
    isFormMode &&
    (mode.focusField === 'keyword'
      ? isValidEssentialKeyword(formKeyword)
      : isValidEssentialKeyword(formKeyword) && formValue.trim().length > 0);

  const isNumpadLayout = layout === 'numpad';

  return (
    <View
      style={[styles.container, isNumpadLayout && styles.containerCompact]}>
      <GestureTypingLayer
          enabled={gestureEnabled}
          compact={isNumpadLayout}
          alignTop={
            isNumpadLayout ||
            mode.type === 'clipboard' ||
            mode.type === 'items-menu' ||
            mode.type === 'essentials-list' ||
            mode.type === 'gestures' ||
            mode.type === 'autocorrect' ||
            mode.type === 'calculator' ||
            mode.type === 'translate' ||
            mode.type === 'rewrite'
          }
          trackpadEnabled={
            typingGesturesActive && gestureSettings.trackpadMode
          }
          onCursorStep={offset => {
            void keyboardBridge.moveCursor(offset);
          }}
          isUppercase={isUppercase}
          onWordCommitted={handleWordCommitted}>
        <SuggestionBar
          suggestions={suggestions}
          prefix={currentPrefix}
          typedKeepSuggestion={typedKeepSuggestion}
          autocorrectPreview={autocorrectPreview}
          onSelect={handleSuggestionSelect}
          clipboardPasteSuggestion={clipboardPasteSuggestion}
          onClipboardPasteSelect={handleClipboardPasteSelect}
          essentialSuggestions={essentialSuggestions.map(item => ({
            keyword: item.keyword,
            value: item.value,
          }))}
          onEssentialSelect={handleEssentialSuggestionSelect}
          essentialsForm={
            isFormMode
              ? {
                  focusField: mode.focusField,
                  keyword: formKeyword,
                  value: formValue,
                  canConfirm: formCanConfirm,
                  onBack: handleFormBack,
                  onConfirm: handleFormConfirm,
                }
              : undefined
          }
          visible={
            layout === 'letters' ||
            layout === 'numbers' ||
            layout === 'symbols' ||
            layout === 'numpad'
          }
          isListening={isListening}
          isVoiceConnecting={isVoiceConnecting}
          isVoiceProcessing={isVoiceProcessing}
          partialTranscript={partialTranscript}
          onItemsPress={toggleItemsMenu}
          leadingBack={isFormMode || isTranslateMode || isRewriteMode}
          onTranslatePress={() => {
            void toggleTranslatePanel();
          }}
          translateSelected={isTranslateMode}
          onEmojiPress={() => {
            void toggleEmojiPanel();
          }}
          onVoicePress={toggleListening}
          itemsSelected={itemsSelected}
          emojiSelected={isEmojiMode}
          centerTitle={
            mode.type === 'items-menu'
              ? 'Plugins'
              : mode.type === 'clipboard'
                ? 'Clipboard'
                : mode.type === 'essentials-list'
                  ? 'Essentials'
                  : mode.type === 'gestures'
                    ? 'Gestures'
                    : mode.type === 'autocorrect'
                      ? 'Autocorrect'
                      : mode.type === 'calculator'
                        ? 'Calculator'
                        : mode.type === 'translate'
                          ? 'Translate'
                          : mode.type === 'rewrite'
                            ? 'Rewrite'
                            : undefined
          }
          trailingAction={
            isEssentialsListMode
              ? {onPress: () => openEssentialsForm()}
              : isCalculatorMode
                ? {
                    onPress: () => handleCalculatorInsert(calculatorDisplay),
                    icon: 'insert',
                  }
                : undefined
          }
        />

        <View
          style={[
            styles.keysPadding,
            layout === 'numpad' && styles.numpadKeysPadding,
            !showKeys && styles.keysPanel,
            !showKeys ? styles.keysPanelClip : null,
          ]}>
          {isEmojiMode ? (
            <EmojiPanel
              category={emojiCategory}
              onCategoryChange={setEmojiCategory}
              onSelect={emoji => {
                keyboardBridge.insertText(emoji);
              }}
            />
          ) : null}

          {mode.type === 'items-menu' ? (
            <ItemsMenuPanel
              onSelectEssentials={openEssentialsList}
              onSelectClipboard={() => {
                void openClipboard();
              }}
              onSelectGestures={() => {
                void openGestures();
              }}
              onSelectAutocorrect={() => {
                openAutocorrect();
              }}
              onSelectCalculator={() => {
                openCalculator();
              }}
            />
          ) : null}

          {mode.type === 'translate' ? (
            <TranslatePanel />
          ) : null}

          {mode.type === 'rewrite' ? <RewritePanel /> : null}

          {mode.type === 'calculator' ? (
            <CalculatorPanel
              onInsert={handleCalculatorInsert}
              onDisplayChange={setCalculatorDisplay}
            />
          ) : null}

          {mode.type === 'clipboard' ? (
            <ClipboardProPanel
              items={clipboardItems}
              onSelect={item => {
                if (item.kind === 'image' && item.imageUri) {
                  void keyboardBridge
                    .insertClipboardImage(item.imageUri)
                    .then(() => closeItemsFlow());
                  return;
                }
                if (item.text) {
                  keyboardBridge.insertText(item.text);
                }
                closeItemsFlow();
              }}
              onDelete={item => {
                void deleteClipboardItem(item.id).then(reloadClipboard);
              }}
              onTogglePin={item => {
                void toggleClipboardPin(item.id).then(reloadClipboard);
              }}
            />
          ) : null}

          {mode.type === 'gestures' ? (
            <GesturesPanel
              settings={gestureSettings}
              launcherAppPackage={launcherAppPackage}
              launchableApps={launchableApps}
              appsLoading={launchableAppsLoading}
              onToggle={handleGestureToggle}
              onSelectLauncherApp={handleSelectLauncherApp}
            />
          ) : null}

          {mode.type === 'autocorrect' ? (
            <AutocorrectPanel
              settings={autocorrectSettings}
              onToggleEnabled={handleAutocorrectToggle}
              onToggleAutoApply={handleAutoApplyToggle}
            />
          ) : null}

          {mode.type === 'essentials-list' ? (
            <EssentialsListPanel
              essentials={essentials}
              onSelect={essential => {
                keyboardBridge.insertText(essential.value);
                closeItemsFlow();
              }}
              onDelete={async essential => {
                await deleteEssential(essential.id);
                reloadEssentials();
              }}
            />
          ) : null}

          {isEmojiMode ? (
            <EmojiBottomRow
              category={emojiCategory}
              onCategorySelect={setEmojiCategory}
              onKeyPress={handleKeyPress}
            />
          ) : null}

          {showKeys && !isEmojiMode ? (
            <LetterKeyboardRows
              rows={rows}
              layout={layout}
              modeType={mode.type}
              isUppercase={isUppercase}
              shiftOn={shiftOn}
              capsLocked={capsLocked}
              onKeyPress={handleKeyPress}
              keyGestures={keyGestures}
            />
          ) : null}
        </View>
        </GestureTypingLayer>
    </View>
  );
}

const FONT_LOAD_TIMEOUT_MS = 2500;

export default function KeyboardApp() {
  const [fontsLoaded] = useFonts({
    Geist: require('../../assets/Geist-VariableFont_wght.ttf'),
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const [colorScheme, setColorScheme] =
    useState<KeyboardColorScheme>('light');
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    void ensureThemeLoaded().then(() => {
      setColorScheme(getKeyboardColorScheme());
      setThemeReady(true);
    });
    const subscription = DeviceEventEmitter.addListener(
      KEYBOARD_THEME_CHANGED_EVENT,
      (scheme: KeyboardColorScheme) => {
        setColorScheme(scheme);
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      return;
    }
    const timer = setTimeout(() => setFontTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  if ((!fontsLoaded && !fontTimedOut) || !themeReady) {
    return (
      <View style={keyboardAppLoadingStyles.container}>
        <ActivityIndicator color="#000000" />
      </View>
    );
  }

  return (
    <KeyboardThemeProvider scheme={colorScheme}>
      <KeyLayoutProvider>
        <KeyboardBody />
      </KeyLayoutProvider>
    </KeyboardThemeProvider>
  );
}

function createKeyboardAppStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.container,
    },
    keysPadding: {
      paddingTop: theme.keysPaddingTop,
      paddingBottom: theme.imeStripClearance,
    },
    keysPanel: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    keysPanelClip: {
      overflow: 'hidden',
    },
    numpadKeysPadding: {
      paddingTop: theme.numpadKeysPaddingTop,
    },
    containerCompact: {
      justifyContent: 'flex-start',
    },
    numpadRow: {
      marginBottom: theme.keyGap,
    },
  });
}

const keyboardAppLoadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEEEEE',
  },
});
