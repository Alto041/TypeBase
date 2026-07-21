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
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useFonts} from 'expo-font';
import * as Font from 'expo-font';
import { resolveCustomFontUri } from './settings/fontStore';
import {KeyboardRow} from './components/KeyboardRows';
import {SuggestionBar} from './components/SuggestionBar';
import {CalculatorPanel} from './calculator/CalculatorPanel';
import {TouchpadPanel} from './touchpad/TouchpadPanel';
import {KeyboardResizeOverlay} from './resize/KeyboardResizeOverlay';
import {
  clampKeyboardResizeOffset,
  computeResizedKeyboardHeightDp,
  MAX_KEYBOARD_HEIGHT_DP,
  MIN_KEYBOARD_HEIGHT_DP,
} from './resize/resizeLimits';
import {ClipboardProPanel} from './clipboard/ClipboardProPanel';
import {EmojiBottomRow} from './emoji/EmojiBottomRow';
import {EmojiPanel} from './emoji/EmojiPanel';
import {DEFAULT_EMOJI_CATEGORY, type EmojiCategoryId} from './emoji/emojis';
import {downloadAndInsertGif} from './emoji/gifInsert';
import {downloadAndSendSfx, previewSfx, stopSfxPreview} from './emoji/sfxInsert';
import type {GiphyGif} from './emoji/giphyService';
import type {MyInstantsSound} from './emoji/myinstantsService';
import {
  captureSystemClipboard,
  deleteClipboardItem,
  ensureClipboardLoaded,
  getClipboardItems,
  toggleClipboardPin,
} from './clipboard/clipboardStore';
import type {ClipboardItem} from './clipboard/types';
import {useClipboardPasteSuggestion} from './clipboard/useClipboardPasteSuggestion';
import type {
  ControllerAction,
  ControllerButton,
  ControllerSettings,
} from './controller/controllerSettings';
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
import {KeyLayoutProvider, useKeyLayoutContext} from './gesture/KeyLayoutContext';
import {
  destroyKeyPreview,
  hideAllKeyPreviews,
  initKeyPreview,
  setKeyPreviewTheme,
} from './KeyPreview';
import {AutocorrectPanel} from './autocorrect/AutocorrectPanel';
import {
  ensureAutocorrectLoaded,
  getAutocorrectSettings,
  reloadAutocorrectFromStorage,
  setAiAutoCorrectEnabled,
  setAutoApplyOnSpace,
  setAutocorrectEnabled,
} from './autocorrect/autocorrectStore';
import {
  getAutocorrectCandidate,
  getSuggestionBarAutocorrect,
  isDictionaryWord,
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
import {
  proofreadRecentTypingContext,
  type AiAutocorrectResult,
} from './autocorrect/aiAutocorrectService';
import {getActiveLanguage, preloadActiveDictionary, scheduleBackgroundEnglishSymSpellSeed} from './autocorrect/dictionaryManager';
import {GesturesPanel} from './gestures/GesturesPanel';
import {TranslatePanel} from './translate/TranslatePanel';
import {RewritePanel} from './rewrite/RewritePanel';
import {FormatPanel} from './format/FormatPanel';
import {MetricsPanel} from './metrics/MetricsPanel';
import {
  ensureMetricsLoaded,
  recordAutocorrectCorrection,
  recordKeystroke,
  recordMetricsSessionStart,
  recordWordCommitted,
} from './metrics/metricsStore';
import {OneHandPanel} from './onehand/OneHandPanel';
import {
  ensureOneHandLoaded,
  getOneHandLayout,
  getOneHandSettings,
  setOneHandEnabled,
  setOneHandSide,
  setOneHandStrength,
  subscribeOneHandSettings,
} from './onehand/oneHandStore';
import type {OneHandSettings} from './onehand/types';
import {
  endsWithRewriteCommand,
  REWRITE_COMMAND,
} from './rewrite/rewriteTrigger';
import {
  getCommaLauncherArmed,
  getGestureSettings,
  getLauncherAppPackage,
  getPeriodRewriteArmed,
  reloadGesturesFromStorage,
  setCommaLauncherArmed,
  setGestureSetting,
  setLauncherAppPackage,
  setPeriodRewriteArmed,
} from './gestures/gesturesStore';
import type {GestureSettings, LaunchableApp} from './gestures/types';
import {deferKeyboardSideEffect, triggerKeyHaptic} from './haptics';
import {keyboardBridge} from './keyboardBridge';
import {getKeyReactTag, subscribeKeyReactTags} from './keyReactTags';
import {
  CUSTOM_LAYOUTS_CHANGED_EVENT,
  ensureCustomLayoutsLoaded,
  isSwipeTypingDisabledForLayout,
} from './settings/customLayoutStore';
import {
  DIGITS_ROW,
  getKeyboardRows,
  type KeyDefinition,
  type KeyboardLayout,
} from './layouts/index';
import {shouldAutoCapitalizeShift} from './autoCapitalize';
import {
  ensureLearnedDictionaryLoaded,
  getLearnedCounts,
  recordLearnedWord,
} from './suggestions/learnedDictionary';
import {
  extractCurrentWord,
  getWordSuggestions,
} from './suggestions/wordSuggestions';
import {ensureApiKeysLoaded} from './settings/apiKeysStore';
import {ensureAiProviderLoaded} from './settings/aiProviderStore';
import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  KEYBOARD_LAYOUT_CHANGED_EVENT,
  parseLayoutEventPayload,
  updateKeyboardLayoutSetting,
} from './settings/layoutStore';
import {
  ensureThemeLoaded,
  getKeyboardColorScheme,
  getKeyboardDesign,
  getKeyboardCustomTheme,
  KEYBOARD_DESIGN_CHANGED_EVENT,
  KEYBOARD_THEME_CHANGED_EVENT,
  KEYBOARD_CUSTOM_THEME_CHANGED_EVENT,
} from './settings/themeStore';
import {
  KeyboardThemeProvider,
  useKeyboardTheme,
  useThemedStyles,
} from './KeyboardThemeContext';
import type {
  KeyboardColorScheme,
  KeyboardDesign,
  KeyboardLayoutSettings,
  KeyboardTheme,
} from './theme';
import {DEFAULT_KEYBOARD_LAYOUT_SETTINGS, getNonLettersKeyboardHeightDp, getNumberRowLayoutBoost} from './theme';
import {
  isLandscapeOrientation,
  layoutSettingsForOrientation,
} from './orientation';
import {useVoiceInput} from './voice/useVoiceInput';

const DOUBLE_TAP_MS = 350;
/** Debounced async refresh (phrases, essentials, native cursor sync). */
const SUGGESTION_FULL_REFRESH_DEBOUNCE_MS = 300;
const NATIVE_FAST_PATH_MIN_KEYS = 20;
const NATIVE_FAST_PATH_ENABLED = true;
const AI_AUTOCORRECT_LOG_PREFIX = '[AiAutocorrect]';

type NativeFastPathKeyEvent = {
  id?: string;
  type?: string;
  value?: string;
  text?: string;
  shiftConsumed?: boolean;
};

type AutocorrectHistoryEdit = {
  original: string;
  correction: string;
  boundary: string;
};

type AiAutocorrectSuggestion = Extract<
  AiAutocorrectResult,
  {kind: 'suggest'}
>;

function getAiAutocorrectContextMatch(
  context: string,
  original: string,
): {replaceLength: number; replacementSuffix: string} | null {
  if (context.endsWith(original)) {
    return {replaceLength: original.length, replacementSuffix: ''};
  }

  const trimmedEnd = context.replace(/\s+$/, '');
  if (!trimmedEnd.endsWith(original)) {
    return null;
  }

  const trailingWhitespace = context.slice(trimmedEnd.length);
  return {
    replaceLength: original.length + trailingWhitespace.length,
    replacementSuffix: trailingWhitespace,
  };
}

type ControllerFocus = {row: number; col: number};

type NativeControllerInput =
  | {kind: 'key'; action: 'down' | 'up'; key: string; keyCode?: number}
  | {kind: 'axis'; direction: 'up' | 'down' | 'left' | 'right'};

function isFocusableKey(key: KeyDefinition | undefined): key is KeyDefinition {
  return Boolean(key && key.type !== 'spacer');
}

function normalizeControllerFocus(
  rows: KeyDefinition[][],
  focus: ControllerFocus,
): ControllerFocus {
  const row = Math.max(0, Math.min(rows.length - 1, focus.row));
  const targetRow = rows[row] ?? [];
  if (targetRow.length === 0) {
    return {row: 0, col: 0};
  }
  let col = Math.max(0, Math.min(targetRow.length - 1, focus.col));
  if (isFocusableKey(targetRow[col])) {
    return {row, col};
  }
  for (let offset = 1; offset < targetRow.length; offset += 1) {
    const right = col + offset;
    const left = col - offset;
    if (isFocusableKey(targetRow[right])) return {row, col: right};
    if (isFocusableKey(targetRow[left])) return {row, col: left};
  }
  return {row, col: 0};
}

function moveControllerFocus(
  rows: KeyDefinition[][],
  focus: ControllerFocus,
  direction: 'up' | 'down' | 'left' | 'right',
): ControllerFocus {
  const normalized = normalizeControllerFocus(rows, focus);
  if (direction === 'left' || direction === 'right') {
    const row = rows[normalized.row] ?? [];
    const step = direction === 'right' ? 1 : -1;
    for (
      let col = normalized.col + step;
      col >= 0 && col < row.length;
      col += step
    ) {
      if (isFocusableKey(row[col])) {
        return {row: normalized.row, col};
      }
    }
    return normalized;
  }

  const step = direction === 'down' ? 1 : -1;
  for (
    let row = normalized.row + step;
    row >= 0 && row < rows.length;
    row += step
  ) {
    const candidate = normalizeControllerFocus(rows, {
      row,
      col: normalized.col,
    });
    if (isFocusableKey(rows[candidate.row]?.[candidate.col])) {
      return candidate;
    }
  }
  return normalized;
}

function parseControllerInput(raw: unknown): NativeControllerInput | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as NativeControllerInput;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function controllerActionForButton(
  settings: ControllerSettings,
  key: string,
): ControllerAction | null {
  const button = key as ControllerButton;
  const entries = Object.entries(settings.mappings) as Array<
    [ControllerAction, ControllerButton]
  >;
  return entries.find(([, mapped]) => mapped === button)?.[0] ?? null;
}

type LetterKeyboardRowsProps = {
  rows: KeyDefinition[][];
  layout: KeyboardLayout;
  modeType: KeyboardMode['type'];
  isUppercase: boolean;
  getIsUppercase: () => boolean;
  getLetterCommitText?: (keyValue: string) => string;
  shiftOn: boolean;
  capsLocked: boolean;
  onKeyPress: (keyDef: KeyDefinition) => void;
  onMultiTouchKeyCommit: (keyDef: KeyDefinition, text: string) => void;
  keyGestures?: KeyGesturesConfig;
  keyHeight?: number;
  rowStyle?: StyleProp<ViewStyle>;
  enterKeyNextLineEnabled: boolean;
  multiTouchEnabled?: boolean;
  focusedKeyId?: string | null;
};

const LetterKeyboardRows = React.memo(function LetterKeyboardRows({
  rows,
  layout,
  modeType,
  isUppercase,
  getIsUppercase,
  getLetterCommitText,
  shiftOn,
  capsLocked,
  onKeyPress,
  onMultiTouchKeyCommit,
  keyGestures,
  keyHeight,
  rowStyle,
  enterKeyNextLineEnabled,
  multiTouchEnabled,
  focusedKeyId,
}: LetterKeyboardRowsProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createKeyboardAppStyles);
  const multiTouchActive =
    multiTouchEnabled ??
    (modeType === 'typing' || modeType === 'essentials-form');

  return (
    <SwipeTypingKeysHost
      multiTouchEnabled={multiTouchActive}
      keyboardLayout={layout}
      isUppercase={layout === 'letters' && isUppercase}
      getIsUppercase={getIsUppercase}
      getLetterCommitText={getLetterCommitText}
      onMultiTouchKeyCommit={onMultiTouchKeyCommit}>
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
            keyHeight ?? (layout === 'numpad' ? theme.numpadKeyHeight : undefined)
          }
          variant={layout === 'numpad' ? 'numpad' : undefined}
          rowStyle={[
            layout === 'numpad' ? styles.numpadRow : undefined,
            rowStyle,
          ]}
          enterKeyNextLineEnabled={enterKeyNextLineEnabled}
          multiTouchDispatchEnabled={multiTouchActive}
          focusedKeyId={focusedKeyId}
        />
      ))}
    </SwipeTypingKeysHost>
  );
});

function sanitizeSuggestionText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value);
  return text.length > 0 ? text : null;
}

function computeTypingSuggestionBar(
  prefix: string,
  options: {fast: boolean; context?: string},
) {
  const fast = options.fast;
  const barAutocorrect =
    getAutocorrectSettings().enabled && prefix.length >= 2
      ? getSuggestionBarAutocorrect(prefix, {fast})
      : {keepTyped: null, correction: null};

  const phraseSuggestions =
    fast || !options.context ? [] : getPhraseSuggestions(options.context, 2);
  let wordSuggestions = fast
    ? []
    : getWordSuggestions(prefix, 3, {
        skipFuzzy: false,
        lightweight: true,
      });
  const reserved = new Set<string>();
  const keepTyped = sanitizeSuggestionText(barAutocorrect.keepTyped);
  const correction = sanitizeSuggestionText(barAutocorrect.correction);
  if (keepTyped) {
    reserved.add(keepTyped.toLowerCase());
  }
  if (correction) {
    reserved.add(correction.toLowerCase());
  }
  if (reserved.size > 0) {
    wordSuggestions = wordSuggestions.filter(
      word => word && !reserved.has(word.toLowerCase()),
    );
  }

  return {
    typedKeepSuggestion: keepTyped,
    autocorrectPreview: correction,
    suggestions: [...phraseSuggestions, ...wordSuggestions]
      .map(word => (word == null ? '' : String(word)))
      .filter(word => word.length > 0)
      .slice(0, 3),
  };
}

type KeyboardBodyProps = {
  controllerConnected: boolean;
  controllerSettings: ControllerSettings;
};

function KeyboardBody({
  controllerConnected,
  controllerSettings,
}: KeyboardBodyProps) {
  const theme = useKeyboardTheme();
  const layoutContext = useKeyLayoutContext();
  const {width: viewportWidth} = useWindowDimensions();
  const styles = useThemedStyles(createKeyboardAppStyles);
  const [mode, setMode] = useState<KeyboardMode>({type: 'typing'});
  const [layout, setLayout] = useState<KeyboardLayout>('letters');
  const [shiftOn, setShiftOn] = useState(true);
  const [capsLocked, setCapsLocked] = useState(false);
  const [enterKeyNextLineEnabled, setEnterKeyNextLineEnabled] =
    useState(false);
  const lastShiftTapRef = useRef(0);
  const userChoseLettersRef = useRef(false);
  const suggestionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const suggestionDictionariesReadyRef = useRef(false);
  const aiProofreadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiProofreadRunIdRef = useRef(0);
  const lastAiProofreadOriginalRef = useRef<string | null>(null);
  const livePrefixRef = useRef('');
  const lastInstantPrefixRef = useRef('');
  const nativeFastPathActiveRef = useRef(false);
  const instantSuggestionRafRef = useRef<number | null>(null);
  const autocorrectUndoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const autocorrectRedoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const lastTypingAtRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stoppedTyping, setStoppedTyping] = useState(true);
  const shiftOnRef = useRef(true);
  const capsLockedRef = useRef(false);
  const hasTypedInFieldRef = useRef(false);
  const emptyContextTrustworthyRef = useRef(true);
  const lastLetterCommitAtRef = useRef(0);
  const layoutRef = useRef<KeyboardLayout>('letters');
  const modeRef = useRef<KeyboardMode>({type: 'typing'});
  const isUppercaseRef = useRef(false);
  const clipboardPasteSuggestionRef =
    useRef<ReturnType<typeof useClipboardPasteSuggestion>['clipboardPasteSuggestion']>(null);
  const [prefersNumpad, setPrefersNumpad] = useState(false);
  const [inputInitialCapsMode, setInputInitialCapsMode] = useState(false);
  // Live offset used only while the resize overlay is active.
  const [resizeLiveOffset, setResizeLiveOffset] = useState(0);
  const [touchpadGestureActive, setTouchpadGestureActive] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [swipePreview, setSwipePreview] = useState<string | null>(null);
  const [essentialSuggestions, setEssentialSuggestions] = useState<Essential[]>(
    [],
  );
  const [essentialTriggerLength, setEssentialTriggerLength] = useState(0);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [essentials, setEssentials] = useState<Essential[]>([]);
  const [formKeyword, setFormKeyword] = useState('');
  const [formValue, setFormValue] = useState('');
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>(
    DEFAULT_EMOJI_CATEGORY,
  );
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifSearchActive, setGifSearchActive] = useState(false);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState('');
  const [emojiSearchActive, setEmojiSearchActive] = useState(false);
  const [sfxSearchQuery, setSfxSearchQuery] = useState('');
  const [sfxSearchActive, setSfxSearchActive] = useState(false);
  const [installingSfxId, setInstallingSfxId] = useState<string | null>(null);
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>(
    getGestureSettings(),
  );
  const [autocorrectSettings, setAutocorrectSettings] =
    useState<AutocorrectSettings>(getAutocorrectSettings());
  const [oneHandSettings, setOneHandSettings] = useState<OneHandSettings>(
    getOneHandSettings(),
  );
  const [autocorrectPreview, setAutocorrectPreview] = useState<string | null>(
    null,
  );
  const [typedKeepSuggestion, setTypedKeepSuggestion] = useState<string | null>(
    null,
  );
  const [aiAutocorrectSuggestion, setAiAutocorrectSuggestion] =
    useState<AiAutocorrectSuggestion | null>(null);
  const [isAiAutocorrectProcessing, setIsAiAutocorrectProcessing] =
    useState(false);
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
    refreshClipboardPasteSuggestion,
  } = useClipboardPasteSuggestion({enabled: clipboardPasteEnabled});

  const emojiCategoryRef = useRef<EmojiCategoryId>(DEFAULT_EMOJI_CATEGORY);
  const gifSearchActiveRef = useRef(false);
  const emojiSearchActiveRef = useRef(false);
  const sfxSearchActiveRef = useRef(false);

  shiftOnRef.current = shiftOn;
  capsLockedRef.current = capsLocked;
  layoutRef.current = layout;
  modeRef.current = mode;
  emojiCategoryRef.current = emojiCategory;
  gifSearchActiveRef.current = gifSearchActive;
  emojiSearchActiveRef.current = emojiSearchActive;
  sfxSearchActiveRef.current = sfxSearchActive;
  clipboardPasteSuggestionRef.current = clipboardPasteSuggestion;

  const isUppercase = shiftOn || capsLocked;
  isUppercaseRef.current = isUppercase;
  const getIsUppercase = useCallback(
    () =>
      layoutRef.current === 'letters' &&
      (shiftOnRef.current || capsLockedRef.current),
    [],
  );

  /** Uppercase at most one letter per shift tap — uses refs so fast typing can't double-cap. */
  const consumeLetterCommitText = useCallback((keyValue: string): string => {
    if (layoutRef.current !== 'letters' || !keyValue) {
      return keyValue;
    }
    if (capsLockedRef.current) {
      return keyValue.toUpperCase();
    }
    if (shiftOnRef.current) {
      shiftOnRef.current = false;
      setShiftOn(false);
      lastLetterCommitAtRef.current = Date.now();
      return keyValue.toUpperCase();
    }
    return keyValue.toLowerCase();
  }, []);
  const isFormMode = mode.type === 'essentials-form';
  const isClipboardMode = mode.type === 'clipboard';
  const isEssentialsListMode = mode.type === 'essentials-list';
  const isGesturesMode = mode.type === 'gestures';
  const isOneHandMode = mode.type === 'onehand';
  const isCalculatorMode = mode.type === 'calculator';
  const isTouchpadMode = mode.type === 'touchpad';
  const isTranslateMode = mode.type === 'translate';
  const isRewriteMode = mode.type === 'rewrite';
  const isFormatMode = mode.type === 'format';
  const isEmojiMode = mode.type === 'emoji';
  const isResizeMode = mode.type === 'resize';
  const isGifCategory = isEmojiMode && emojiCategory === 'gif';
  const isSfxCategory = isEmojiMode && emojiCategory === 'sfx';
  const isGifSearchMode = isGifCategory && gifSearchActive;
  const isSfxSearchMode = isSfxCategory && sfxSearchActive;
  const isEmojiSearchMode =
    isEmojiMode && !isGifCategory && !isSfxCategory && emojiSearchActive;
  const gestureEnabled =
    gestureSettings.swipeTyping &&
    layout === 'letters' &&
    mode.type === 'typing' &&
    !isSwipeTypingDisabledForLayout(theme.letterLayoutId);
  const controllerKeyboardActive =
    controllerSettings.enabled && controllerConnected && theme.isLandscape;

  const [customLayoutsTick, setCustomLayoutsTick] = useState(0);

  const rows = useMemo(() => {
    const baseRows = getKeyboardRows(layout, theme.letterLayoutId);
    if (layout === 'letters' && theme.numberRowEnabled) {
      return [DIGITS_ROW, ...baseRows];
    }
    return baseRows;
  }, [layout, theme.letterLayoutId, customLayoutsTick, theme.numberRowEnabled]);

  const numberRowLayoutBoost = useMemo(
    () => getNumberRowLayoutBoost(layout, theme),
    [layout, theme.keyGap, theme.keyHeight, theme.keyRowMargin, theme.numberRowEnabled],
  );
  const [controllerFocus, setControllerFocus] = useState<ControllerFocus>({
    row: 0,
    col: 0,
  });
  const controllerFocusRef = useRef(controllerFocus);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  controllerFocusRef.current = controllerFocus;
  const normalizedControllerFocus = normalizeControllerFocus(rows, controllerFocus);
  const focusedControllerKey =
    rows[normalizedControllerFocus.row]?.[normalizedControllerFocus.col];

  // Effective key height for letters when using keyboard resize (or persisted offset).
  // Positive offset: make keys taller → the rows block occupies more vertical space from the bottom,
  // so the top of the keyboard content (top row + suggestion above it) moves up on screen.
  // Negative offset: shrink keys + reduce padding so the keyboard "shrinks and fits in" the smaller window.
  const letterResizeBaseHeight =
    theme.keyboardHeightDp +
    (theme.numberRowEnabled ? theme.keyHeight + theme.keyRowMargin : 0);
  const rawResizeOffset =
    layout === 'letters'
      ? isResizeMode
        ? resizeLiveOffset
        : (theme.keyboardHeightOffset ?? 0)
      : 0;
  const resizeOffset =
    layout === 'letters'
      ? clampKeyboardResizeOffset(rawResizeOffset, letterResizeBaseHeight)
      : 0;
  const effectiveLetterKeyHeight =
    layout === 'letters' && resizeOffset !== 0
      ? (() => {
          const rowCount = Math.max(1, rows.length);
          if (resizeOffset > 0) {
            // Grow the letter keys vertically, distributing most of the extra height
            // across however many rows are visible (4 normally, 5 with number row).
            const grow = (resizeOffset * 0.78) / rowCount;
            return Math.round(theme.keyHeight + grow);
          }
          // Shrink keys enough that the content really fits inside the smaller window.
          const shrink = (Math.abs(resizeOffset) * 0.78) / rowCount;
          return Math.max(30, Math.round(theme.keyHeight - shrink));
        })()
      : undefined;

  const resizeRowsExtraMargin =
    layout === 'letters' && resizeOffset !== 0
      ? (() => {
          const rowCount = Math.max(1, rows.length);
          const delta = (resizeOffset * 0.22) / rowCount;
          return Math.max(0, Math.round(theme.keyRowMargin + delta));
        })()
      : undefined;

  const effectiveKeysPaddingTop =
    layout === 'letters' && resizeOffset < 0
      ? Math.max(0, theme.keysPaddingTop + Math.round(resizeOffset * 0.15))
      : theme.keysPaddingTop;

  const activeKeyboardHeightDp =
    layout === 'letters'
      ? computeResizedKeyboardHeightDp(letterResizeBaseHeight, rawResizeOffset)
      : Math.max(
          MIN_KEYBOARD_HEIGHT_DP,
          Math.min(
            MAX_KEYBOARD_HEIGHT_DP,
            Math.round(getNonLettersKeyboardHeightDp(layout, theme, letterResizeBaseHeight)),
          ),
        );

  const emojiPanelScrollHeight = Math.max(
    120,
    activeKeyboardHeightDp -
      theme.suggestionBarHeight -
      effectiveKeysPaddingTop -
      theme.imeStripClearance -
      (theme.keyHeight + theme.keyRowMargin) -
      theme.emojiPanelGap,
  );

  useEffect(() => {
    void ensureCustomLayoutsLoaded();
    const subscription = DeviceEventEmitter.addListener(
      CUSTOM_LAYOUTS_CHANGED_EVENT,
      () => {
        setCustomLayoutsTick(tick => tick + 1);
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void keyboardBridge.getInputSupportsNewline().then(supports => {
      setEnterKeyNextLineEnabled(Boolean(supports));
    });
    const subscription = DeviceEventEmitter.addListener(
      'keyboardInputSupportsNewline',
      (supports: boolean) => {
        setEnterKeyNextLineEnabled(Boolean(supports));
      },
    );
    return () => subscription.remove();
  }, []);

  // Sync live resize offset when entering the resize overlay.
  useEffect(() => {
    if (isResizeMode) {
      setResizeLiveOffset(theme.keyboardHeightOffset ?? 0);
    }
  }, [isResizeMode, theme.keyboardHeightOffset]);

  useEffect(() => {
    initKeyPreview();
    return () => destroyKeyPreview();
  }, []);

  useEffect(() => {
    hideAllKeyPreviews();
  }, [layout]);

  useEffect(() => {
    const fontAsset =
      theme.design === 'macintosh'
        ? 'fonts/Chicago.ttf'
        : 'fonts/Geist-VariableFont_wght.ttf';
    setKeyPreviewTheme(
      theme.letterKey,
      theme.label,
      fontAsset,
      theme.keyRadius,
    );
  }, [theme.design, theme.keyRadius, theme.label, theme.letterKey]);

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
    // Make delete/pin etc. feel instant: the in-memory list was already
    // mutated by the specific operation; reflect it right away.
    setClipboardItems(getClipboardItems());
    refreshClipboardPasteSuggestion?.();

    // Pull in any new system clipboard content in the background.
    void (async () => {
      await ensureClipboardLoaded().catch(() => {});
      await captureSystemClipboard().catch(() => null);
      setClipboardItems(getClipboardItems());
      refreshClipboardPasteSuggestion?.();
    })();
  }, [refreshClipboardPasteSuggestion]);

  const resetCase = useCallback(() => {
    shiftOnRef.current = false;
    capsLockedRef.current = false;
    setShiftOn(false);
    setCapsLocked(false);
  }, []);

  const syncAutoCapitalizeShift = useCallback(
    (
      context: string,
      options: {fieldWasCleared?: boolean} = {},
    ) => {
      if (!theme.autoCapitalizeEnabled) {
        return;
      }
      if (capsLockedRef.current) {
        return;
      }
      if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
        return;
      }

      if (context.length > 0) {
        emptyContextTrustworthyRef.current = true;
      } else if (hasTypedInFieldRef.current) {
        emptyContextTrustworthyRef.current = false;
      }

      const recentLetterCommit =
        Date.now() - lastLetterCommitAtRef.current < 150;

      const shouldCap = shouldAutoCapitalizeShift(context, {
        inputRequestsInitialCaps: inputInitialCapsMode,
        hasTypedSinceFocus: hasTypedInFieldRef.current,
        emptyContextTrustworthy: emptyContextTrustworthyRef.current,
        recentLetterCommit,
        fieldWasCleared: options.fieldWasCleared ?? false,
      });
      if (shouldCap !== shiftOnRef.current) {
        shiftOnRef.current = shouldCap;
        setShiftOn(shouldCap);
      }
    },
    [inputInitialCapsMode, theme.autoCapitalizeEnabled],
  );

  const resetToMainAlphabetView = useCallback(() => {
    // Update refs immediately so guards and the next paint see the main alphabet view.
    layoutRef.current = 'letters';
    modeRef.current = {type: 'typing'};
    capsLockedRef.current = false;
    emojiCategoryRef.current = DEFAULT_EMOJI_CATEGORY;
    gifSearchActiveRef.current = false;
    emojiSearchActiveRef.current = false;
    sfxSearchActiveRef.current = false;
    livePrefixRef.current = '';

    setMode({type: 'typing'});
    setLayout('letters');
    setEmojiCategory(DEFAULT_EMOJI_CATEGORY);
    setEmojiSearchQuery('');
    setEmojiSearchActive(false);
    setGifSearchQuery('');
    setGifSearchActive(false);
    setSfxSearchQuery('');
    setSfxSearchActive(false);
    setInstallingSfxId(null);
    stopSfxPreview();
    setFormKeyword('');
    setFormValue('');
    setCalculatorDisplay('0');
    setCurrentPrefix('');
    setSuggestions([]);
    setEssentialSuggestions([]);
    setEssentialTriggerLength(0);
    setAutocorrectPreview(null);
    setTypedKeepSuggestion(null);
    setAiAutocorrectSuggestion(null);
    setIsAiAutocorrectProcessing(false);
    setStoppedTyping(true);
    setCapsLocked(false);

    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (suggestionRefreshTimerRef.current) {
      clearTimeout(suggestionRefreshTimerRef.current);
      suggestionRefreshTimerRef.current = null;
    }
    if (aiProofreadTimerRef.current) {
      clearTimeout(aiProofreadTimerRef.current);
      aiProofreadTimerRef.current = null;
    }
    aiProofreadRunIdRef.current += 1;
    lastAiProofreadOriginalRef.current = null;

    autocorrectUndoStackRef.current = [];
    autocorrectRedoStackRef.current = [];
    userChoseLettersRef.current = false;
    hasTypedInFieldRef.current = false;
    emptyContextTrustworthyRef.current = true;
    lastLetterCommitAtRef.current = 0;
    capsLockedRef.current = false;
    shiftOnRef.current = false;
    setShiftOn(false);
    setResizeLiveOffset(0);

    void keyboardBridge.getInputInitialCapsMode().then(mode => {
      setInputInitialCapsMode(Boolean(mode));
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
      });
    });
  }, [syncAutoCapitalizeShift]);

  useEffect(() => {
    const hiddenSubscription = DeviceEventEmitter.addListener(
      'keyboardHidden',
      () => {
        stopSfxPreview();
        resetToMainAlphabetView();
      },
    );
    const sessionSubscription = DeviceEventEmitter.addListener(
      'keyboardSessionStart',
      () => {
        resetToMainAlphabetView();
      },
    );
    return () => {
      hiddenSubscription.remove();
      sessionSubscription.remove();
    };
  }, [resetToMainAlphabetView]);

  const reloadGestures = useCallback(async () => {
    await reloadGesturesFromStorage();
    setGestureSettings(getGestureSettings());
    setLauncherAppPackageState(getLauncherAppPackage());
    setCommaLauncherActive(getCommaLauncherArmed());
    setPeriodRewriteActive(getPeriodRewriteArmed());
  }, []);

  useEffect(() => {
    void keyboardBridge.getInputInitialCapsMode().then(mode => {
      setInputInitialCapsMode(Boolean(mode));
    });
    const capsSubscription = DeviceEventEmitter.addListener(
      'keyboardInputInitialCapsMode',
      (mode: boolean) => {
        hasTypedInFieldRef.current = false;
        emptyContextTrustworthyRef.current = true;
        lastLetterCommitAtRef.current = 0;
        setInputInitialCapsMode(Boolean(mode));
        void keyboardBridge.getTextBeforeCursor(96).then(context => {
          syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
        });
      },
    );
    const shownSubscription = DeviceEventEmitter.addListener('keyboardShown', () => {
      hasTypedInFieldRef.current = false;
      emptyContextTrustworthyRef.current = true;
      lastLetterCommitAtRef.current = 0;
      void reloadGestures();
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
      });
    });
    return () => {
      capsSubscription.remove();
      shownSubscription.remove();
    };
  }, [reloadGestures, syncAutoCapitalizeShift]);

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
    await Promise.all([
      ensureLearnedDictionaryLoaded(),
      ensureLearnedPhrasesLoaded(),
    ]);
    setAutocorrectSettings(getAutocorrectSettings());
  }, []);

  const stoppedTypingRef = useRef(true);

  const markTyping = useCallback(() => {
    lastTypingAtRef.current = Date.now();
    aiProofreadRunIdRef.current += 1;
    lastAiProofreadOriginalRef.current = null;
    setAiAutocorrectSuggestion(current => (current === null ? current : null));
    setIsAiAutocorrectProcessing(current => (current ? false : current));
    if (stoppedTypingRef.current) {
      stoppedTypingRef.current = false;
      setStoppedTyping(false);
    }
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      typingIdleTimerRef.current = null;
      stoppedTypingRef.current = true;
      setStoppedTyping(true);
    }, 450);
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

  const openTouchpad = useCallback(() => {
    keyboardBridge.setTouchpadGestureConsuming(false);
    setTouchpadGestureActive(false);
    setMode({type: 'touchpad'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openResize = useCallback(() => {
    setMode({type: 'resize'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openMetrics = useCallback(() => {
    setMode({type: 'metrics'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openOneHand = useCallback(() => {
    setMode({type: 'onehand'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const closeResize = useCallback((saveOffset?: number) => {
    if (typeof saveOffset === 'number') {
      const baseHeight =
        theme.keyboardHeightDp +
        (theme.numberRowEnabled ? theme.keyHeight + theme.keyRowMargin : 0);
      void updateKeyboardLayoutSetting(
        'keyboardHeightOffset',
        clampKeyboardResizeOffset(saveOffset, baseHeight),
      );
    }
    // Clear live so the height effect immediately falls back to the (possibly just saved or previous) persisted value.
    setResizeLiveOffset(0);
    setMode({type: 'typing'});
    setLayout('letters');
    resetCase();
  }, [
    resetCase,
    theme.keyboardHeightDp,
    theme.keyHeight,
    theme.keyRowMargin,
    theme.numberRowEnabled,
  ]);

  const openFormatPanel = useCallback(async () => {
    if (isListening) {
      await toggleListening();
    }
    if (mode.type !== 'typing' && mode.type !== 'emoji') {
      closeItemsFlow();
    }
    setMode({type: 'format'});
    setLayout('letters');
    resetCase();
  }, [closeItemsFlow, isListening, mode.type, resetCase, toggleListening]);

  const closeFormatPanel = useCallback(() => {
    setMode({type: 'typing'});
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

  const openClipboard = useCallback(() => {
    // Render the panel right now using whatever is already in the in-memory
    // clipboard store (populated at startup or by previous sessions). This is
    // the main thing that makes "open clipboard" feel fast.
    setClipboardItems(getClipboardItems());
    // Also refresh the quick-paste suggestion pill state while we're at it.
    refreshClipboardPasteSuggestion?.();

    setMode({type: 'clipboard'});
    setLayout('letters');
    resetCase();

    // Capture current system clip (text/image) in the background.
    void (async () => {
      await ensureClipboardLoaded().catch(() => {});
      await captureSystemClipboard().catch(() => null);
      setClipboardItems(getClipboardItems());
      refreshClipboardPasteSuggestion?.();
    })();
  }, [refreshClipboardPasteSuggestion, resetCase]);

  const toggleEmojiPanel = useCallback(async () => {
    if (mode.type === 'emoji') {
      setGifSearchQuery('');
      setGifSearchActive(false);
      setEmojiSearchQuery('');
      setEmojiSearchActive(false);
      setSfxSearchQuery('');
      setSfxSearchActive(false);
      setInstallingSfxId(null);
      stopSfxPreview();
      setMode({type: 'typing'});
      setLayout('letters');
      resetCase();
      return;
    }
    if (isListening) {
      await toggleListening();
    }
    setEmojiCategory(DEFAULT_EMOJI_CATEGORY);
    setGifSearchQuery('');
    setGifSearchActive(false);
    setEmojiSearchQuery('');
    setEmojiSearchActive(false);
            setSfxSearchQuery('');
            setSfxSearchActive(false);
            setInstallingSfxId(null);
            stopSfxPreview();
            setMode({type: 'emoji'});
            setLayout('letters');
            resetCase();
  }, [isListening, mode.type, resetCase, toggleListening]);

  useEffect(() => {
    if (emojiCategory === 'gif') {
      setEmojiSearchQuery('');
      setEmojiSearchActive(false);
      setSfxSearchQuery('');
      setSfxSearchActive(false);
      stopSfxPreview();
    } else if (emojiCategory === 'sfx') {
      setGifSearchQuery('');
      setGifSearchActive(false);
      setEmojiSearchQuery('');
      setEmojiSearchActive(false);
    } else {
      setGifSearchQuery('');
      setGifSearchActive(false);
      setSfxSearchQuery('');
      setSfxSearchActive(false);
      stopSfxPreview();
    }
  }, [emojiCategory]);

  const toggleItemsMenu = useCallback(() => {
    if (mode.type === 'translate') {
      setMode({type: 'typing'});
      setLayout('letters');
      resetCase();
      return;
    }
    if (mode.type === 'touchpad') {
      keyboardBridge.setTouchpadGestureConsuming(false);
      setTouchpadGestureActive(false);
      closeItemsFlow();
      return;
    }
    if (mode.type === 'rewrite') {
      closeRewritePanel();
      return;
    }
    if (mode.type === 'format') {
      closeFormatPanel();
      return;
    }
    if (mode.type === 'typing' || mode.type === 'emoji') {
      openItemsMenu();
      return;
    }
    closeItemsFlow();
  }, [closeItemsFlow, closeFormatPanel, closeRewritePanel, mode.type, openItemsMenu, resetCase]);

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

  const refreshSuggestions = useCallback(async (options?: {fast?: boolean}) => {
    if (
      layout !== 'letters' ||
      isFormMode ||
      isClipboardMode ||
      isEmojiMode ||
      isRewriteMode ||
      isFormatMode ||
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
    if (context.length === 0 && emptyContextTrustworthyRef.current) {
      hasTypedInFieldRef.current = false;
      livePrefixRef.current = '';
    }
    syncAutoCapitalizeShift(context, {
      fieldWasCleared:
        context.length === 0 && emptyContextTrustworthyRef.current,
    });
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

    if (!suggestionDictionariesReadyRef.current) {
      await Promise.all([
        ensureLearnedDictionaryLoaded(),
        ensureLearnedPhrasesLoaded(),
        ensureAutocorrectLoaded(),
      ]);
      suggestionDictionariesReadyRef.current = true;
    }

    const prefix = extractCurrentWord(context);
    livePrefixRef.current = prefix;

    const fast = options?.fast ?? false;
    const barState = computeTypingSuggestionBar(prefix, {fast, context});

    startTransition(() => {
      setCurrentPrefix(prefix);
      setTypedKeepSuggestion(barState.typedKeepSuggestion);
      setAutocorrectPreview(barState.autocorrectPreview);
      setSuggestions(barState.suggestions);
      setEssentialSuggestions([]);
      setEssentialTriggerLength(0);
    });
  }, [
    isClipboardMode,
    isEmojiMode,
    isFormMode,
    isRewriteMode,
    isFormatMode,
    isTranslateMode,
    layout,
    syncAutoCapitalizeShift,
  ]);

  const applyInstantSuggestionBar = useCallback((prefix: string) => {
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }
    if (prefix === lastInstantPrefixRef.current) {
      return;
    }
    if (prefix.length > 0 && prefix.length < 3) {
      return;
    }

    const flush = () => {
      instantSuggestionRafRef.current = null;
      const nextPrefix = livePrefixRef.current;
      if (nextPrefix === lastInstantPrefixRef.current) {
        return;
      }
      lastInstantPrefixRef.current = nextPrefix;

      if (!nextPrefix) {
        setCurrentPrefix('');
        setTypedKeepSuggestion(null);
        setAutocorrectPreview(null);
        setEssentialSuggestions([]);
        setEssentialTriggerLength(0);
        // Hinglish / Franglais: keep preferred-language starters visible between words.
        if (getActiveLanguage() === 'hi-en' || getActiveLanguage() === 'fr-en') {
          const barState = computeTypingSuggestionBar('', {fast: true});
          setSuggestions(barState.suggestions);
        } else {
          setSuggestions([]);
        }
        return;
      }

      const barState = computeTypingSuggestionBar(nextPrefix, {fast: true});
      setCurrentPrefix(nextPrefix);
      setTypedKeepSuggestion(barState.typedKeepSuggestion);
      setAutocorrectPreview(barState.autocorrectPreview);
      setSuggestions(barState.suggestions);
      setEssentialSuggestions([]);
      setEssentialTriggerLength(0);
    };

    if (instantSuggestionRafRef.current !== null) {
      return;
    }
    instantSuggestionRafRef.current = requestAnimationFrame(flush);
  }, []);

  const recordAutocorrectHistory = useCallback(
    (edit: AutocorrectHistoryEdit) => {
      if (!edit.original || edit.original === edit.correction) {
        return;
      }
      autocorrectUndoStackRef.current = [
        ...autocorrectUndoStackRef.current.slice(-9),
        edit,
      ];
      autocorrectRedoStackRef.current = [];
      recordAutocorrectCorrection(edit.original, edit.correction);
    },
    [],
  );

  const applyAiAutocorrectEdit = useCallback(
    async (
      edit:
        | AiAutocorrectSuggestion
        | Extract<AiAutocorrectResult, {kind: 'auto'}>,
    ) => {
      const context = await keyboardBridge.getTextBeforeCursor(260);
      const match = getAiAutocorrectContextMatch(context, edit.original);
      if (!match) {
        console.log(AI_AUTOCORRECT_LOG_PREFIX, 'apply skipped: context changed', {
          original: edit.original,
          correction: edit.correction,
          contextTail: context.slice(-80),
        });
        return false;
      }
      console.log(AI_AUTOCORRECT_LOG_PREFIX, 'applying correction', {
        original: edit.original,
        correction: edit.correction,
        replaceLength: match.replaceLength,
      });
      keyboardBridge.replaceWordPrefix(
        match.replaceLength,
        edit.correction + match.replacementSuffix,
      );
      recordAutocorrectHistory({
        original: edit.original,
        correction: edit.correction,
        boundary: match.replacementSuffix,
      });
      lastAiProofreadOriginalRef.current = edit.correction;
      setAiAutocorrectSuggestion(null);
      requestAnimationFrame(() => {
        void refreshSuggestions();
      });
      return true;
    },
    [recordAutocorrectHistory, refreshSuggestions],
  );

  const scheduleAiProofread = useCallback(
    (delayMs = 900) => {
      if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
        console.log(AI_AUTOCORRECT_LOG_PREFIX, 'schedule skipped: not typing letters', {
          layout: layoutRef.current,
          mode: modeRef.current.type,
        });
        return;
      }
      const settings = getAutocorrectSettings();
      if (!settings.enabled || !settings.aiAutoCorrectEnabled) {
        console.log(AI_AUTOCORRECT_LOG_PREFIX, 'schedule skipped: setting off', {
          enabled: settings.enabled,
          aiAutoCorrectEnabled: settings.aiAutoCorrectEnabled,
        });
        return;
      }
      if (aiProofreadTimerRef.current) {
        clearTimeout(aiProofreadTimerRef.current);
      }

      const runId = aiProofreadRunIdRef.current + 1;
      aiProofreadRunIdRef.current = runId;
      console.log(AI_AUTOCORRECT_LOG_PREFIX, 'scheduled', {delayMs, runId});
      aiProofreadTimerRef.current = setTimeout(() => {
        aiProofreadTimerRef.current = null;
        void (async () => {
          if (
            layoutRef.current !== 'letters' ||
            modeRef.current.type !== 'typing'
          ) {
            console.log(AI_AUTOCORRECT_LOG_PREFIX, 'run skipped: not typing letters', {
              layout: layoutRef.current,
              mode: modeRef.current.type,
              runId,
            });
            return;
          }
          const context = await keyboardBridge.getTextBeforeCursor(260);
          if (aiProofreadRunIdRef.current !== runId) {
            console.log(AI_AUTOCORRECT_LOG_PREFIX, 'run skipped: stale run', {
              runId,
              currentRunId: aiProofreadRunIdRef.current,
            });
            return;
          }
          console.log(AI_AUTOCORRECT_LOG_PREFIX, 'running proofread', {
            runId,
            contextTail: context.slice(-120),
          });
          setIsAiAutocorrectProcessing(true);
          try {
            const result = await proofreadRecentTypingContext(context);
            if (aiProofreadRunIdRef.current !== runId || result.kind === 'none') {
              console.log(AI_AUTOCORRECT_LOG_PREFIX, 'run finished: no correction', {
                runId,
                stale: aiProofreadRunIdRef.current !== runId,
                resultKind: result.kind,
              });
              return;
            }
            if (
              lastAiProofreadOriginalRef.current === result.original ||
              !getAiAutocorrectContextMatch(context, result.original)
            ) {
              console.log(AI_AUTOCORRECT_LOG_PREFIX, 'result skipped: context/original gate', {
                runId,
                original: result.original,
                lastOriginal: lastAiProofreadOriginalRef.current,
                contextTail: context.slice(-120),
              });
              return;
            }
            if (result.kind === 'auto') {
              console.log(AI_AUTOCORRECT_LOG_PREFIX, 'auto result', {
                original: result.original,
                correction: result.correction,
              });
              await applyAiAutocorrectEdit(result);
              return;
            }
            console.log(AI_AUTOCORRECT_LOG_PREFIX, 'suggestion result', {
              original: result.original,
              correction: result.correction,
            });
            setAiAutocorrectSuggestion(result);
            lastAiProofreadOriginalRef.current = result.original;
          } finally {
            if (aiProofreadRunIdRef.current === runId) {
              setIsAiAutocorrectProcessing(false);
            }
          }
        })();
      }, delayMs);
    },
    [applyAiAutocorrectEdit],
  );

  const scheduleRefreshSuggestions = useCallback(() => {
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }

    applyInstantSuggestionBar(livePrefixRef.current);

    if (suggestionRefreshTimerRef.current) {
      clearTimeout(suggestionRefreshTimerRef.current);
    }
    suggestionRefreshTimerRef.current = setTimeout(() => {
      suggestionRefreshTimerRef.current = null;
      const stillTyping = Date.now() - lastTypingAtRef.current < 200;
      void refreshSuggestions({fast: stillTyping});
    }, SUGGESTION_FULL_REFRESH_DEBOUNCE_MS);
  }, [applyInstantSuggestionBar, refreshSuggestions]);

  useEffect(() => {
    return () => {
      if (suggestionRefreshTimerRef.current) {
        clearTimeout(suggestionRefreshTimerRef.current);
      }
      if (aiProofreadTimerRef.current) {
        clearTimeout(aiProofreadTimerRef.current);
      }
    };
  }, []);

  const commitTypedWordBoundary = useCallback(
    async (
      insertBoundary: () => void,
      boundary = '',
      typedWordFallback = '',
    ) => {
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
        scheduleAiProofread();
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
        return;
      }

      if (!suggestionDictionariesReadyRef.current) {
        await Promise.all([
          ensureLearnedDictionaryLoaded(),
          ensureLearnedPhrasesLoaded(),
          ensureAutocorrectLoaded(),
        ]);
        suggestionDictionariesReadyRef.current = true;
      }

      let typedWord = extractCurrentWord(context);
      // Some editors return stale/empty text-before-cursor; fall back to the
      // live letter prefix we already tracked from key commits.
      if (
        typedWordFallback &&
        (!typedWord ||
          (typedWordFallback.length > typedWord.length &&
            typedWordFallback.toLowerCase().endsWith(typedWord.toLowerCase())))
      ) {
        typedWord = typedWordFallback;
      }
      const autocorrectOn = getAutocorrectSettings().enabled;

      if (autocorrectOn && typedWord.length >= 2) {
        const phraseFix = getPhraseCorrection(context, typedWord);
        if (phraseFix) {
          const original = context.slice(
            Math.max(0, context.length - phraseFix.replaceLength),
          );
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
          scheduleAiProofread();
          if (boundary) {
            recordAutocorrectHistory({
              original,
              correction: phraseFix.phrase,
              boundary,
            });
          }
          requestAnimationFrame(() => {
            void refreshSuggestions();
          });
          return;
        }

        const candidate = getAutocorrectCandidate(typedWord, {
          lightweight: true,
          skipFrequentScan: true,
        });
        if (shouldAutoApply(candidate, typedWord)) {
          keyboardBridge.replaceWordPrefix(typedWord.length, candidate!.correction);
          const correctionParts = candidate!.correction.split(/\s+/);
          for (const part of correctionParts) {
            recordLearnedWord(part);
          }
          learnPhrasesFromContext(
            context.slice(0, Math.max(0, context.length - typedWord.length)) +
              candidate!.correction,
          );
          insertBoundary();
          scheduleAiProofread();
          if (boundary) {
            recordAutocorrectHistory({
              original: typedWord,
              correction: candidate!.correction,
              boundary,
            });
          }
          requestAnimationFrame(() => {
            void refreshSuggestions();
          });
          return;
        }
      }

      if (typedWord) {
        // Only auto-learn dictionary words (or words the user already taught via
        // the keep chip). Learning OOV typos/run-ons used to permanently disable
        // autocorrect for that token.
        const lower = typedWord.toLowerCase();
        if (isDictionaryWord(lower) || (getLearnedCounts().get(lower) ?? 0) > 0) {
          recordLearnedWord(typedWord);
        }
        recordWordCommitted();
      }
      learnPhrasesFromContext(context);

      insertBoundary();
      scheduleAiProofread();
      requestAnimationFrame(() => {
        void refreshSuggestions();
      });
    },
    [
      openRewritePanel,
      recordAutocorrectHistory,
      refreshSuggestions,
      scheduleAiProofread,
    ],
  );

  useEffect(() => {
    if (layout !== 'letters' || mode.type !== 'typing') {
      return;
    }
    void keyboardBridge.getTextBeforeCursor(96).then(syncAutoCapitalizeShift);
  }, [layout, mode.type, syncAutoCapitalizeShift]);

  useEffect(() => {
    if (theme.autoCapitalizeEnabled || capsLockedRef.current) {
      return;
    }
    if (shiftOnRef.current) {
      shiftOnRef.current = false;
      setShiftOn(false);
    }
  }, [theme.autoCapitalizeEnabled]);

  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      Promise.all([
        ensureEssentialsLoaded(),
        ensureClipboardLoaded(),
        ensureLearnedDictionaryLoaded(),
        ensureLearnedPhrasesLoaded(),
        ensureAutocorrectLoaded(),
        ensureApiKeysLoaded(),
        ensureAiProviderLoaded(),
        ensureMetricsLoaded(),
        ensureOneHandLoaded(),
        reloadGesturesFromStorage(),
      ]).finally(() => {
        reloadEssentials();
        void reloadClipboard();
        void reloadGestures();
        void reloadAutocorrect();
        setOneHandSettings(getOneHandSettings());
        recordMetricsSessionStart();
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
    return subscribeOneHandSettings(() => {
      setOneHandSettings(getOneHandSettings());
    });
  }, []);

  const oneHandLayout = useMemo(
    () => getOneHandLayout(oneHandSettings, viewportWidth),
    [oneHandSettings, viewportWidth],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      layoutContext?.requestRemeasure();
    }, 80);
    return () => clearTimeout(timer);
  }, [
    layoutContext,
    oneHandLayout.active,
    oneHandLayout.alignSelf,
    oneHandLayout.width,
  ]);

  useEffect(() => {
    const finalHeight =
      layout === 'letters'
        ? computeResizedKeyboardHeightDp(
            letterResizeBaseHeight,
            isResizeMode ? resizeLiveOffset : (theme.keyboardHeightOffset ?? 0),
          )
        : Math.max(
            MIN_KEYBOARD_HEIGHT_DP,
            Math.min(
              MAX_KEYBOARD_HEIGHT_DP,
              Math.round(getNonLettersKeyboardHeightDp(layout, theme, letterResizeBaseHeight)),
            ),
          );

    keyboardBridge.setKeyboardHeight(finalHeight);

    // IMPORTANT for smooth resize drag:
    // Do NOT remeasure keys on every live offset change while the resize overlay is active.
    // Remeasure is expensive (touches all key bounds for gesture typing etc).
    // The native window size change is enough for the visual resize.
    // We remeasure once when leaving resize mode (via normal effects) or on session changes.
    if (!isResizeMode) {
      const timer = setTimeout(() => {
        layoutContext?.requestRemeasure();
      }, 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [
    isResizeMode,
    layout,
    layoutContext,
    letterResizeBaseHeight,
    resizeLiveOffset,
    theme,
    theme.keyboardHeightOffset,
    theme.numberRowEnabled,
  ]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'keyboardOrientationChange',
      () => {
        layoutContext?.requestRemeasure();
      },
    );
    return () => subscription.remove();
  }, [layoutContext]);

  useEffect(() => {
    setControllerFocus(current => normalizeControllerFocus(rows, current));
  }, [rows]);

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
      const nextLocked = !capsLockedRef.current;
      capsLockedRef.current = nextLocked;
      shiftOnRef.current = false;
      setCapsLocked(nextLocked);
      setShiftOn(false);
      return;
    }

    if (capsLockedRef.current) {
      capsLockedRef.current = false;
      shiftOnRef.current = false;
      setCapsLocked(false);
      setShiftOn(false);
      return;
    }

    const nextShift = !shiftOnRef.current;
    shiftOnRef.current = nextShift;
    setShiftOn(nextShift);
  }, []);

  const handleEssentialSuggestionSelect = useCallback(
    (essential: {value: string}) => {
      markTyping();
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
    [essentialTriggerLength, markTyping, refreshSuggestions],
  );

  const handleSuggestionSelect = useCallback(
    (word: string) => {
      markTyping();
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        const isAutocorrectCorrection =
          autocorrectPreview != null && word === autocorrectPreview;

        if (isAutocorrectCorrection && currentPrefix) {
          // Autocorrect corrections (including ones with punctuation like "i guess," or
          // multi-word like "i don't know,") always replace the current typed letters only.
          if (word.includes(' ')) {
            recordLearnedPhrase(word);
            for (const part of word.split(' ')) {
              recordLearnedWord(part);
            }
          } else {
            recordLearnedWord(word);
          }
          recordAutocorrectCorrection(currentPrefix, word);
          keyboardBridge.replaceWordPrefix(currentPrefix.length, word);
        } else if (word.includes(' ')) {
          // Phrase suggestions replace a run of recent words from context.
          const trailing = extractTrailingWords(context, 4);
          const replaceLength = trailing.join(' ').length;
          keyboardBridge.replaceWordPrefix(replaceLength, word);
          recordLearnedPhrase(word);
          for (const part of word.split(' ')) {
            recordLearnedWord(part);
          }
          recordWordCommitted();
        } else {
          recordLearnedWord(word);
          if (!currentPrefix) {
            keyboardBridge.insertText(word);
          } else {
            keyboardBridge.replaceWordPrefix(currentPrefix.length, word);
          }
          recordWordCommitted();
        }
        keyboardBridge.insertText(' ');
        scheduleAiProofread();
        if (shiftOn && !capsLocked) {
          setShiftOn(false);
        }
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
      });
    },
    [
      autocorrectPreview,
      capsLocked,
      currentPrefix,
      markTyping,
      refreshSuggestions,
      scheduleAiProofread,
      shiftOn,
    ],
  );

  const handleAiAutocorrectSelect = useCallback(() => {
    const suggestion = aiAutocorrectSuggestion;
    if (!suggestion) {
      return;
    }
    markTyping();
    void applyAiAutocorrectEdit(suggestion);
  }, [aiAutocorrectSuggestion, applyAiAutocorrectEdit, markTyping]);

  const handleClipboardPasteSelect = useCallback(() => {
    const item = clipboardPasteSuggestion;
    if (!item) {
      return;
    }
    markTyping();
    clearClipboardPasteSuggestion(item.fingerprint);
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
    markTyping,
    scheduleRefreshSuggestions,
  ]);

  const handleClipboardSelect = useCallback((item: ClipboardItem) => {
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
  }, [closeItemsFlow]);

  const handleClipboardDelete = useCallback((item: ClipboardItem) => {
    void deleteClipboardItem(item.id).then(reloadClipboard);
  }, [reloadClipboard]);

  const handleClipboardTogglePin = useCallback((item: ClipboardItem) => {
    void toggleClipboardPin(item.id).then(reloadClipboard);
  }, [reloadClipboard]);

  const handleKeyPressImpl = useCallback(
    (keyDef: KeyDefinition) => {
      const mode = modeRef.current;
      const layout = layoutRef.current;
      const shiftOn = shiftOnRef.current;
      const capsLocked = capsLockedRef.current;
      const isUppercase = isUppercaseRef.current;

      if (mode.type === 'typing' && clipboardPasteSuggestionRef.current) {
        clearClipboardPasteSuggestion();
      }

      if (mode.type === 'emoji') {
        const category = emojiCategoryRef.current;
        const gifSearching =
          category === 'gif' && gifSearchActiveRef.current;
        const sfxSearching =
          category === 'sfx' && sfxSearchActiveRef.current;
        const emojiSearching =
          category !== 'gif' &&
          category !== 'sfx' &&
          emojiSearchActiveRef.current;
        switch (keyDef.type) {
          case 'numbers':
            setGifSearchQuery('');
            setGifSearchActive(false);
            setEmojiSearchQuery('');
            setEmojiSearchActive(false);
            setSfxSearchQuery('');
            setSfxSearchActive(false);
            stopSfxPreview();
            setMode({type: 'typing'});
            setLayout('letters');
            resetCase();
            return;
          case 'enter':
            if (gifSearching) {
              setGifSearchActive(false);
              return;
            }
            if (sfxSearching) {
              setSfxSearchActive(false);
              return;
            }
            if (emojiSearching) {
              setEmojiSearchActive(false);
              return;
            }
            return;
          case 'backspace':
          case 'enter-backspace':
            if (gifSearching) {
              setGifSearchQuery(current => current.slice(0, -1));
              return;
            }
            if (sfxSearching) {
              setSfxSearchQuery(current => current.slice(0, -1));
              return;
            }
            if (emojiSearching) {
              setEmojiSearchQuery(current => current.slice(0, -1));
              return;
            }
            keyboardBridge.deleteBackward();
            return;
          case 'space':
            if (gifSearching) {
              setGifSearchQuery(current => current + ' ');
              return;
            }
            if (sfxSearching) {
              setSfxSearchQuery(current => current + ' ');
              return;
            }
            if (emojiSearching) {
              setEmojiSearchQuery(current => current + ' ');
              return;
            }
            return;
          default:
            if (gifSearching && keyDef.value) {
              const value = keyDef.value;
              setGifSearchQuery(current => current + value.toLowerCase());
              return;
            }
            if (sfxSearching && keyDef.value) {
              const value = keyDef.value;
              setSfxSearchQuery(current => current + value.toLowerCase());
              return;
            }
            if (emojiSearching && keyDef.value) {
              const value = keyDef.value;
              setEmojiSearchQuery(current => current + value.toLowerCase());
              return;
            }
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
          recordKeystroke('backspace');
          keyboardBridge.deleteBackward();
          livePrefixRef.current = livePrefixRef.current.slice(0, -1);
          lastTypingAtRef.current = Date.now();
          void keyboardBridge.getTextBeforeCursor(96).then(context => {
            if (context.length === 0) {
              hasTypedInFieldRef.current = false;
              livePrefixRef.current = '';
            }
            syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
          });
          scheduleRefreshSuggestions();
          return;
        case 'space': {
          const typedFallback = livePrefixRef.current;
          livePrefixRef.current = '';
          applyInstantSuggestionBar('');
          void commitTypedWordBoundary(
            () => {
              keyboardBridge.insertText(' ');
            },
            ' ',
            typedFallback,
          );
          return;
        }
        case 'enter': {
          const typedFallback = livePrefixRef.current;
          livePrefixRef.current = '';
          void commitTypedWordBoundary(
            () => {
              keyboardBridge.submitEnterKey();
            },
            '',
            typedFallback,
          );
          return;
        }
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
          lastTypingAtRef.current = Date.now();
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
              layout === 'letters'
                ? consumeLetterCommitText(keyDef.value)
                : keyDef.value;
            keyboardBridge.insertText(text);
            recordKeystroke(/[a-z0-9]/i.test(text) ? 'char' : 'other');
            if (layout === 'letters' && mode.type === 'typing') {
              hasTypedInFieldRef.current = true;
              if (/[a-z]/i.test(text)) {
                lastLetterCommitAtRef.current = Date.now();
              }
              livePrefixRef.current += text;
              lastTypingAtRef.current = Date.now();
              scheduleRefreshSuggestions();
            }
          }
      }
    },
    [
      appendToFormField,
      applyInstantSuggestionBar,
      backspaceFormField,
      clearClipboardPasteSuggestion,
      commitTypedWordBoundary,
      consumeLetterCommitText,
      handleFormConfirm,
      handleShiftPress,
      resetCase,
      scheduleRefreshSuggestions,
      syncAutoCapitalizeShift,
    ],
  );

  const handleKeyPressRef = useRef(handleKeyPressImpl);
  handleKeyPressRef.current = handleKeyPressImpl;

  const handleKeyPress = useCallback((keyDef: KeyDefinition) => {
    markTyping();
    handleKeyPressRef.current(keyDef);
  }, [markTyping]);

  const pressFocusedControllerKey = useCallback(() => {
    const focus = normalizeControllerFocus(rowsRef.current, controllerFocusRef.current);
    const keyDef = rowsRef.current[focus.row]?.[focus.col];
    if (isFocusableKey(keyDef)) {
      handleKeyPress(keyDef);
    }
  }, [handleKeyPress]);

  const handleControllerDirection = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      setControllerFocus(current =>
        moveControllerFocus(rowsRef.current, current, direction),
      );
      triggerKeyHaptic();
    },
    [],
  );

  const handleControllerAction = useCallback(
    (action: ControllerAction) => {
      switch (action) {
        case 'toggleKeyboard':
          keyboardBridge.dismissKeyboard();
          return;
        case 'submitText':
          keyboardBridge.submitEnterKey();
          return;
        case 'backspace':
          handleKeyPress({id: 'backspace', label: '⌫', type: 'backspace'});
          return;
        case 'enter':
          handleKeyPress({id: 'enter', label: '↵', type: 'enter'});
          return;
        case 'clickKey':
        case 'selectKey':
          pressFocusedControllerKey();
          return;
        default:
          return;
      }
    },
    [handleKeyPress, pressFocusedControllerKey],
  );

  useEffect(() => {
    if (!controllerKeyboardActive) {
      return;
    }
    const subscription = DeviceEventEmitter.addListener(
      'keyboardControllerInput',
      (raw: unknown) => {
        const event = parseControllerInput(raw);
        if (!event) {
          return;
        }
        if (event.kind === 'axis') {
          handleControllerDirection(event.direction);
          return;
        }
        if (event.action !== 'down') {
          return;
        }
        switch (event.key) {
          case 'dpad_up':
            handleControllerDirection('up');
            return;
          case 'dpad_down':
            handleControllerDirection('down');
            return;
          case 'dpad_left':
            handleControllerDirection('left');
            return;
          case 'dpad_right':
            handleControllerDirection('right');
            return;
          default: {
            const action = controllerActionForButton(controllerSettings, event.key);
            if (action) {
              handleControllerAction(action);
            }
          }
        }
      },
    );
    return () => subscription.remove();
  }, [
    controllerKeyboardActive,
    controllerSettings,
    handleControllerAction,
    handleControllerDirection,
  ]);

  const applyCommittedKeyTextSideEffects = useCallback(
    (text: string) => {
      recordKeystroke(/[a-z0-9]/i.test(text) ? 'char' : 'other');
      if (layoutRef.current === 'letters' && modeRef.current.type === 'typing') {
        hasTypedInFieldRef.current = true;
        if (/[a-z]/i.test(text)) {
          lastLetterCommitAtRef.current = Date.now();
        }
        livePrefixRef.current += text;
        lastTypingAtRef.current = Date.now();
        applyInstantSuggestionBar(livePrefixRef.current);

        if (suggestionRefreshTimerRef.current) {
          clearTimeout(suggestionRefreshTimerRef.current);
        }
        suggestionRefreshTimerRef.current = setTimeout(() => {
          suggestionRefreshTimerRef.current = null;
          const stillTyping = Date.now() - lastTypingAtRef.current < 200;
          void refreshSuggestions({fast: stillTyping});
        }, SUGGESTION_FULL_REFRESH_DEBOUNCE_MS);
      }

      deferKeyboardSideEffect(() => {
        markTyping();
      });
    },
    [applyInstantSuggestionBar, markTyping, refreshSuggestions],
  );

  const handleMultiTouchKeyCommit = useCallback(
    (keyDef: KeyDefinition, text: string) => {
      if (keyDef.type === 'space') {
        handleKeyPressRef.current(keyDef);
        deferKeyboardSideEffect(() => {
          markTyping();
        });
        return;
      }

      if (!text) {
        return;
      }
      if (modeRef.current.type === 'essentials-form') {
        appendToFormField(text);
        if (
          modeRef.current.focusField === 'value' &&
          shiftOnRef.current &&
          !capsLockedRef.current
        ) {
          shiftOnRef.current = false;
          startTransition(() => setShiftOn(false));
        }
        markTyping();
        return;
      }
      if (
        modeRef.current.type === 'emoji' &&
        emojiCategoryRef.current === 'gif' &&
        gifSearchActiveRef.current
      ) {
        setGifSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }
      if (
        modeRef.current.type === 'emoji' &&
        emojiCategoryRef.current === 'sfx' &&
        sfxSearchActiveRef.current
      ) {
        setSfxSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }
      if (
        modeRef.current.type === 'emoji' &&
        emojiCategoryRef.current !== 'gif' &&
        emojiCategoryRef.current !== 'sfx' &&
        emojiSearchActiveRef.current
      ) {
        setEmojiSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }

      keyboardBridge.insertKeyText(text);
      applyCommittedKeyTextSideEffects(text);
    },
    [appendToFormField, applyCommittedKeyTextSideEffects, markTyping],
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'keyboardNativeFastPathKey',
      (payload: NativeFastPathKeyEvent) => {
        const text = typeof payload?.text === 'string' ? payload.text : '';
        if (!text || modeRef.current.type !== 'typing') {
          return;
        }
        if (payload?.shiftConsumed) {
          shiftOnRef.current = false;
          setShiftOn(false);
        }
        if (clipboardPasteSuggestionRef.current) {
          clearClipboardPasteSuggestion();
        }
        applyCommittedKeyTextSideEffects(text);
      },
    );

    return () => subscription.remove();
  }, [applyCommittedKeyTextSideEffects, clearClipboardPasteSuggestion]);

  const handleWordCommitted = useCallback(
    (word: string) => {
      setSwipePreview(null);
      markTyping();
      clearClipboardPasteSuggestion();
      recordLearnedWord(word);
      recordWordCommitted();
      recordKeystroke('char');
      keyboardBridge.insertText(word);
      keyboardBridge.insertText(' ');
      if (shiftOn && !capsLocked) {
        setShiftOn(false);
      }
      requestAnimationFrame(() => {
        void refreshSuggestions();
      });
    },
    [capsLocked, clearClipboardPasteSuggestion, markTyping, refreshSuggestions, shiftOn],
  );

  const handleUndo = useCallback(() => {
    void (async () => {
      const edit = autocorrectUndoStackRef.current.at(-1);
      if (edit) {
        const context = await keyboardBridge.getTextBeforeCursor(
          edit.correction.length + edit.boundary.length + 8,
        );
        const expected = `${edit.correction}${edit.boundary}`;
        if (context.endsWith(expected)) {
          autocorrectUndoStackRef.current =
            autocorrectUndoStackRef.current.slice(0, -1);
          autocorrectRedoStackRef.current = [
            ...autocorrectRedoStackRef.current.slice(-9),
            edit,
          ];
          keyboardBridge.replaceWordPrefix(
            expected.length,
            `${edit.original}${edit.boundary}`,
          );
          livePrefixRef.current = '';
          requestAnimationFrame(() => {
            scheduleRefreshSuggestions();
          });
          return;
        }
      }

      await keyboardBridge.undo();
      scheduleRefreshSuggestions();
    })();
  }, [scheduleRefreshSuggestions]);

  const handleRedo = useCallback(() => {
    void (async () => {
      const edit = autocorrectRedoStackRef.current.at(-1);
      if (edit) {
        const context = await keyboardBridge.getTextBeforeCursor(
          edit.original.length + edit.boundary.length + 8,
        );
        const expected = `${edit.original}${edit.boundary}`;
        if (context.endsWith(expected)) {
          autocorrectRedoStackRef.current =
            autocorrectRedoStackRef.current.slice(0, -1);
          autocorrectUndoStackRef.current = [
            ...autocorrectUndoStackRef.current.slice(-9),
            edit,
          ];
          keyboardBridge.replaceWordPrefix(
            expected.length,
            `${edit.correction}${edit.boundary}`,
          );
          livePrefixRef.current = '';
          requestAnimationFrame(() => {
            scheduleRefreshSuggestions();
          });
          return;
        }
      }

      await keyboardBridge.redo();
      scheduleRefreshSuggestions();
    })();
  }, [scheduleRefreshSuggestions]);

  const showKeys =
    mode.type === 'typing' ||
    mode.type === 'essentials-form' ||
    isEmojiMode ||
    isResizeMode;
  const itemsSelected =
    mode.type === 'items-menu' ||
    mode.type === 'essentials-list' ||
    mode.type === 'clipboard' ||
    mode.type === 'gestures' ||
    mode.type === 'autocorrect' ||
    mode.type === 'calculator' ||
    mode.type === 'touchpad' ||
    mode.type === 'metrics' ||
    mode.type === 'onehand';

  const handleCalculatorInsert = useCallback((value: string) => {
    if (!value || value === 'Error' || value === '0') {
      return;
    }
    keyboardBridge.insertText(value);
  }, []);

  const handleGifSelect = useCallback(async (gif: GiphyGif) => {
    try {
      await downloadAndInsertGif(gif);
    } catch (error) {
      console.warn('Failed to insert GIF', error);
    }
  }, []);

  const handleSfxSelect = useCallback(async (sound: MyInstantsSound) => {
    if (installingSfxId) {
      return;
    }
    setInstallingSfxId(sound.id);
    try {
      await downloadAndSendSfx(sound);
    } catch (error) {
      console.warn('Failed to send sound', error);
    } finally {
      setInstallingSfxId(null);
    }
  }, [installingSfxId]);

  const handleSfxPreview = useCallback((sound: MyInstantsSound) => {
    previewSfx(sound);
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      livePrefixRef.current = '';
      applyInstantSuggestionBar('');
      keyboardBridge.insertText(emoji);
      markTyping();
    },
    [applyInstantSuggestionBar, markTyping],
  );

  const typingGesturesActive =
    mode.type === 'typing' && layout === 'letters' && !isFormMode;
  const keyGesturesActive = mode.type === 'typing' && !isFormMode;
  const nativeFastPathEligible =
    NATIVE_FAST_PATH_ENABLED &&
    mode.type === 'typing' &&
    layout === 'letters' &&
    !isFormMode;

  useEffect(() => {
    if (!nativeFastPathEligible || !layoutContext) {
      nativeFastPathActiveRef.current = false;
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
      return;
    }

    let cancelled = false;
    const publishConfig = () => {
      if (cancelled) {
        return;
      }

      const keyLayouts = layoutContext
        .getLayouts()
        .filter(({keyDef}) => {
          if (!keyDef.value || keyDef.type === 'comma' || keyDef.type === 'period') {
            return false;
          }
          return keyDef.value.length > 0;
        });

      if (
        keyLayouts.length < NATIVE_FAST_PATH_MIN_KEYS ||
        layoutContext.areaBounds.width <= 0 ||
        layoutContext.areaBounds.height <= 0
      ) {
        nativeFastPathActiveRef.current = false;
        keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
        return;
      }

      nativeFastPathActiveRef.current = true;
      const origin = layoutContext.areaOriginRef.current;
      keyboardBridge.setNativeKeyFastPathConfig(
        JSON.stringify({
          enabled: true,
          commitOnDown: !gestureEnabled,
          areaPageX: origin.pageX,
          areaPageY: origin.pageY,
          hitSlopHorizontal: theme.keyHitSlop.horizontal,
          hitSlopVertical: theme.keyHitSlop.vertical,
          layout,
          isUppercase,
          shiftOn,
          capsLocked,
          keys: keyLayouts.map(({id, keyDef, x, y, width, height}) => ({
            id,
            type: keyDef.type ?? 'char',
            value: keyDef.value,
            x,
            y,
            width,
            height,
            reactTag: getKeyReactTag(id) ?? 0,
          })),
        }),
      );
    };

    publishConfig();
    const raf = requestAnimationFrame(publishConfig);
    const unsubscribeTags = subscribeKeyReactTags(publishConfig);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsubscribeTags();
    };
  }, [
    capsLocked,
    isFormMode,
    isUppercase,
    layout,
    layoutContext,
    layoutContext?.areaBounds.height,
    layoutContext?.areaBounds.width,
    layoutContext?.layoutEpoch,
    mode.type,
    nativeFastPathEligible,
    gestureEnabled,
    shiftOn,
    theme.keyHitSlop.horizontal,
    theme.keyHitSlop.vertical,
  ]);

  useEffect(
    () => () => {
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
    },
    [],
  );

  useEffect(() => {
    const preserveArmedKeys =
      mode.type === 'items-menu' ||
      mode.type === 'essentials-list' ||
      mode.type === 'clipboard' ||
      mode.type === 'gestures' ||
      mode.type === 'autocorrect' ||
      mode.type === 'calculator' ||
      mode.type === 'touchpad' ||
      mode.type === 'metrics' ||
      mode.type === 'onehand' ||
      mode.type === 'rewrite' ||
      mode.type === 'format' ||
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
        (layout === 'letters' || layout === 'numbers' || layout === 'symbols') &&
        gestureSettings.spaceCursorSwipe,
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
        void setPeriodRewriteArmed(true);
      },
      onPeriodRewritePress: () => {
        void openRewritePanel();
      },
      onPeriodRewriteDisarm: () => {
        setPeriodRewriteActive(false);
        void setPeriodRewriteArmed(false);
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
        if (key === 'commaLauncher') {
          setCommaLauncherActive(false);
          setPeriodRewriteActive(false);
          void setCommaLauncherArmed(false);
          void setPeriodRewriteArmed(false);
        }
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

  const handleAiAutoCorrectToggle = useCallback(
    (enabled: boolean) => {
      void setAiAutoCorrectEnabled(enabled).then(() => {
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
  const useCompactLayout = isNumpadLayout || theme.isLandscape;

  return (
    <View
      style={[styles.container, useCompactLayout && styles.containerCompact]}>
      <GestureTypingLayer
          enabled={gestureEnabled}
          compact={useCompactLayout}
          alignTop={
            isNumpadLayout ||
            mode.type === 'clipboard' ||
            mode.type === 'items-menu' ||
            mode.type === 'essentials-list' ||
            mode.type === 'gestures' ||
            mode.type === 'autocorrect' ||
            mode.type === 'calculator' ||
            mode.type === 'touchpad' ||
            mode.type === 'metrics' ||
            mode.type === 'onehand' ||
            mode.type === 'translate' ||
            mode.type === 'rewrite' ||
            mode.type === 'format'
          }
          trackpadEnabled={
            typingGesturesActive && gestureSettings.trackpadMode
          }
          onCursorStep={offset => {
            void keyboardBridge.moveCursor(offset);
          }}
          isUppercase={isUppercase}
          onWordCommitted={handleWordCommitted}
          onSwipePreviewChange={setSwipePreview}
          onSwipeActiveChange={active => {
            if (!active) {
              setSwipePreview(null);
            }
          }}>
        {isTouchpadMode && touchpadGestureActive ? (
          <View
            pointerEvents="auto"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: theme.suggestionBarHeight,
              zIndex: 60,
            }}
          />
        ) : null}
        <SuggestionBar
          suggestions={suggestions}
          prefix={currentPrefix}
          swipePreview={swipePreview}
          typedKeepSuggestion={typedKeepSuggestion}
          autocorrectPreview={autocorrectPreview}
          onSelect={handleSuggestionSelect}
          clipboardPasteSuggestion={clipboardPasteSuggestion}
          onClipboardPasteSelect={handleClipboardPasteSelect}
          aiAutocorrectSuggestion={aiAutocorrectSuggestion}
          onAiAutocorrectSelect={handleAiAutocorrectSelect}
          isAiAutocorrectProcessing={isAiAutocorrectProcessing}
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
          panelSearch={
            isGifCategory
              ? {
                  visible: true,
                  active: gifSearchActive,
                  query: gifSearchQuery,
                  placeholder: 'Search GIFs',
                  onActivate: () => {
                    setLayout('letters');
                    setGifSearchActive(true);
                  },
                  onClear: () => {
                    setGifSearchQuery('');
                  },
                }
              : isSfxCategory
                ? {
                    visible: true,
                    active: sfxSearchActive,
                    query: sfxSearchQuery,
                    placeholder: 'Search meme sounds',
                    onActivate: () => {
                      setLayout('letters');
                      setSfxSearchActive(true);
                    },
                    onClear: () => {
                      setSfxSearchQuery('');
                    },
                  }
              : isEmojiMode && !isGifCategory && !isSfxCategory
                ? {
                    visible: true,
                    active: emojiSearchActive,
                    query: emojiSearchQuery,
                    placeholder: 'Search emojis',
                    onActivate: () => {
                      setLayout('letters');
                      setEmojiSearchActive(true);
                    },
                    onClear: () => {
                      setEmojiSearchQuery('');
                      setEmojiSearchActive(false);
                    },
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
          showUndoRedo={gestureSettings.undoRedo && stoppedTyping}
          onUndo={handleUndo}
          onRedo={handleRedo}
          leadingBack={
            isFormMode ||
            isTranslateMode ||
            isRewriteMode ||
            isFormatMode ||
            isTouchpadMode
          }
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
                        : mode.type === 'touchpad'
                          ? 'Touchpad'
                          : mode.type === 'metrics'
                            ? 'Telemetry'
                          : mode.type === 'onehand'
                            ? 'One Hand'
                          : mode.type === 'translate'
                            ? 'Translate'
                            : mode.type === 'rewrite'
                              ? 'Rewrite'
                              : mode.type === 'format'
                                ? 'Format'
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
            !showKeys && styles.keysPanelPlugins,
            !showKeys ? styles.keysPanelClip : null,
            // When shrinking (negative offset in resize), reduce top padding so the keyboard
            // "shrinks and fits in" the smaller window from the top while bottom stays put.
            layout === 'letters' && (isResizeMode ? resizeLiveOffset : (theme.keyboardHeightOffset ?? 0)) < 0
              ? {
                  paddingTop: effectiveKeysPaddingTop,
                }
              : null,
          ]}>
          {isEmojiMode && !isGifSearchMode && !isEmojiSearchMode && !isSfxSearchMode ? (
            <EmojiPanel
              category={emojiCategory}
              emojiSearchQuery={emojiSearchQuery}
              panelHeight={emojiPanelScrollHeight}
              onSelect={handleEmojiSelect}
              onGifSelect={gif => {
                void handleGifSelect(gif);
              }}
              gifSearchQuery={gifSearchQuery}
              sfxSearchQuery={sfxSearchQuery}
              onSfxSelect={sound => {
                void handleSfxSelect(sound);
              }}
              onSfxPreview={handleSfxPreview}
              installingSfxId={installingSfxId}
            />
          ) : null}

          {mode.type === 'items-menu' ? (
            <ItemsMenuPanel
              onSelectFormat={() => {
                void openFormatPanel();
              }}
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
              onSelectTouchpad={() => {
                openTouchpad();
              }}
              onSelectResize={() => {
                openResize();
              }}
              onSelectMetrics={() => {
                openMetrics();
              }}
              onSelectOneHand={() => {
                openOneHand();
              }}
            />
          ) : null}

          {mode.type === 'translate' ? (
            <TranslatePanel />
          ) : null}

          {mode.type === 'rewrite' ? <RewritePanel /> : null}

          {mode.type === 'format' ? <FormatPanel /> : null}

          {mode.type === 'calculator' ? (
            <CalculatorPanel
              onInsert={handleCalculatorInsert}
              onDisplayChange={setCalculatorDisplay}
            />
          ) : null}

          {mode.type === 'touchpad' ? (
            <TouchpadPanel onGestureActiveChange={setTouchpadGestureActive} />
          ) : null}

          {isResizeMode ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                zIndex: 80,
              }}
              pointerEvents="box-none">
              <KeyboardResizeOverlay
                baseHeight={letterResizeBaseHeight}
                currentOffset={resizeLiveOffset}
                onOffsetChange={setResizeLiveOffset}
                onDone={(finalOffset) => closeResize(finalOffset)}
                onCancel={() => {
                  // revert live changes by not saving; height will reset on mode change via effect
                  closeResize();
                }}
              />
            </View>
          ) : null}

          {mode.type === 'clipboard' ? (
            <ClipboardProPanel
              items={clipboardItems}
              onSelect={handleClipboardSelect}
              onDelete={handleClipboardDelete}
              onTogglePin={handleClipboardTogglePin}
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
              onToggleAiAutoCorrect={handleAiAutoCorrectToggle}
              onLearnedDataReset={() => {
                void reloadAutocorrect();
                refreshSuggestions();
              }}
            />
          ) : null}

          {mode.type === 'metrics' ? <MetricsPanel /> : null}

          {mode.type === 'onehand' ? (
            <OneHandPanel
              settings={oneHandSettings}
              onToggleEnabled={enabled => {
                void setOneHandEnabled(enabled).then(() => {
                  setOneHandSettings(getOneHandSettings());
                });
              }}
              onSelectSide={side => {
                void setOneHandSide(side).then(() => {
                  setOneHandSettings(getOneHandSettings());
                });
              }}
              onSelectStrength={strength => {
                void setOneHandStrength(strength).then(() => {
                  setOneHandSettings(getOneHandSettings());
                });
              }}
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

          {isEmojiMode && !isGifSearchMode && !isEmojiSearchMode && !isSfxSearchMode ? (
            <EmojiBottomRow
              category={emojiCategory}
              onCategorySelect={setEmojiCategory}
              onKeyPress={handleKeyPress}
            />
          ) : null}

          {showKeys &&
          (!isEmojiMode ||
            isGifSearchMode ||
            isEmojiSearchMode ||
            isSfxSearchMode) ? (
            <View
              collapsable={false}
              style={
                oneHandLayout.active
                  ? {
                      width: oneHandLayout.width,
                      alignSelf: oneHandLayout.alignSelf,
                    }
                  : undefined
              }>
              <LetterKeyboardRows
                rows={rows}
                layout={layout}
                modeType={mode.type}
                isUppercase={isUppercase}
                getIsUppercase={getIsUppercase}
                getLetterCommitText={consumeLetterCommitText}
                shiftOn={shiftOn}
                capsLocked={capsLocked}
                onKeyPress={handleKeyPress}
                onMultiTouchKeyCommit={handleMultiTouchKeyCommit}
                keyGestures={
                  isGifSearchMode || isEmojiSearchMode || isSfxSearchMode
                    ? undefined
                    : keyGestures
                }
                multiTouchEnabled={
                  mode.type === 'typing' ||
                  mode.type === 'essentials-form' ||
                  isGifSearchMode ||
                  isEmojiSearchMode ||
                  isSfxSearchMode
                }
                keyHeight={effectiveLetterKeyHeight ?? numberRowLayoutBoost?.keyHeight}
                rowStyle={[
                  resizeRowsExtraMargin !== undefined
                    ? {marginBottom: resizeRowsExtraMargin}
                    : undefined,
                  numberRowLayoutBoost
                    ? {
                        marginBottom: numberRowLayoutBoost.keyRowMargin,
                        gap: numberRowLayoutBoost.keyGap,
                      }
                    : undefined,
                ]}
                enterKeyNextLineEnabled={
                  mode.type === 'typing' ? enterKeyNextLineEnabled : false
                }
                focusedKeyId={
                  controllerKeyboardActive && showKeys
                    ? focusedControllerKey?.id
                    : null
                }
              />
            </View>
          ) : null}
        </View>
        </GestureTypingLayer>
    </View>
  );
}


export default function KeyboardApp() {
  const {width, height} = useWindowDimensions();
  const isLandscape = isLandscapeOrientation(width, height);
  const [fontsLoaded] = useFonts({
    Geist: require('../../assets/Geist-VariableFont_wght.ttf'),
    Chicago: require('../../assets/Chicago.ttf'),
    Ndot: require('../../assets/Ndot-55.otf'),
    Pixel: require('../../assets/pixel.ttf'),
  });
  const [colorScheme, setColorScheme] =
    useState<KeyboardColorScheme>('light');
  const [keyboardDesign, setKeyboardDesign] =
    useState<KeyboardDesign>('typebase');
  const [customThemeJson, setCustomThemeJson] = useState<string>('{}');
  const [layoutSettings, setLayoutSettings] = useState<KeyboardLayoutSettings>(
    DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  );
  const [controllerConnected, setControllerConnected] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [customUserFontFamily, setCustomUserFontFamily] = useState<string | null>(null);

  const effectiveLayoutSettings = useMemo(
    () => layoutSettingsForOrientation(layoutSettings, isLandscape),
    [isLandscape, layoutSettings],
  );

  useEffect(() => {
    void Promise.all([
      ensureThemeLoaded(),
      ensureLayoutLoaded(),
      ensureCustomLayoutsLoaded(),
    ]).then(() => {
      setColorScheme(getKeyboardColorScheme());
      setKeyboardDesign(getKeyboardDesign());
      setCustomThemeJson(getKeyboardCustomTheme());
      setLayoutSettings(getKeyboardLayoutSettings());
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => scheduleBackgroundEnglishSymSpellSeed(), 500);
      });
      setThemeReady(true);
    });
    const schemeSubscription = DeviceEventEmitter.addListener(
      KEYBOARD_THEME_CHANGED_EVENT,
      (scheme: KeyboardColorScheme) => {
        setColorScheme(scheme);
      },
    );
    const designSubscription = DeviceEventEmitter.addListener(
      KEYBOARD_DESIGN_CHANGED_EVENT,
      (design: KeyboardDesign) => {
        setKeyboardDesign(design);
      },
    );
    const customThemeSubscription = DeviceEventEmitter.addListener(
      KEYBOARD_CUSTOM_THEME_CHANGED_EVENT,
      (json: string) => {
        setCustomThemeJson(json);
      },
    );
    const layoutSubscription = DeviceEventEmitter.addListener(
      KEYBOARD_LAYOUT_CHANGED_EVENT,
      (payload: unknown) => {
        const next = parseLayoutEventPayload(payload);
        setLayoutSettings(next);
        void preloadActiveDictionary();
      },
    );
    const controllerSubscription = DeviceEventEmitter.addListener(
      'keyboardControllerConnection',
      (connected: unknown) => {
        setControllerConnected(connected === true);
      },
    );
    const controllerInputSubscription = DeviceEventEmitter.addListener(
      'keyboardControllerInput',
      () => {
        setControllerConnected(true);
      },
    );
    return () => {
      schemeSubscription.remove();
      designSubscription.remove();
      customThemeSubscription.remove();
      layoutSubscription.remove();
      controllerSubscription.remove();
      controllerInputSubscription.remove();
    };
  }, []);

  // Load (or reload) user-provided keyboard font when layout settings indicate one.
  useEffect(() => {
    let cancelled = false;

    const loadUserFont = async () => {
      const enabled = !!layoutSettings.customFontEnabled;
      const file = layoutSettings.customFontFile;

      if (!enabled || !file) {
        if (!cancelled) setCustomUserFontFamily(null);
        return;
      }

      const uri = resolveCustomFontUri(file);
      if (!uri) {
        if (!cancelled) setCustomUserFontFamily(null);
        return;
      }

      try {
        // Register under a stable family name.
        await Font.loadAsync({ CustomKeyboardFont: { uri } });
        if (!cancelled) {
          setCustomUserFontFamily('CustomKeyboardFont');
        }
      } catch {
        // If loading fails (corrupt file, unsupported format, etc.), fall back gracefully.
        if (!cancelled) setCustomUserFontFamily(null);
      }
    };

    void loadUserFont();

    return () => {
      cancelled = true;
    };
  }, [layoutSettings.customFontEnabled, layoutSettings.customFontFile]);

  if (!fontsLoaded || !themeReady) {
    return (
      <View style={keyboardAppLoadingStyles.container}>
        <ActivityIndicator color="#000000" />
      </View>
    );
  }

  return (
    <KeyboardThemeProvider
      scheme={colorScheme}
      design={keyboardDesign}
      customThemeJson={customThemeJson}
      layoutSettings={effectiveLayoutSettings}
      customFontLoaded={fontsLoaded}
      isLandscape={isLandscape}
      customUserFontFamily={customUserFontFamily}
    >
      <KeyLayoutProvider layoutSettings={effectiveLayoutSettings}>
        <KeyboardBody
          controllerConnected={controllerConnected}
          controllerSettings={layoutSettings.controller}
        />
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
      minHeight: 0,
    },
    keysPanelPlugins: {
      flexGrow: 0,
      flexShrink: 0,
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
