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
  Platform,
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
import {FrostedKeyBackdrop, frostedKeyboardBackdropLayout} from './components/FrostedKeyBackdrop';
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
import {
  DEFAULT_EMOJI_PANEL_TAB,
  DEFAULT_EMOJI_SUBCATEGORY,
  type EmojiPanelTab,
  type EmojiSubcategoryId,
} from './emoji/emojis';
import {downloadAndInsertGif} from './emoji/gifInsert';
import {insertStickerLySticker} from './emoji/stickerInsert';
import {downloadAndSendSfx, previewSfx, stopSfxPreview} from './emoji/sfxInsert';
import type {GiphyGif} from './emoji/giphyService';
import type {StickerLySticker} from './emoji/stickers';
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
import {setUndoCommittedTextHandler} from './gesture/multiTouchKeys';
import {SwipeTypingKeysHost} from './gesture/SwipeTypingContext';
import {PredictiveHitboxOverlay} from './gesture/PredictiveHitboxOverlay';
import {ContextCorrectionDebugOverlay} from './autocorrect/ContextCorrectionDebugOverlay';
import {setContextCorrectionDebugCapture} from './autocorrect/contextCorrectionEngine';
import {preloadContextBigrams} from './autocorrect/contextBigrams';
import {
  clearNativeSuggestionSnapshot,
  getFreshNativeSuggestions,
  parseNativeSuggestionsPayload,
  recordNativeSuggestionSnapshot,
  syncNativeSuggestionPrefix,
} from './nativeSuggestionBar';
import {KeyLayoutProvider, useKeyLayoutContext} from './gesture/KeyLayoutContext';
import {
  getTouchIntelligenceNativeConfig,
  setTouchIntelligenceTypingContextProvider,
  syncTouchIntelligenceToNative,
} from './gesture/touchIntelligence';
import {updatePredictiveHitboxes} from './gesture/predictiveHitboxes';
import {installTouchIntelligenceNativeTelemetry} from './gesture/touchIntelligenceNativeBridge';
import {hydrateTouchIntelligenceHitsFromStorage} from './gesture/touchIntelligenceTelemetry';
import {
  destroyKeyPreview,
  hideAllKeyPreviews,
  initKeyPreview,
  setKeyPreviewTheme,
} from './KeyPreview';
import {AutocorrectPanel} from './autocorrect/AutocorrectPanel';
import {
  ensurePersonalTypingLoaded,
  observeCorrectionAccepted,
  observeCorrectionRejected,
  observeKeepTyped,
  observePunctuationPattern,
} from './personalTyping/personalTypingEngine';
import {
  ensureAutocorrectLoaded,
  getAutocorrectSettings,
  reloadAutocorrectFromStorage,
  setAiAutoCorrectEnabled,
  setAutoApplyOnSpace,
  setAutocorrectEnabled,
} from './autocorrect/autocorrectStore';
import {
  extractPreviousWordFromContext,
  getAutocorrectCandidate,
  getSuggestionBarAutocorrect,
  isDictionaryWord,
  shouldAutoApply,
  shouldSkipAutocorrectForToken,
} from './autocorrect/autocorrectEngine';
import {
  extractTrailingWords,
  getPhraseCorrection,
  getPhraseSuggestions,
  learnPhrasesFromContext,
  recordLearnedPhrase,
} from './autocorrect/learnedPhrases';
import type {AutocorrectSettings} from './autocorrect/types';
import {
  proofreadActiveToken,
  proofreadRecentTypingContext,
  finalizeTypeLiftCorrection,
  type AiAutocorrectResult,
} from './autocorrect/aiAutocorrectService';
import {
  recordAiPreflightRequest,
  recordAiPreflightResult,
  recordAiPreflightStale,
} from './autocorrect/aiAutocorrectTelemetry';
import {getActiveLanguage, isEnglishSymSpellReady, preloadActiveDictionary, scheduleBackgroundEnglishSymSpellSeed} from './autocorrect/dictionaryManager';
import {scheduleEnglishWordSetBuild} from './autocorrect/englishFrequencyDictionary';
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
  isBurstTypingActive,
  setBurstTypingActive,
  setGamePerformanceModeActive,
  setZeroLatencyModeActive as setZeroLatencyRuntimeActive,
  shouldDeferHeavyTypingSideEffects,
  shouldDeferLiveSuggestionBar,
  shouldSkipFrostedKeyboardEffects,
} from './zeroLatencyMode';
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
import {APPLE_BOTTOM_ROW} from './layouts/sharedRows';
import {shouldAutoCapitalizeShift} from './autoCapitalize';
import {
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
import {DEFAULT_KEYBOARD_LAYOUT_SETTINGS, getNonLettersKeyboardHeightDp, getNumberRowLayoutBoost, keyboardOpaqueKeyFill} from './theme';
import {
  isLandscapeOrientation,
  layoutSettingsForOrientation,
} from './orientation';
import {useVoiceInput} from './voice/useVoiceInput';
import {
  derivePreviousWordFromEditor,
  pickTypedWordForBoundary,
  reconcileLivePrefixFromContext,
  shouldInsertLeadingSpaceBeforeWord,
} from './typingCompositor';

const DOUBLE_TAP_MS = 350;
/** Debounced async refresh (phrases, essentials, native cursor sync). */
const SUGGESTION_FULL_REFRESH_DEBOUNCE_MS = 280;
const INSTANT_SUGGESTION_MIN_INTERVAL_MS = 32;
const LETTER_SIDE_EFFECTS_DEBOUNCE_MS = 250;
const BURST_TYPING_INTERVAL_MS = 90;
/** Skip duplicate async native fast-path side effects after inline touch handling. */
const NATIVE_SIDE_EFFECT_DEDUP_MS = 100;

function suggestionListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function isBurstTyping(lastCommitAtMs: number, now = Date.now()): boolean {
  return lastCommitAtMs > 0 && now - lastCommitAtMs < BURST_TYPING_INTERVAL_MS;
}

const INSTANT_SUGGESTION_DISABLED = false;
const BACKSPACE_SUGGESTION_DEBOUNCE_MS = 900;
/** Coalesce suggestion-bar work while backspacing — one update per burst. */
const BACKSPACE_BAR_FLUSH_MS = 32;
const AI_PREFLIGHT_DEBOUNCE_MS = 1_100;
const AI_PROOFREAD_DELAY_MS = 2_200;
const AI_PROOFREAD_MIN_IDLE_MS = 600;
const AI_PREFLIGHT_MIN_TOKEN_LENGTH = 4;
const AI_PREFLIGHT_CACHE_LIMIT = 12;
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
  isNativeTypingCommitActive?: () => boolean;
  onNativeFastPathLetterCommit?: (text: string) => void;
  onNativeFastPathShiftConsumed?: () => void;
  shouldConsumeShiftForCommit?: (text: string) => boolean;
  onSpaceLongPress?: () => void;
  keyGestures?: KeyGesturesConfig;
  keyHeight?: number;
  rowStyle?: StyleProp<ViewStyle>;
  enterKeyNextLineEnabled: boolean;
  multiTouchEnabled?: boolean;
  focusedKeyId?: string | null;
  typeLiftProcessing?: boolean;
  predictiveHitboxTick?: number;
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
  isNativeTypingCommitActive,
  onNativeFastPathLetterCommit,
  onNativeFastPathShiftConsumed,
  shouldConsumeShiftForCommit,
  onSpaceLongPress,
  keyGestures,
  keyHeight,
  rowStyle,
  enterKeyNextLineEnabled,
  multiTouchEnabled,
  focusedKeyId,
  typeLiftProcessing,
  predictiveHitboxTick = 0,
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
      onMultiTouchKeyCommit={onMultiTouchKeyCommit}
      isNativeTypingCommitActive={isNativeTypingCommitActive}
      onNativeFastPathLetterCommit={onNativeFastPathLetterCommit}
      onNativeFastPathShiftConsumed={onNativeFastPathShiftConsumed}
      shouldConsumeShiftForCommit={shouldConsumeShiftForCommit}
      onSpaceLongPress={onSpaceLongPress}>
      {theme.developerEyeEnabled && theme.predictiveHitboxesEnabled ? (
        <PredictiveHitboxOverlay
          visible={layout === 'letters'}
          revision={predictiveHitboxTick}
        />
      ) : null}
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
          typeLiftProcessing={typeLiftProcessing}
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

/** Prefix + learned chips in the suggestion bar (trie lookup only — no fuzzy scan). */
const TYPING_BAR_WORD_LIMIT = 8;

function computeTypingSuggestionBar(
  prefix: string,
  options: {
    fast: boolean;
    context?: string;
    previousWord?: string;
    /** Skip SymSpell/autocorrect — prefix chips only (used while deleting). */
    suggestionsOnly?: boolean;
    /** Trie completions only — skip autocorrect while burst typing. */
    prefixOnly?: boolean;
  },
) {
  const fast = options.fast;
  const suggestionsOnly = options.suggestionsOnly ?? false;
  const prefixOnly = options.prefixOnly ?? false;
  const previousWord =
    options.previousWord ??
    (options.context
      ? extractPreviousWordFromContext(options.context, prefix)
      : '');
  const barAutocorrect =
    prefixOnly ||
    !getAutocorrectSettings().enabled ||
    prefix.length < 2 ||
    shouldSkipAutocorrectForToken(prefix)
      ? {keepTyped: null, correction: null}
      : getSuggestionBarAutocorrect(prefix, {
          fast,
          previousWord,
          context: fast ? undefined : options.context,
        });

  const phraseSuggestions =
    fast ||
    !options.context ||
    shouldSkipAutocorrectForToken(prefix) ||
    extractTrailingWords(options.context, 3).length < 2
      ? []
      : getPhraseSuggestions(options.context, 2);
  // Prefix completions (trie) plus a small high-confidence fuzzy pass while typing.
  const nativeSuggestions =
    Platform.OS === 'android' && fast
      ? getFreshNativeSuggestions(prefix)
      : null;
  let wordSuggestions =
    shouldSkipAutocorrectForToken(prefix) || prefix.length < 1
      ? []
      : nativeSuggestions ??
        getWordSuggestions(prefix, TYPING_BAR_WORD_LIMIT, {
          skipFuzzy: suggestionsOnly,
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
      .slice(0, TYPING_BAR_WORD_LIMIT),
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
  const [shiftOn, setShiftOn] = useState(false);
  const [capsLocked, setCapsLocked] = useState(false);
  const [enterKeyNextLineEnabled, setEnterKeyNextLineEnabled] =
    useState(false);
  const lastShiftTapRef = useRef(0);
  const userChoseLettersRef = useRef(false);
  const letterSideEffectsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const burstTypingEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const suggestionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const suggestionRefreshRunIdRef = useRef(0);
  const suggestionDictionariesReadyRef = useRef(false);
  const aiProofreadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiProofreadRunIdRef = useRef(0);
  const aiPreflightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiPreflightRunIdRef = useRef(0);
  const aiPreflightCacheRef = useRef<
    Map<string, Extract<AiAutocorrectResult, {kind: 'auto' | 'suggest'}>>
  >(new Map());
  const lastAiProofreadOriginalRef = useRef<string | null>(null);
  const livePrefixRef = useRef('');
  const lastInstantPrefixRef = useRef('');
  const previousWordRef = useRef('');
  const autocorrectPreviewRef = useRef<string | null>(null);
  const nativeFastPathActiveRef = useRef(false);
  const instantSuggestionRafRef = useRef<number | null>(null);
  const instantSuggestionLastFlushAtRef = useRef(0);
  const nativeSideEffectDedupRef = useRef<{text: string; at: number} | null>(null);
  const lastFlushedSuggestionsRef = useRef<string[]>([]);
  const lastFlushedAutocorrectRef = useRef<string | null>(null);
  const lastFlushedTypedKeepRef = useRef<string | null>(null);
  const lastFlushedBarPrefixRef = useRef('');
  const backspaceBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceSyncSeqRef = useRef(0);
  const autocorrectUndoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const autocorrectRedoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const lastTypingAtRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stoppedTyping, setStoppedTyping] = useState(true);
  const [predictiveHitboxTick, setPredictiveHitboxTick] = useState(0);
  const [contextCorrectionTick, setContextCorrectionTick] = useState(0);
  const stoppedTypingRef = useRef(true);
  const [zeroLatencyMode, setZeroLatencyMode] = useState(false);
  const zeroLatencyModeRef = useRef(false);
  const [gamePerformanceActive, setGamePerformanceActive] = useState(false);
  const gamePerformanceModeRef = useRef(false);
  const autoGamePerformanceRef = useRef(false);
  /** Briefly disable native commit-on-down after rotation until key bounds remeasure. */
  const [nativeFastPathLayoutHold, setNativeFastPathLayoutHold] = useState(false);
  const shiftOnRef = useRef(false);
  const capsLockedRef = useRef(false);
  const hasTypedInFieldRef = useRef(false);
  const emptyContextTrustworthyRef = useRef(true);
  const lastLetterCommitAtRef = useRef(0);
  /** Blocks shift re-enable until word boundary — native may consume shift before React updates. */
  const autoShiftConsumedMidWordRef = useRef(false);
  const touchIntelligencePreviousKeyRef = useRef<string | null>(null);
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
  const [emojiPanelTab, setEmojiPanelTab] = useState<EmojiPanelTab>(
    DEFAULT_EMOJI_PANEL_TAB,
  );
  const [emojiSubcategory, setEmojiSubcategory] = useState<EmojiSubcategoryId>(
    DEFAULT_EMOJI_SUBCATEGORY,
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
    isVoiceSpeaking,
    isVoiceConnecting,
    isVoiceProcessing,
    partialTranscript,
    audioLevel,
    toggleListening,
  } = useVoiceInput();
  const clipboardPasteEnabled = mode.type === 'typing';
  const {
    clipboardPasteSuggestion,
    clearClipboardPasteSuggestion,
    refreshClipboardPasteSuggestion,
  } = useClipboardPasteSuggestion({enabled: clipboardPasteEnabled});

  const emojiPanelTabRef = useRef<EmojiPanelTab>(DEFAULT_EMOJI_PANEL_TAB);
  const emojiSubcategoryRef = useRef<EmojiSubcategoryId>(DEFAULT_EMOJI_SUBCATEGORY);
  const gifSearchActiveRef = useRef(false);
  const emojiSearchActiveRef = useRef(false);
  const sfxSearchActiveRef = useRef(false);

  if (!autoShiftConsumedMidWordRef.current) {
    shiftOnRef.current = shiftOn;
  } else {
    shiftOnRef.current = false;
  }
  capsLockedRef.current = capsLocked;
  layoutRef.current = layout;
  modeRef.current = mode;
  emojiPanelTabRef.current = emojiPanelTab;
  emojiSubcategoryRef.current = emojiSubcategory;
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

  const syncNativeFastPathCaseState = useCallback(() => {
    const uppercase = shiftOnRef.current || capsLockedRef.current;
    isUppercaseRef.current = uppercase;
    keyboardBridge.updateNativeFastPathCaseState(
      shiftOnRef.current,
      capsLockedRef.current,
      uppercase,
    );
  }, []);

  const clearMidWordAutoShift = useCallback(() => {
    autoShiftConsumedMidWordRef.current = false;
    keyboardBridge.clearNativeMidWordShiftBlock();
  }, []);

  /** Clear JS + native shift immediately when native fast path consumes shift. */
  const syncNativeShiftConsumed = useCallback(() => {
    if (capsLockedRef.current || !shiftOnRef.current) {
      return;
    }
    autoShiftConsumedMidWordRef.current = true;
    shiftOnRef.current = false;
    isUppercaseRef.current = false;
    lastLetterCommitAtRef.current = Date.now();
    setShiftOn(false);
    syncNativeFastPathCaseState();
  }, [syncNativeFastPathCaseState]);

  const shouldConsumeShiftForCommit = useCallback((text: string): boolean => {
    if (layoutRef.current !== 'letters' || text.length !== 1) {
      return false;
    }
    const char = text[0]!;
    return (
      char === char.toUpperCase() &&
      char !== char.toLowerCase() &&
      shiftOnRef.current &&
      !capsLockedRef.current
    );
  }, []);

  const refreshTouchIntelligenceFromLivePrefix = useCallback(() => {
    if (shouldDeferHeavyTypingSideEffects()) {
      return;
    }
    const prefix = livePrefixRef.current;
    touchIntelligencePreviousKeyRef.current =
      prefix.length > 0 ? prefix[prefix.length - 1]!.toLowerCase() : null;
    if (layoutContext) {
      updatePredictiveHitboxes(prefix, layoutContext.getLayouts(), {
        enabled: theme.predictiveHitboxesEnabled,
        lang: getActiveLanguage(),
      });
      setPredictiveHitboxTick(tick => tick + 1);
    }
    syncTouchIntelligenceToNative();
  }, [layoutContext, syncTouchIntelligenceToNative, theme.predictiveHitboxesEnabled]);

  /** Uppercase at most one letter per shift tap — uses refs so fast typing can't double-cap. */
  const consumeLetterCommitText = useCallback((keyValue: string): string => {
    if (layoutRef.current !== 'letters' || !keyValue) {
      return keyValue;
    }
    if (capsLockedRef.current) {
      return keyValue.toUpperCase();
    }
    if (shiftOnRef.current) {
      autoShiftConsumedMidWordRef.current = true;
      shiftOnRef.current = false;
      isUppercaseRef.current = capsLockedRef.current;
      syncNativeFastPathCaseState();
      setShiftOn(false);
      lastLetterCommitAtRef.current = Date.now();
      return keyValue.toUpperCase();
    }
    return keyValue.toLowerCase();
  }, [syncNativeFastPathCaseState]);
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
  const isGifCategory = isEmojiMode && emojiPanelTab === 'gif';
  const isStickerCategory = isEmojiMode && emojiPanelTab === 'stickers';
  const isSfxCategory = isEmojiMode && emojiPanelTab === 'sfx';
  const isGifSearchMode = isGifCategory && gifSearchActive;
  const isSfxSearchMode = isSfxCategory && sfxSearchActive;
  const isEmojiSearchMode =
    isEmojiMode && emojiPanelTab === 'emojis' && emojiSearchActive;
  const gestureEnabled =
    !zeroLatencyMode &&
    gestureSettings.swipeTyping &&
    layout === 'letters' &&
    mode.type === 'typing' &&
    !isSwipeTypingDisabledForLayout(theme.letterLayoutId);
  const controllerKeyboardActive =
    controllerSettings.enabled && controllerConnected && theme.isLandscape;

  const [customLayoutsTick, setCustomLayoutsTick] = useState(0);

  const rows = useMemo(() => {
    let baseRows = getKeyboardRows(layout, theme.letterLayoutId);
    if (layout === 'letters' && theme.design === 'apple' && baseRows.length > 0) {
      baseRows = [...baseRows.slice(0, -1), APPLE_BOTTOM_ROW];
    }
    if (layout === 'letters' && theme.numberRowEnabled) {
      return [DIGITS_ROW, ...baseRows];
    }
    return baseRows;
  }, [layout, theme.design, theme.letterLayoutId, customLayoutsTick, theme.numberRowEnabled]);

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

  const letterRowsStyle = useMemo(
    () => [
      resizeRowsExtraMargin !== undefined
        ? {marginBottom: resizeRowsExtraMargin}
        : undefined,
      numberRowLayoutBoost
        ? {
            marginBottom: numberRowLayoutBoost.keyRowMargin,
            gap: numberRowLayoutBoost.keyGap,
          }
        : undefined,
    ],
    [resizeRowsExtraMargin, numberRowLayoutBoost],
  );

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
    scheduleBackgroundEnglishSymSpellSeed();
    scheduleEnglishWordSetBuild();
    void ensurePersonalTypingLoaded();
    void preloadActiveDictionary();
    return installTouchIntelligenceNativeTelemetry();
  }, []);

  useEffect(() => {
    void hydrateTouchIntelligenceHitsFromStorage();
  }, []);

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
      keyboardOpaqueKeyFill(theme, 'letter'),
      theme.label,
      fontAsset,
      theme.keyRadius,
    );
  }, [theme.design, theme.keyRadius, theme.label, theme.scheme, theme.letterKey]);

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
    syncNativeFastPathCaseState();
  }, [syncNativeFastPathCaseState]);

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
        hasTypedInFieldRef.current = true;
      } else if (hasTypedInFieldRef.current) {
        emptyContextTrustworthyRef.current = false;
      }

      const recentLetterCommit =
        Date.now() - lastLetterCommitAtRef.current < 800;

      const midWordFromContext = extractCurrentWord(context).length > 0;
      const staleEmptyWhileTyping =
        hasTypedInFieldRef.current && context.trim().length === 0;

      if (autoShiftConsumedMidWordRef.current) {
        if (shiftOnRef.current) {
          shiftOnRef.current = false;
          setShiftOn(false);
          syncNativeFastPathCaseState();
        }
        return;
      }

      let shouldCap = false;
      if (
        livePrefixRef.current.length > 0 ||
        recentLetterCommit ||
        midWordFromContext ||
        staleEmptyWhileTyping
      ) {
        shouldCap = false;
      } else if (Platform.OS === 'android') {
        shouldCap = keyboardBridge.getAutoCapitalizeAtCursor();
      } else {
        shouldCap = shouldAutoCapitalizeShift(context, {
          inputRequestsInitialCaps: inputInitialCapsMode,
          hasTypedSinceFocus: hasTypedInFieldRef.current,
          emptyContextTrustworthy: emptyContextTrustworthyRef.current,
          recentLetterCommit,
          fieldWasCleared: options.fieldWasCleared ?? false,
          midWordPrefix: livePrefixRef.current,
        });
      }
      if (shouldCap !== shiftOnRef.current) {
        shiftOnRef.current = shouldCap;
        setShiftOn(shouldCap);
        syncNativeFastPathCaseState();
      }
    },
    [inputInitialCapsMode, syncNativeFastPathCaseState, theme.autoCapitalizeEnabled],
  );

  const resetTypingCompositorState = useCallback(() => {
    livePrefixRef.current = '';
    previousWordRef.current = '';
    lastInstantPrefixRef.current = '';
    touchIntelligencePreviousKeyRef.current = null;
    autocorrectPreviewRef.current = null;
    lastAiProofreadOriginalRef.current = null;
    aiPreflightCacheRef.current.clear();
    if (aiPreflightTimerRef.current) {
      clearTimeout(aiPreflightTimerRef.current);
      aiPreflightTimerRef.current = null;
    }
    aiPreflightRunIdRef.current += 1;
    if (aiProofreadTimerRef.current) {
      clearTimeout(aiProofreadTimerRef.current);
      aiProofreadTimerRef.current = null;
    }
    aiProofreadRunIdRef.current += 1;
    setAutocorrectPreview(null);
    setTypedKeepSuggestion(null);
    setAiAutocorrectSuggestion(null);
    setIsAiAutocorrectProcessing(false);
    setCurrentPrefix('');
    setSuggestions([]);
    clearNativeSuggestionSnapshot();
  }, []);

  const syncTypingCompositorFromEditor = useCallback(
    (context: string, options: {recentLetterCommit?: boolean} = {}) => {
      const recentLetterCommit =
        options.recentLetterCommit ??
        Date.now() - lastLetterCommitAtRef.current < 350;
      const prefix = reconcileLivePrefixFromContext(
        context,
        livePrefixRef.current,
        recentLetterCommit,
      );
      livePrefixRef.current = prefix;
      previousWordRef.current = derivePreviousWordFromEditor(context, prefix);

      if (!context.trim() && !recentLetterCommit) {
        hasTypedInFieldRef.current = false;
        emptyContextTrustworthyRef.current = true;
        if (prefix.length === 0) {
          resetTypingCompositorState();
        }
      }
    },
    [resetTypingCompositorState],
  );

  const resetToMainAlphabetView = useCallback(() => {
    // Update refs immediately so guards and the next paint see the main alphabet view.
    layoutRef.current = 'letters';
    modeRef.current = {type: 'typing'};
    capsLockedRef.current = false;
    emojiPanelTabRef.current = DEFAULT_EMOJI_PANEL_TAB;
    emojiSubcategoryRef.current = DEFAULT_EMOJI_SUBCATEGORY;
    gifSearchActiveRef.current = false;
    emojiSearchActiveRef.current = false;
    sfxSearchActiveRef.current = false;
    livePrefixRef.current = '';
    zeroLatencyModeRef.current = false;
    setZeroLatencyRuntimeActive(false);
    keyboardBridge.setNativeZeroLatencyMode(false);

    setMode({type: 'typing'});
    setLayout('letters');
    setEmojiPanelTab(DEFAULT_EMOJI_PANEL_TAB);
    setEmojiSubcategory(DEFAULT_EMOJI_SUBCATEGORY);
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
    stoppedTypingRef.current = true;
    setStoppedTyping(true);
    setZeroLatencyMode(false);
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
    if (aiPreflightTimerRef.current) {
      clearTimeout(aiPreflightTimerRef.current);
      aiPreflightTimerRef.current = null;
    }
    aiPreflightRunIdRef.current += 1;
    aiPreflightCacheRef.current.clear();
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

  const activateZeroLatencyMode = useCallback((options?: {silent?: boolean}) => {
    if (zeroLatencyModeRef.current || modeRef.current.type !== 'typing') {
      return;
    }

    if (!options?.silent) {
      keyboardBridge.performLightKeyHaptic();
    }
    zeroLatencyModeRef.current = true;
    setZeroLatencyRuntimeActive(true);
    keyboardBridge.setNativeZeroLatencyMode(true);
    suggestionRefreshRunIdRef.current += 1;
    aiProofreadRunIdRef.current += 1;
    livePrefixRef.current = '';
    lastInstantPrefixRef.current = '';
    autocorrectPreviewRef.current = null;

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
    if (aiPreflightTimerRef.current) {
      clearTimeout(aiPreflightTimerRef.current);
      aiPreflightTimerRef.current = null;
    }
    aiPreflightRunIdRef.current += 1;
    aiPreflightCacheRef.current.clear();
    if (backspaceBarTimerRef.current) {
      clearTimeout(backspaceBarTimerRef.current);
      backspaceBarTimerRef.current = null;
    }
    if (instantSuggestionRafRef.current != null) {
      cancelAnimationFrame(instantSuggestionRafRef.current);
      instantSuggestionRafRef.current = null;
    }

    setZeroLatencyMode(true);
  }, []);

  const deactivatePerformanceModes = useCallback(() => {
    zeroLatencyModeRef.current = false;
    gamePerformanceModeRef.current = false;
    autoGamePerformanceRef.current = false;
    setZeroLatencyRuntimeActive(false);
    setGamePerformanceModeActive(false);
    keyboardBridge.setGamePerformanceMode(false);
    setGamePerformanceActive(false);
    keyboardBridge.setNativeZeroLatencyMode(false);
    setZeroLatencyMode(false);
  }, []);

  const activateGamePerformanceMode = useCallback(() => {
    if (gamePerformanceModeRef.current) {
      return;
    }
    gamePerformanceModeRef.current = true;
    autoGamePerformanceRef.current = true;
    setGamePerformanceModeActive(true);
    keyboardBridge.setGamePerformanceMode(true);
    setGamePerformanceActive(true);
  }, []);

  useEffect(() => {
    const hiddenSubscription = DeviceEventEmitter.addListener(
      'keyboardHidden',
      () => {
        stopSfxPreview();
        resetToMainAlphabetView();
        if (autoGamePerformanceRef.current) {
          deactivatePerformanceModes();
        }
      },
    );
    return () => {
      hiddenSubscription.remove();
    };
  }, [resetToMainAlphabetView, deactivatePerformanceModes]);

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
        lastLetterCommitAtRef.current = 0;
        setInputInitialCapsMode(Boolean(mode));
        void keyboardBridge.getTextBeforeCursor(96).then(context => {
          hasTypedInFieldRef.current = context.length > 0;
          emptyContextTrustworthyRef.current = context.length > 0;
          syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
        });
      },
    );
    const shownSubscription = DeviceEventEmitter.addListener('keyboardShown', () => {
      void reloadGestures();
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        syncTypingCompositorFromEditor(context);
        hasTypedInFieldRef.current = context.length > 0;
        emptyContextTrustworthyRef.current = context.length > 0;
        lastLetterCommitAtRef.current = 0;
        syncAutoCapitalizeShift(context, {fieldWasCleared: context.length === 0});
      });
      void keyboardBridge.isCurrentEditorGame().then(isGame => {
        if (isGame && modeRef.current.type === 'typing') {
          activateGamePerformanceMode();
        }
      });
    });
    return () => {
      capsSubscription.remove();
      shownSubscription.remove();
    };
  }, [
    reloadGestures,
    syncAutoCapitalizeShift,
    syncTypingCompositorFromEditor,
    activateGamePerformanceMode,
  ]);

  useEffect(() => {
    const editorContextSubscription = DeviceEventEmitter.addListener(
      'keyboardEditorContextChanged',
      (payload: {textBeforeCursor?: string} | null) => {
        if (shouldDeferHeavyTypingSideEffects()) {
          return;
        }
        const context =
          payload && typeof payload.textBeforeCursor === 'string'
            ? payload.textBeforeCursor
            : '';
        syncTypingCompositorFromEditor(context);
        const recentLetterCommit =
          Date.now() - lastLetterCommitAtRef.current < 400;
        if (
          !context.trim() &&
          !hasTypedInFieldRef.current &&
          livePrefixRef.current.length === 0 &&
          !recentLetterCommit
        ) {
          syncAutoCapitalizeShift(context, {fieldWasCleared: true});
        }
      },
    );
    const sessionStartSubscription = DeviceEventEmitter.addListener(
      'keyboardSessionStart',
      () => {
        resetTypingCompositorState();
      },
    );
    return () => {
      editorContextSubscription.remove();
      sessionStartSubscription.remove();
    };
  }, [
    resetTypingCompositorState,
    syncAutoCapitalizeShift,
    syncTypingCompositorFromEditor,
  ]);

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
      ensurePersonalTypingLoaded(),
    ]);
    setAutocorrectSettings(getAutocorrectSettings());
  }, []);

  useEffect(() => {
    void Promise.all([
      ensurePersonalTypingLoaded(),
      ensureAutocorrectLoaded(),
    ]).then(() => {
      suggestionDictionariesReadyRef.current = true;
      preloadContextBigrams();
    });
  }, []);

  useEffect(() => {
    const capture =
      theme.developerEyeEnabled &&
      autocorrectSettings.contextCorrectionEnabled;
    setContextCorrectionDebugCapture(capture);
    if (capture) {
      preloadContextBigrams();
    }
    return () => setContextCorrectionDebugCapture(false);
  }, [
    theme.developerEyeEnabled,
    autocorrectSettings.contextCorrectionEnabled,
  ]);

  useEffect(() => {
    if (!theme.developerEyeEnabled) {
      return;
    }
    setContextCorrectionTick(tick => tick + 1);
  }, [
    currentPrefix,
    autocorrectPreview,
    typedKeepSuggestion,
    theme.developerEyeEnabled,
  ]);

  const markTyping = useCallback(() => {
    if (zeroLatencyModeRef.current || isBurstTyping(lastLetterCommitAtRef.current)) {
      return;
    }
    lastTypingAtRef.current = Date.now();
    aiProofreadRunIdRef.current += 1;
    aiPreflightRunIdRef.current += 1;
    if (aiPreflightTimerRef.current) {
      clearTimeout(aiPreflightTimerRef.current);
      aiPreflightTimerRef.current = null;
    }
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
    setEmojiPanelTab(DEFAULT_EMOJI_PANEL_TAB);
    setEmojiSubcategory(DEFAULT_EMOJI_SUBCATEGORY);
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
    if (emojiPanelTab === 'gif') {
      setEmojiSearchQuery('');
      setEmojiSearchActive(false);
      setSfxSearchQuery('');
      setSfxSearchActive(false);
      stopSfxPreview();
    } else if (emojiPanelTab === 'stickers') {
      setGifSearchQuery('');
      setGifSearchActive(false);
      setEmojiSearchQuery('');
      setEmojiSearchActive(false);
      setSfxSearchQuery('');
      setSfxSearchActive(false);
      stopSfxPreview();
    } else if (emojiPanelTab === 'sfx') {
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
  }, [emojiPanelTab]);

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
    const runId = suggestionRefreshRunIdRef.current + 1;
    suggestionRefreshRunIdRef.current = runId;
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

    const fast = options?.fast ?? false;
    const livePrefix = livePrefixRef.current;
    const canUseLivePrefixFastPath =
      fast && livePrefix.length > 0 && !livePrefix.includes('@');

    if (canUseLivePrefixFastPath) {
      const barState = computeTypingSuggestionBar(livePrefix, {
        fast: true,
        previousWord: previousWordRef.current,
        suggestionsOnly: true,
      });
      startTransition(() => {
        setCurrentPrefix(livePrefix);
        setTypedKeepSuggestion(barState.typedKeepSuggestion);
        setAutocorrectPreview(barState.autocorrectPreview);
        autocorrectPreviewRef.current = barState.autocorrectPreview;
        setSuggestions(barState.suggestions);
        setEssentialSuggestions([]);
        setEssentialTriggerLength(0);
      });
      return;
    }

    await ensureEssentialsLoaded();
    const context = await keyboardBridge.getTextBeforeCursor(96);
    if (suggestionRefreshRunIdRef.current !== runId) {
      return;
    }
    if (context.length === 0 && emptyContextTrustworthyRef.current) {
      if (
        !livePrefixRef.current &&
        !hasTypedInFieldRef.current &&
        Date.now() - lastLetterCommitAtRef.current > 250
      ) {
        hasTypedInFieldRef.current = false;
        livePrefixRef.current = '';
      }
    }
    const recentLetterCommitForCap =
      Date.now() - lastLetterCommitAtRef.current < 800;
    if (
      !autoShiftConsumedMidWordRef.current &&
      livePrefixRef.current.length === 0 &&
      !recentLetterCommitForCap
    ) {
      syncAutoCapitalizeShift(context, {
        fieldWasCleared:
          context.length === 0 && emptyContextTrustworthyRef.current,
      });
    }
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
      void ensurePersonalTypingLoaded().then(() => {
        suggestionDictionariesReadyRef.current = true;
      });
    }

    const recentlyCommitted =
      Date.now() - lastLetterCommitAtRef.current < 250;
    const prefix = reconcileLivePrefixFromContext(
      context,
      livePrefixRef.current,
      recentlyCommitted,
    );
    livePrefixRef.current = prefix;
    previousWordRef.current = derivePreviousWordFromEditor(context, prefix);

    const barState = computeTypingSuggestionBar(prefix, {
      fast,
      context,
      previousWord: previousWordRef.current,
      suggestionsOnly: fast,
    });

    startTransition(() => {
      setCurrentPrefix(prefix);
      setTypedKeepSuggestion(barState.typedKeepSuggestion);
      setAutocorrectPreview(barState.autocorrectPreview);
      autocorrectPreviewRef.current = barState.autocorrectPreview;
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

  const clearSuggestionBarForPrefix = useCallback((prefix: string) => {
    suggestionRefreshRunIdRef.current += 1;
    lastInstantPrefixRef.current = prefix;
    autocorrectPreviewRef.current = null;
    startTransition(() => {
      setCurrentPrefix(prefix);
      setTypedKeepSuggestion(null);
      setAutocorrectPreview(null);
      setSuggestions([]);
      setEssentialSuggestions([]);
      setEssentialTriggerLength(0);
    });
  }, []);

  const applyInstantSuggestionBar = useCallback((prefix: string) => {
    if (INSTANT_SUGGESTION_DISABLED) {
      return;
    }
    if (shouldDeferLiveSuggestionBar()) {
      return;
    }
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }
    if (prefix.length > 0 && shouldSkipAutocorrectForToken(prefix)) {
      if (prefix === lastInstantPrefixRef.current) {
        return;
      }
      clearSuggestionBarForPrefix(prefix);
      return;
    }
    if (prefix === lastInstantPrefixRef.current) {
      return;
    }
    suggestionRefreshRunIdRef.current += 1;
    const flush = () => {
      instantSuggestionRafRef.current = null;
      const nextPrefix = livePrefixRef.current;
      if (nextPrefix === lastInstantPrefixRef.current) {
        return;
      }
      if (
        nextPrefix &&
        Date.now() - instantSuggestionLastFlushAtRef.current <
          INSTANT_SUGGESTION_MIN_INTERVAL_MS
      ) {
        return;
      }
      instantSuggestionLastFlushAtRef.current = Date.now();
      lastInstantPrefixRef.current = nextPrefix;
      if (Platform.OS === 'android') {
        syncNativeSuggestionPrefix(nextPrefix);
      }

      const commitSuggestionBarState = (
        barState: ReturnType<typeof computeTypingSuggestionBar>,
        suggestions: string[],
      ) => {
        if (
          nextPrefix === lastFlushedBarPrefixRef.current &&
          suggestionListsEqual(suggestions, lastFlushedSuggestionsRef.current) &&
          barState.autocorrectPreview === lastFlushedAutocorrectRef.current &&
          barState.typedKeepSuggestion === lastFlushedTypedKeepRef.current
        ) {
          return;
        }
        lastFlushedBarPrefixRef.current = nextPrefix;
        lastFlushedSuggestionsRef.current = suggestions;
        lastFlushedAutocorrectRef.current = barState.autocorrectPreview;
        lastFlushedTypedKeepRef.current = barState.typedKeepSuggestion;
        startTransition(() => {
          setCurrentPrefix(nextPrefix);
          setTypedKeepSuggestion(barState.typedKeepSuggestion);
          setAutocorrectPreview(barState.autocorrectPreview);
          autocorrectPreviewRef.current = barState.autocorrectPreview;
          setSuggestions(suggestions);
          setEssentialSuggestions([]);
          setEssentialTriggerLength(0);
        });
      };

      if (!nextPrefix) {
        startTransition(() => {
          setCurrentPrefix('');
          setTypedKeepSuggestion(null);
          setAutocorrectPreview(null);
          autocorrectPreviewRef.current = null;
          setEssentialSuggestions([]);
          setEssentialTriggerLength(0);
          lastFlushedBarPrefixRef.current = '';
          lastFlushedSuggestionsRef.current = [];
          lastFlushedAutocorrectRef.current = null;
          // Hinglish / Franglais: keep preferred-language starters visible between words.
          if (getActiveLanguage() === 'hi-en' || getActiveLanguage() === 'fr-en') {
            const barState = computeTypingSuggestionBar('', {fast: true});
            setSuggestions(barState.suggestions);
            lastFlushedSuggestionsRef.current = barState.suggestions;
          } else {
            setSuggestions([]);
          }
        });
        return;
      }

      const barState = computeTypingSuggestionBar(nextPrefix, {
        fast: true,
        previousWord: previousWordRef.current,
        suggestionsOnly: true,
        prefixOnly: isBurstTypingActive(),
      });
      const suggestions =
        barState.suggestions.length > 0
          ? barState.suggestions
          : ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i'].filter(
              word => word.startsWith(nextPrefix.toLowerCase()),
            );
      commitSuggestionBarState(barState, suggestions);
    };

    if (instantSuggestionRafRef.current !== null) {
      return;
    }
    instantSuggestionRafRef.current = requestAnimationFrame(flush);
  }, [clearSuggestionBarForPrefix]);

  const flushTypingIdleSideEffects = useCallback(() => {
    if (shouldDeferHeavyTypingSideEffects()) {
      return;
    }
    syncTouchIntelligenceToNative();
    applyInstantSuggestionBar(livePrefixRef.current);
  }, [applyInstantSuggestionBar]);

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
      const contextBefore = context.slice(0, context.length - match.replaceLength);
      const correction = finalizeTypeLiftCorrection(
        contextBefore,
        edit.original,
        edit.correction,
      );
      keyboardBridge.replaceWordPrefix(
        match.replaceLength,
        correction + match.replacementSuffix,
      );
      recordAutocorrectHistory({
        original: edit.original,
        correction,
        boundary: match.replacementSuffix,
      });
      lastAiProofreadOriginalRef.current = correction;
      setAiAutocorrectSuggestion(null);
      if (shiftOnRef.current && !capsLockedRef.current) {
        shiftOnRef.current = false;
        setShiftOn(false);
        syncNativeFastPathCaseState();
      }
      livePrefixRef.current = '';
      touchIntelligencePreviousKeyRef.current =
        correction.length > 0
          ? correction[correction.length - 1]!.toLowerCase()
          : null;
      syncTouchIntelligenceToNative();
      requestAnimationFrame(() => {
        void keyboardBridge.getTextBeforeCursor(96).then(nextContext => {
          syncAutoCapitalizeShift(nextContext);
        });
        void refreshSuggestions();
      });
      return true;
    },
    [
      recordAutocorrectHistory,
      refreshSuggestions,
      syncAutoCapitalizeShift,
      syncNativeFastPathCaseState,
      syncTouchIntelligenceToNative,
    ],
  );

  const scheduleAiPreflight = useCallback(() => {
    if (
      zeroLatencyModeRef.current ||
      isBurstTyping(lastLetterCommitAtRef.current) ||
      layoutRef.current !== 'letters' ||
      modeRef.current.type !== 'typing'
    ) {
      return;
    }
    const settings = getAutocorrectSettings();
    if (!settings.enabled || !settings.aiAutoCorrectEnabled) {
      return;
    }

    const token = livePrefixRef.current.trim();
    if (
      token.length < AI_PREFLIGHT_MIN_TOKEN_LENGTH ||
      shouldSkipAutocorrectForToken(token)
    ) {
      return;
    }

    if (aiPreflightTimerRef.current) {
      clearTimeout(aiPreflightTimerRef.current);
    }
    const runId = aiPreflightRunIdRef.current + 1;
    aiPreflightRunIdRef.current = runId;
    aiPreflightTimerRef.current = setTimeout(() => {
      aiPreflightTimerRef.current = null;
      const requestedToken = token;
      if (livePrefixRef.current.trim() !== requestedToken) {
        return;
      }
      const localCandidate = getAutocorrectCandidate(requestedToken, {
        lightweight: true,
        skipFrequentScan: true,
        previousWord: previousWordRef.current,
      });
      if (localCandidate && localCandidate.confidence >= 0.82) {
        return;
      }
      const startedAt = Date.now();
      recordAiPreflightRequest();
      void proofreadActiveToken(requestedToken)
        .then(result => {
          const accepted =
            result.kind === 'auto' || result.kind === 'suggest';
          recordAiPreflightResult(Date.now() - startedAt, accepted);
          if (
            aiPreflightRunIdRef.current !== runId ||
            livePrefixRef.current.trim() !== requestedToken ||
            !accepted
          ) {
            if (aiPreflightRunIdRef.current !== runId) {
              recordAiPreflightStale();
            }
            return;
          }
          const cache = aiPreflightCacheRef.current;
          cache.delete(requestedToken);
          cache.set(requestedToken, result);
          while (cache.size > AI_PREFLIGHT_CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            if (typeof oldest !== 'string') {
              break;
            }
            cache.delete(oldest);
          }
          if (result.kind === 'suggest') {
            setAiAutocorrectSuggestion(result);
          }
        });
    }, AI_PREFLIGHT_DEBOUNCE_MS);
  }, []);

  const scheduleAiProofread = useCallback(
    (delayMs = AI_PROOFREAD_DELAY_MS) => {
      if (
        zeroLatencyModeRef.current ||
        layoutRef.current !== 'letters' ||
        modeRef.current.type !== 'typing'
      ) {
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
          const idleMs = Date.now() - lastTypingAtRef.current;
          if (idleMs < AI_PROOFREAD_MIN_IDLE_MS) {
            console.log(AI_AUTOCORRECT_LOG_PREFIX, 'run skipped: still typing', {
              idleMs,
              runId,
            });
            return;
          }
          if (
            zeroLatencyModeRef.current ||
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

  const scheduleRefreshSuggestions = useCallback(
    (options?: {deleting?: boolean; skipHeavy?: boolean}) => {
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }

    if (options?.skipHeavy) {
      if (suggestionRefreshTimerRef.current) {
        clearTimeout(suggestionRefreshTimerRef.current);
        suggestionRefreshTimerRef.current = null;
      }
      return;
    }

    if (!options?.deleting) {
      applyInstantSuggestionBar(livePrefixRef.current);
    } else if (livePrefixRef.current.length === 0) {
      applyInstantSuggestionBar('');
    } else if (shouldSkipAutocorrectForToken(livePrefixRef.current)) {
      return;
    }

    if (suggestionRefreshTimerRef.current) {
      clearTimeout(suggestionRefreshTimerRef.current);
    }
    if (zeroLatencyModeRef.current) {
      return;
    }
    const debounceMs = options?.deleting
      ? BACKSPACE_SUGGESTION_DEBOUNCE_MS
      : SUGGESTION_FULL_REFRESH_DEBOUNCE_MS;
    suggestionRefreshTimerRef.current = setTimeout(() => {
      suggestionRefreshTimerRef.current = null;
      // Keep the background path prefix-only while typing. Full SymSpell
      // autocorrect is still applied at the word boundary, but the debounced
      // refresh uses the high-confidence fast preview path.
      void refreshSuggestions({fast: true});
    }, debounceMs);
  },
  [applyInstantSuggestionBar, refreshSuggestions],
  );

  const cancelPendingInstantSuggestionBar = useCallback(() => {
    if (instantSuggestionRafRef.current !== null) {
      cancelAnimationFrame(instantSuggestionRafRef.current);
      instantSuggestionRafRef.current = null;
    }
  }, []);

  const flushBackspaceSuggestionBar = useCallback(() => {
    backspaceBarTimerRef.current = null;
    cancelPendingInstantSuggestionBar();
    if (
      zeroLatencyModeRef.current ||
      layoutRef.current !== 'letters' ||
      modeRef.current.type !== 'typing'
    ) {
      return;
    }

    const prefix = livePrefixRef.current;
    if (prefix.length === 0 || shouldSkipAutocorrectForToken(prefix)) {
      clearSuggestionBarForPrefix(prefix);
      if (prefix.length === 0) {
        applyInstantSuggestionBar('');
      }
      return;
    }

    if (prefix === lastInstantPrefixRef.current) {
      return;
    }
    suggestionRefreshRunIdRef.current += 1;
    lastInstantPrefixRef.current = prefix;

    const barState = computeTypingSuggestionBar(prefix, {
      fast: true,
      previousWord: previousWordRef.current,
      suggestionsOnly: true,
    });
    setCurrentPrefix(prefix);
    setTypedKeepSuggestion(barState.typedKeepSuggestion);
    setAutocorrectPreview(barState.autocorrectPreview);
    autocorrectPreviewRef.current = barState.autocorrectPreview;
    setSuggestions(barState.suggestions);
    setEssentialSuggestions([]);
    setEssentialTriggerLength(0);

    if (suggestionRefreshTimerRef.current) {
      clearTimeout(suggestionRefreshTimerRef.current);
      suggestionRefreshTimerRef.current = null;
    }
  }, [
    applyInstantSuggestionBar,
    cancelPendingInstantSuggestionBar,
    clearSuggestionBarForPrefix,
  ]);

  const scheduleBackspaceBarFlush = useCallback(() => {
    if (zeroLatencyModeRef.current) {
      return;
    }
    if (backspaceBarTimerRef.current) {
      clearTimeout(backspaceBarTimerRef.current);
    }
    backspaceBarTimerRef.current = setTimeout(() => {
      flushBackspaceSuggestionBar();
    }, BACKSPACE_BAR_FLUSH_MS);
  }, [flushBackspaceSuggestionBar]);

  useEffect(() => {
    return () => {
      if (suggestionRefreshTimerRef.current) {
        clearTimeout(suggestionRefreshTimerRef.current);
      }
      if (backspaceBarTimerRef.current) {
        clearTimeout(backspaceBarTimerRef.current);
      }
      if (aiProofreadTimerRef.current) {
        clearTimeout(aiProofreadTimerRef.current);
      }
      if (aiPreflightTimerRef.current) {
        clearTimeout(aiPreflightTimerRef.current);
      }
      aiPreflightRunIdRef.current += 1;
      aiPreflightCacheRef.current.clear();
    };
  }, []);

  const commitTypedWordBoundary = useCallback(
    async (
      insertBoundary: () => void,
      boundary = '',
      typedWordFallback = '',
      options?: {
        boundaryPreInserted?: boolean;
        contextPromise?: Promise<string>;
      },
    ) => {
      clearMidWordAutoShift();
      const zeroLatency = zeroLatencyModeRef.current;
      const boundaryLength = options?.boundaryPreInserted ? boundary.length : 0;
      const boundaryText = options?.boundaryPreInserted ? boundary : '';
      const applyBoundary = () => {
        if (!options?.boundaryPreInserted) {
          insertBoundary();
        }
      };
      const context = await (options?.contextPromise ??
        keyboardBridge.getTextBeforeCursor(96));
      syncTypingCompositorFromEditor(context);
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
        applyBoundary();
        if (!zeroLatency) {
          scheduleAiProofread();
          requestAnimationFrame(() => {
            void refreshSuggestions();
          });
        }
        return;
      }

      if (!suggestionDictionariesReadyRef.current) {
        void Promise.all([
          ensurePersonalTypingLoaded(),
          ensureAutocorrectLoaded(),
        ]).then(() => {
          suggestionDictionariesReadyRef.current = true;
        });
      }

      let typedWord = extractCurrentWord(context);
      typedWord = pickTypedWordForBoundary(context, livePrefixRef.current);
      const autocorrectOn = getAutocorrectSettings().enabled;

      if (autocorrectOn && typedWord.length >= 2) {
        const preflight = aiPreflightCacheRef.current.get(typedWord);
        aiPreflightCacheRef.current.delete(typedWord);
        if (preflight?.kind === 'auto') {
          const applied = await applyAiAutocorrectEdit(preflight);
          if (applied) {
            applyBoundary();
            if (!zeroLatency) {
              requestAnimationFrame(() => {
                void refreshSuggestions();
              });
            }
            return;
          }
        }

        const phraseFix = getPhraseCorrection(context, typedWord);
        if (phraseFix) {
          const original = context.slice(
            Math.max(0, context.length - phraseFix.replaceLength),
          );
          keyboardBridge.replaceWordPrefix(
          phraseFix.replaceLength + boundaryLength,
          phraseFix.phrase + boundaryText,
          );
          recordLearnedPhrase(phraseFix.phrase);
          for (const part of phraseFix.phrase.split(' ')) {
            recordLearnedWord(part);
          }
          learnPhrasesFromContext(
            context.slice(0, context.length - phraseFix.replaceLength) +
              phraseFix.phrase,
          );
          applyBoundary();
          if (!zeroLatency) {
            scheduleAiProofread();
          }
          if (boundary) {
            recordAutocorrectHistory({
              original,
              correction: phraseFix.phrase,
              boundary,
            });
          }
          if (!zeroLatency) {
            requestAnimationFrame(() => {
              void refreshSuggestions();
            });
          }
          return;
        }

        let candidate = getAutocorrectCandidate(typedWord, {
          lightweight: true,
          skipFrequentScan: true,
          boundary: true,
          context,
          previousWord: extractPreviousWordFromContext(
            context,
            typedWord,
          ),
        });
        if (
          candidate &&
          !isEnglishSymSpellReady() &&
          candidate.confidence < 0.92 &&
          !candidate.correction.includes(' ')
        ) {
          candidate = null;
        }
        if (shouldAutoApply(candidate, typedWord)) {
          keyboardBridge.replaceWordPrefix(
            typedWord.length + boundaryLength,
            candidate!.correction + boundaryText,
          );
          observeCorrectionAccepted(typedWord, candidate!.correction);
          const correctionParts = candidate!.correction.split(/\s+/);
          for (const part of correctionParts) {
            recordLearnedWord(part, 'corrected');
          }
          learnPhrasesFromContext(
            context.slice(0, Math.max(0, context.length - typedWord.length)) +
              candidate!.correction,
          );
          applyBoundary();
          if (!zeroLatency) {
            scheduleAiProofread();
          }
          if (boundary) {
            recordAutocorrectHistory({
              original: typedWord,
              correction: candidate!.correction,
              boundary,
            });
          }
          if (!zeroLatency) {
            requestAnimationFrame(() => {
              void refreshSuggestions();
            });
          }
          return;
        }
      }

      if (typedWord) {
        // Only auto-learn dictionary words (or words the user already taught via
        // the keep chip). Learning OOV typos/run-ons used to permanently disable
        // autocorrect for that token.
        const lower = typedWord.toLowerCase();
        if (isDictionaryWord(lower) || (getLearnedCounts().get(lower) ?? 0) > 0) {
          recordLearnedWord(typedWord, 'typed');
        }
        recordWordCommitted();
      }
      if (boundary && /[^\w\s]/.test(boundary)) {
        observePunctuationPattern(boundary);
      }
      learnPhrasesFromContext(context);

      applyBoundary();
      if (!zeroLatency) {
        scheduleAiProofread();
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
      }
    },
    [
      clearMidWordAutoShift,
      openRewritePanel,
      applyAiAutocorrectEdit,
      recordAutocorrectHistory,
      refreshSuggestions,
      scheduleAiProofread,
      syncTypingCompositorFromEditor,
    ],
  );

  useEffect(() => {
    if (autoShiftConsumedMidWordRef.current && shiftOn) {
      return;
    }
    syncNativeFastPathCaseState();
  }, [shiftOn, capsLocked, syncNativeFastPathCaseState]);

  useEffect(() => {
    keyboardBridge.setNativeShiftConsumedHandler(syncNativeShiftConsumed);
    return () => {
      keyboardBridge.setNativeShiftConsumedHandler(null);
    };
  }, [syncNativeShiftConsumed]);

  useEffect(() => {
    if (layout !== 'letters' || mode.type !== 'typing') {
      return;
    }
    if (
      autoShiftConsumedMidWordRef.current ||
      livePrefixRef.current.length > 0 ||
      Date.now() - lastLetterCommitAtRef.current < 800
    ) {
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
        ensurePersonalTypingLoaded(),
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
        setNativeFastPathLayoutHold(true);
        nativeFastPathActiveRef.current = false;
        keyboardBridge.setNativeKeyFastPathConfig(
          JSON.stringify({enabled: false}),
        );
        layoutContext?.requestRemeasure();
      },
    );
    return () => subscription.remove();
  }, [layoutContext]);

  useEffect(() => {
    if (!nativeFastPathLayoutHold) {
      return;
    }
    const timer = setTimeout(() => {
      setNativeFastPathLayoutHold(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [nativeFastPathLayoutHold, layoutContext?.layoutEpoch, theme.isLandscape]);

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
      syncNativeFastPathCaseState();
      return;
    }

    if (capsLockedRef.current) {
      capsLockedRef.current = false;
      shiftOnRef.current = false;
      setCapsLocked(false);
      setShiftOn(false);
      syncNativeFastPathCaseState();
      return;
    }

    const nextShift = !shiftOnRef.current;
    autoShiftConsumedMidWordRef.current = false;
    keyboardBridge.clearNativeMidWordShiftBlock();
    shiftOnRef.current = nextShift;
    setShiftOn(nextShift);
    syncNativeFastPathCaseState();
  }, [syncNativeFastPathCaseState]);

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
        const isKeepChip =
          typedKeepSuggestion != null &&
          word === typedKeepSuggestion &&
          currentPrefix.length > 0;

        if (isAutocorrectCorrection && currentPrefix) {
          // Autocorrect corrections (including ones with punctuation like "i guess," or
          // multi-word like "i don't know,") always replace the current typed letters only.
          observeCorrectionAccepted(currentPrefix, word);
          if (word.includes(' ')) {
            recordLearnedPhrase(word, 'corrected');
            for (const part of word.split(' ')) {
              recordLearnedWord(part, 'corrected');
            }
          } else {
            recordLearnedWord(word, 'corrected');
          }
          recordAutocorrectCorrection(currentPrefix, word);
          keyboardBridge.replaceWordPrefix(currentPrefix.length, word);
        } else if (isKeepChip) {
          observeKeepTyped(word, autocorrectPreview ?? undefined);
          recordLearnedWord(word, 'kept');
          keyboardBridge.replaceWordPrefix(currentPrefix.length, word);
          recordWordCommitted();
        } else if (word.includes(' ')) {
          // Phrase suggestions replace a run of recent words from context.
          const trailing = extractTrailingWords(context, 4);
          const replaceLength = trailing.join(' ').length;
          keyboardBridge.replaceWordPrefix(replaceLength, word);
          recordLearnedPhrase(word, 'picked');
          for (const part of word.split(' ')) {
            recordLearnedWord(part, 'picked');
          }
          recordWordCommitted();
        } else {
          recordLearnedWord(word, 'picked');
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
      typedKeepSuggestion,
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

  const handleAutocorrectBackspace = useCallback((): boolean => {
    const edit = autocorrectUndoStackRef.current.at(-1);
    if (!edit) {
      return false;
    }

    void (async () => {
      const expected = `${edit.correction}${edit.boundary}`;
      const context = await keyboardBridge.getTextBeforeCursor(
        expected.length + 8,
      );
      if (!context.endsWith(expected)) {
        autocorrectUndoStackRef.current =
          autocorrectUndoStackRef.current.slice(0, -1);
        keyboardBridge.deleteBackward();
        return;
      }

      autocorrectUndoStackRef.current =
        autocorrectUndoStackRef.current.slice(0, -1);
      autocorrectRedoStackRef.current = [];
      keyboardBridge.replaceWordPrefix(
        expected.length,
        `${edit.original}${edit.boundary}`,
      );
      // Backspace after an unwanted correction is an explicit keep signal.
      // Learn the original token immediately so it is protected next time.
      observeCorrectionRejected(edit.original, edit.correction);
      recordLearnedWord(edit.original, 'kept');
      livePrefixRef.current = '';
      autocorrectPreviewRef.current = null;
      setAutocorrectPreview(null);
      scheduleRefreshSuggestions();
    })();
    return true;
  }, [scheduleRefreshSuggestions]);

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

      if (mode.type === 'typing' && zeroLatencyModeRef.current) {
        if (keyDef.type === 'backspace' || keyDef.type === 'numpad-back') {
          if (keyDef.type === 'backspace' && handleAutocorrectBackspace()) {
            return;
          }
          keyboardBridge.deleteBackward();
          livePrefixRef.current = livePrefixRef.current.slice(0, -1);
          refreshTouchIntelligenceFromLivePrefix();
          return;
        }
        if (
          keyDef.type !== 'space' &&
          keyDef.type !== 'enter' &&
          keyDef.value
        ) {
          const text =
            layout === 'letters'
              ? consumeLetterCommitText(keyDef.value)
              : keyDef.value;
          if (
            nativeFastPathActiveRef.current &&
            keyboardBridge.isNativeTypingCommitActive()
          ) {
            if (layout === 'letters' && /[a-z]/i.test(text)) {
              livePrefixRef.current += text;
            }
            return;
          }
          keyboardBridge.insertText(text);
          if (layout === 'letters' && /[a-z]/i.test(text)) {
            livePrefixRef.current += text;
          }
          return;
        }
      }

      if (mode.type === 'emoji') {
        const panelTab = emojiPanelTabRef.current;
        const gifSearching =
          panelTab === 'gif' && gifSearchActiveRef.current;
        const sfxSearching =
          panelTab === 'sfx' && sfxSearchActiveRef.current;
        const emojiSearching =
          panelTab === 'emojis' && emojiSearchActiveRef.current;
        switch (keyDef.type) {
          case 'letters':
            if (gifSearching || sfxSearching || emojiSearching) {
              setLayout('letters');
              resetCase();
            }
            return;
          case 'numbers':
            if (!gifSearching && !sfxSearching && !emojiSearching) {
              // ABC on the emoji bottom row — return to the typing keyboard.
              void toggleEmojiPanel();
              return;
            }
            if (layout === 'letters') {
              setLayout('numbers');
              resetCase();
            } else if (layout === 'numpad') {
              setLayout('letters');
              resetCase();
            } else {
              setLayout('letters');
              resetCase();
            }
            return;
          case 'symbols':
            if (layout !== 'symbols') {
              // Switch to the symbols keyboard while keeping the emoji search open.
              setLayout('symbols');
              resetCase();
            }
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
          if (handleAutocorrectBackspace()) {
            return;
          }
          keyboardBridge.deleteBackward();
          backspaceSyncSeqRef.current += 1;
          livePrefixRef.current = livePrefixRef.current.slice(0, -1);
          refreshTouchIntelligenceFromLivePrefix();
          lastTypingAtRef.current = Date.now();
          if (autocorrectPreviewRef.current) {
            autocorrectPreviewRef.current = null;
            setAutocorrectPreview(null);
          }
          setTypedKeepSuggestion(current => (current ? null : current));
          scheduleBackspaceBarFlush();
          return;
        case 'space': {
          const typedFallback = livePrefixRef.current;
          const contextPromise = keyboardBridge.getTextBeforeCursor(96);
          livePrefixRef.current = '';
          touchIntelligencePreviousKeyRef.current = null;
          syncTouchIntelligenceToNative();
          keyboardBridge.insertText(' ');
          if (zeroLatencyModeRef.current) {
            void commitTypedWordBoundary(
              () => {},
              ' ',
              typedFallback,
              {boundaryPreInserted: true, contextPromise},
            );
            return;
          }
          applyInstantSuggestionBar('');
          void commitTypedWordBoundary(
            () => {},
            ' ',
            typedFallback,
            {boundaryPreInserted: true, contextPromise},
          );
          return;
        }
        case 'enter': {
          const typedFallback = livePrefixRef.current;
          livePrefixRef.current = '';
          touchIntelligencePreviousKeyRef.current = null;
          syncTouchIntelligenceToNative();
          previousWordRef.current = '';
          emptyContextTrustworthyRef.current = false;
          autocorrectPreviewRef.current = null;
          setAutocorrectPreview(null);
          setTypedKeepSuggestion(null);
          if (aiPreflightTimerRef.current) {
            clearTimeout(aiPreflightTimerRef.current);
            aiPreflightTimerRef.current = null;
          }
          aiPreflightCacheRef.current.clear();
          if (aiProofreadTimerRef.current) {
            clearTimeout(aiProofreadTimerRef.current);
            aiProofreadTimerRef.current = null;
          }
          aiProofreadRunIdRef.current += 1;
          lastAiProofreadOriginalRef.current = null;
          setAiAutocorrectSuggestion(null);
          setIsAiAutocorrectProcessing(false);
          if (zeroLatencyModeRef.current) {
            keyboardBridge.submitEnterKey();
            void commitTypedWordBoundary(
              () => {},
              '',
              typedFallback,
              {boundaryPreInserted: true},
            );
            return;
          }
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
        case 'emoji':
          void toggleEmojiPanel();
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
      clearSuggestionBarForPrefix,
      commitTypedWordBoundary,
      consumeLetterCommitText,
      handleAutocorrectBackspace,
      handleFormConfirm,
      handleShiftPress,
      refreshTouchIntelligenceFromLivePrefix,
      resetCase,
      scheduleBackspaceBarFlush,
      scheduleRefreshSuggestions,
      syncAutoCapitalizeShift,
      toggleEmojiPanel,
    ],
  );

  const handleKeyPressRef = useRef(handleKeyPressImpl);
  handleKeyPressRef.current = handleKeyPressImpl;

  const handleKeyPress = useCallback((keyDef: KeyDefinition) => {
    if (zeroLatencyModeRef.current) {
      handleKeyPressRef.current(keyDef);
      return;
    }
    if (keyDef.type !== 'backspace') {
      markTyping();
    } else {
      lastTypingAtRef.current = Date.now();
    }
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
      if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
        return;
      }

      const now = Date.now();
      const burstTyping =
        /[a-z]/i.test(text) && isBurstTyping(lastLetterCommitAtRef.current, now);

      hasTypedInFieldRef.current = true;
      if (/[a-z]/i.test(text)) {
        lastLetterCommitAtRef.current = now;
        livePrefixRef.current += text;
        touchIntelligencePreviousKeyRef.current = text.toLowerCase();
        if (!shouldDeferHeavyTypingSideEffects()) {
          syncTouchIntelligenceToNative();
        }
        if (!burstTyping && !shouldDeferHeavyTypingSideEffects()) {
          scheduleAiPreflight();
        }
      } else if (text === ' ' || text.trim().length === 0) {
        if (text === ' ') {
          livePrefixRef.current = '';
          clearMidWordAutoShift();
        }
        touchIntelligencePreviousKeyRef.current = null;
        if (!shouldDeferHeavyTypingSideEffects()) {
          syncTouchIntelligenceToNative();
        }
        if (text === ' ' && Platform.OS === 'android') {
          void keyboardBridge.getTextBeforeCursor(96).then(nextContext => {
            syncAutoCapitalizeShift(nextContext);
          });
        }
      }
      lastTypingAtRef.current = now;

      if (burstTyping) {
        setBurstTypingActive(true);
        if (burstTypingEndTimerRef.current) {
          clearTimeout(burstTypingEndTimerRef.current);
        }
        burstTypingEndTimerRef.current = setTimeout(() => {
          burstTypingEndTimerRef.current = null;
          setBurstTypingActive(false);
          flushTypingIdleSideEffects();
        }, BURST_TYPING_INTERVAL_MS * 2);
      }

      if (!shouldDeferLiveSuggestionBar()) {
        if (/[a-z]/i.test(text)) {
          applyInstantSuggestionBar(livePrefixRef.current);
        } else if (text === ' ' || text.trim().length === 0) {
          applyInstantSuggestionBar('');
        }
      }

      if (zeroLatencyModeRef.current || gamePerformanceModeRef.current) {
        return;
      }

      if (!burstTyping) {
        queueMicrotask(() =>
          recordKeystroke(/[a-z0-9]/i.test(text) ? 'char' : 'other'),
        );
      }

      if (letterSideEffectsTimerRef.current) {
        clearTimeout(letterSideEffectsTimerRef.current);
      }
      letterSideEffectsTimerRef.current = setTimeout(() => {
        letterSideEffectsTimerRef.current = null;
        if (modeRef.current.type !== 'typing') {
          return;
        }
        flushTypingIdleSideEffects();
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
      }, LETTER_SIDE_EFFECTS_DEBOUNCE_MS);
    },
    [applyInstantSuggestionBar, clearMidWordAutoShift, flushTypingIdleSideEffects, scheduleAiPreflight, syncAutoCapitalizeShift, syncTouchIntelligenceToNative],
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
        emojiPanelTabRef.current === 'gif' &&
        gifSearchActiveRef.current
      ) {
        setGifSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }
      if (
        modeRef.current.type === 'emoji' &&
        emojiPanelTabRef.current === 'sfx' &&
        sfxSearchActiveRef.current
      ) {
        setSfxSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }
      if (
        modeRef.current.type === 'emoji' &&
        emojiPanelTabRef.current === 'emojis' &&
        emojiSearchActiveRef.current
      ) {
        setEmojiSearchQuery(current => current + text.toLowerCase());
        markTyping();
        return;
      }

      keyboardBridge.insertKeyText(text);
      applyCommittedKeyTextSideEffects(text);
    },
    [
      appendToFormField,
      applyCommittedKeyTextSideEffects,
      markTyping,
    ],
  );

  const handleNativeFastPathLetterCommit = useCallback(
    (text: string) => {
      if (!text || modeRef.current.type !== 'typing') {
        return;
      }
      nativeSideEffectDedupRef.current = {text, at: Date.now()};
      if (clipboardPasteSuggestionRef.current) {
        clearClipboardPasteSuggestion();
      }
      applyCommittedKeyTextSideEffects(text);
      // Keep native touch-intel context fresh so reranks can apply on the next tap.
      if (!shouldDeferHeavyTypingSideEffects()) {
        syncTouchIntelligenceToNative();
      }
    },
    [
      applyCommittedKeyTextSideEffects,
      clearClipboardPasteSuggestion,
      syncTouchIntelligenceToNative,
    ],
  );

  const shouldSkipAsyncNativeSideEffect = useCallback((text: string): boolean => {
    const dedup = nativeSideEffectDedupRef.current;
    if (!dedup || dedup.text !== text) {
      return false;
    }
    return Date.now() - dedup.at < NATIVE_SIDE_EFFECT_DEDUP_MS;
  }, []);

  useEffect(() => {
    setTouchIntelligenceTypingContextProvider(() => ({
      wordPrefix: livePrefixRef.current,
      previousKeyLetter: touchIntelligencePreviousKeyRef.current,
    }));
    return () => {
      setTouchIntelligenceTypingContextProvider(null);
    };
  }, []);

  useEffect(() => {
    setUndoCommittedTextHandler(text => {
      if (text.length !== 1 || !/[a-z]/i.test(text)) {
        return;
      }
      const prefix = livePrefixRef.current;
      if (prefix.endsWith(text)) {
        livePrefixRef.current = prefix.slice(0, -text.length);
      } else if (prefix.toLowerCase() === text.toLowerCase()) {
        livePrefixRef.current = '';
      }
      refreshTouchIntelligenceFromLivePrefix();
    });
    return () => {
      setUndoCommittedTextHandler(null);
    };
  }, [refreshTouchIntelligenceFromLivePrefix]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'keyboardNativeFastPathKey',
      (payload: NativeFastPathKeyEvent) => {
        const text = typeof payload?.text === 'string' ? payload.text : '';
        if (!text || modeRef.current.type !== 'typing') {
          return;
        }
        if (shouldSkipAsyncNativeSideEffect(text)) {
          return;
        }
        if (payload?.shiftConsumed) {
          syncNativeShiftConsumed();
        }
        if (clipboardPasteSuggestionRef.current) {
          clearClipboardPasteSuggestion();
        }
        applyCommittedKeyTextSideEffects(text);
      },
    );

    return () => subscription.remove();
  }, [
    applyCommittedKeyTextSideEffects,
    clearClipboardPasteSuggestion,
    shouldSkipAsyncNativeSideEffect,
    syncNativeShiftConsumed,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = DeviceEventEmitter.addListener(
      'keyboardNativeSuggestionsUpdated',
      (payload: unknown) => {
        const snapshot = parseNativeSuggestionsPayload(payload);
        if (!snapshot) {
          return;
        }
        recordNativeSuggestionSnapshot(snapshot);
        if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
          return;
        }
        if (snapshot.prefix !== livePrefixRef.current) {
          return;
        }
        if (shouldSkipAutocorrectForToken(snapshot.prefix)) {
          return;
        }
        lastInstantPrefixRef.current = snapshot.prefix;
        lastFlushedBarPrefixRef.current = snapshot.prefix;
        lastFlushedSuggestionsRef.current = snapshot.suggestions;
        setCurrentPrefix(snapshot.prefix);
        setSuggestions(snapshot.suggestions);
      },
    );
    return () => subscription.remove();
  }, []);

  const handleWordCommitted = useCallback(
    (word: string) => {
      setSwipePreview(null);
      markTyping();
      clearClipboardPasteSuggestion();
      recordLearnedWord(word);
      recordWordCommitted();
      recordKeystroke('char');

      void (async () => {
        const context = await keyboardBridge.getTextBeforeCursor(64);
        const needsLeadingSpace = shouldInsertLeadingSpaceBeforeWord(
          context,
          livePrefixRef.current,
        );
        keyboardBridge.insertText(needsLeadingSpace ? ` ${word} ` : `${word} `);
        livePrefixRef.current = '';
        touchIntelligencePreviousKeyRef.current = null;
        syncTouchIntelligenceToNative();

        if (shiftOn && !capsLocked) {
          setShiftOn(false);
        }
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
      })();
    },
    [
      capsLocked,
      clearClipboardPasteSuggestion,
      markTyping,
      refreshSuggestions,
      shiftOn,
      syncTouchIntelligenceToNative,
    ],
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

  const handleStickerSelect = useCallback(async (sticker: StickerLySticker) => {
    try {
      await insertStickerLySticker(sticker);
    } catch (error) {
      console.warn('Failed to insert sticker', error);
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

    if (nativeFastPathLayoutHold) {
      nativeFastPathActiveRef.current = false;
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
      return;
    }

    let cancelled = false;
    const publishConfig = () => {
      if (cancelled || nativeFastPathLayoutHold) {
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

      const origin = layoutContext.areaOriginRef.current;
      updatePredictiveHitboxes(livePrefixRef.current, keyLayouts, {
        enabled: theme.predictiveHitboxesEnabled,
        lang: getActiveLanguage(),
      });
      const touchIntelligence = getTouchIntelligenceNativeConfig();
      keyboardBridge.setNativeKeyFastPathConfig(
        JSON.stringify({
          enabled: true,
          commitOnDown: !theme.isLandscape,
          zeroLatency: zeroLatencyMode,
          gamePerformance: gamePerformanceActive,
          areaPageX: origin.pageX,
          areaPageY: origin.pageY,
          hitSlopHorizontal: theme.keyHitSlop.horizontal,
          hitSlopVertical: theme.keyHitSlop.vertical,
          layout,
          touchIntelligence,
          keyExpansions: touchIntelligence.keyExpansions,
          keys: keyLayouts.map(({id, keyDef, x, y, width, height, centerX, centerY}) => ({
            id,
            type: keyDef.type ?? 'char',
            value: keyDef.value,
            x,
            y,
            width,
            height,
            centerX,
            centerY,
            reactTag: getKeyReactTag(id) ?? 0,
          })),
        }),
      );
      if (!autoShiftConsumedMidWordRef.current) {
        syncNativeFastPathCaseState();
      }
      nativeFastPathActiveRef.current = true;
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
    isFormMode,
    layout,
    layoutContext,
    layoutContext?.areaBounds.height,
    layoutContext?.areaBounds.width,
    layoutContext?.layoutEpoch,
    mode.type,
    nativeFastPathEligible,
    gestureEnabled,
    theme.keyHitSlop.horizontal,
    theme.keyHitSlop.vertical,
    theme.predictiveHitboxesEnabled,
    theme.letterLayoutId,
    zeroLatencyMode,
    gamePerformanceActive,
    nativeFastPathLayoutHold,
    theme.isLandscape,
    syncNativeFastPathCaseState,
  ]);

  useEffect(() => {
    setZeroLatencyRuntimeActive(false);
    return () => {
      zeroLatencyModeRef.current = false;
      setZeroLatencyRuntimeActive(false);
      keyboardBridge.setNativeZeroLatencyMode(false);
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
    };
  }, []);

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

  // Zero-latency is a temporary typing-session mode. Do not carry its
  // animation/gesture configuration into plugin pages or a later keyboard
  // session when the keyboard view remains mounted.
  useEffect(() => {
    if (mode.type === 'typing') {
      return;
    }
    zeroLatencyModeRef.current = false;
    setZeroLatencyRuntimeActive(false);
    keyboardBridge.setNativeZeroLatencyMode(false);
    setZeroLatencyMode(false);
  }, [mode.type]);

  const keyGestures = useMemo<KeyGesturesConfig | undefined>(() => {
    if (!keyGesturesActive) {
      return undefined;
    }
    return {
      zeroLatencyMode,
      spaceCursorSwipe:
        !zeroLatencyMode &&
        (layout === 'letters' || layout === 'numbers' || layout === 'symbols') &&
        gestureSettings.spaceCursorSwipe,
      backspaceWordSwipe:
        !zeroLatencyMode && gestureSettings.backspaceWordSwipe,
      backspaceSentenceHold:
        !zeroLatencyMode && gestureSettings.backspaceSentenceHold,
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
        if (zeroLatencyModeRef.current) {
          return;
        }
        const syncSeq = backspaceSyncSeqRef.current;
        void keyboardBridge.getTextBeforeCursor(48).then(context => {
          if (syncSeq !== backspaceSyncSeqRef.current) {
            return;
          }
          const prefix = extractCurrentWord(context);
          livePrefixRef.current = prefix;
          previousWordRef.current = extractPreviousWordFromContext(context, prefix);
          lastTypingAtRef.current = Date.now();
          scheduleBackspaceBarFlush();
        });
      },
      swipeTyping: !zeroLatencyMode && gestureSettings.swipeTyping,
      commaLauncher:
        !zeroLatencyMode &&
        theme.design !== 'apple' &&
        gestureSettings.commaLauncher,
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
      periodRewrite: !zeroLatencyMode && theme.design !== 'apple',
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
    clearSuggestionBarForPrefix,
    commaLauncherActive,
    gestureSettings,
    keyGesturesActive,
    layout,
    launcherAppPackage,
    openRewritePanel,
    periodRewriteActive,
    scheduleBackspaceBarFlush,
    refreshSuggestions,
    scheduleRefreshSuggestions,
    theme.design,
    zeroLatencyMode,
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
  const frostedKeyboardVisible =
    theme.frostedGlass &&
    showKeys &&
    !shouldSkipFrostedKeyboardEffects() &&
    (!isEmojiMode || isGifSearchMode || isEmojiSearchMode || isSfxSearchMode);
  const frostedKeyboardLayout = frostedKeyboardBackdropLayout(
    effectiveLetterKeyHeight ?? theme.keyHeight,
    theme.keyRowMargin,
    theme.imeStripClearance,
    isEmojiMode && !isGifSearchMode && !isEmojiSearchMode && !isSfxSearchMode
      ? 1
      : 0,
  );

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
        <View style={styles.suggestionBarShell}>
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
              : isEmojiMode && emojiPanelTab === 'emojis'
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
          isVoiceSpeaking={isVoiceSpeaking}
          isVoiceConnecting={isVoiceConnecting}
          isVoiceProcessing={isVoiceProcessing}
          voiceAudioLevel={audioLevel}
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
          onAiPress={() => {
            void toggleRewritePanel();
          }}
          aiSelected={isRewriteMode}
          onVoicePress={toggleListening}
          itemsSelected={itemsSelected}
          emojiSelected={isEmojiMode}
          zeroLatencyActive={zeroLatencyMode && mode.type === 'typing'}
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
          {theme.developerEyeEnabled &&
          autocorrectSettings.contextCorrectionEnabled ? (
            <ContextCorrectionDebugOverlay
              visible={
                layout === 'letters' ||
                layout === 'numbers' ||
                layout === 'symbols'
              }
              revision={contextCorrectionTick}
            />
          ) : null}
        </View>

        <View
          style={[
            styles.keysPadding,
            frostedKeyboardVisible && styles.keysPaddingFrosted,
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
          {frostedKeyboardVisible ? (
            <FrostedKeyBackdrop
              contentHeight={frostedKeyboardLayout.contentHeight}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: frostedKeyboardLayout.backdropBottom,
                height: frostedKeyboardLayout.backdropHeight,
                zIndex: 0,
              }}
            />
          ) : null}

          {isEmojiMode && !isGifSearchMode && !isEmojiSearchMode && !isSfxSearchMode ? (
            <EmojiPanel
              panelTab={emojiPanelTab}
              emojiSubcategory={emojiSubcategory}
              onEmojiSubcategorySelect={setEmojiSubcategory}
              emojiSearchQuery={emojiSearchQuery}
              panelHeight={emojiPanelScrollHeight}
              onSelect={handleEmojiSelect}
              onGifSelect={gif => {
                void handleGifSelect(gif);
              }}
              onStickerSelect={sticker => {
                void handleStickerSelect(sticker);
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
              panelTab={emojiPanelTab}
              onPanelTabSelect={setEmojiPanelTab}
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
              style={[
                frostedKeyboardVisible && styles.frostedKeyboardForeground,
                oneHandLayout.active
                  ? {
                      width: oneHandLayout.width,
                      alignSelf: oneHandLayout.alignSelf,
                    }
                  : null,
              ]}>
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
                    isNativeTypingCommitActive={() =>
                      nativeFastPathActiveRef.current
                    }
                    onNativeFastPathLetterCommit={handleNativeFastPathLetterCommit}
                    onNativeFastPathShiftConsumed={syncNativeShiftConsumed}
                    shouldConsumeShiftForCommit={shouldConsumeShiftForCommit}
                    onSpaceLongPress={
                      mode.type === 'typing' ? activateZeroLatencyMode : undefined
                    }
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
                    keyHeight={
                      effectiveLetterKeyHeight ?? numberRowLayoutBoost?.keyHeight
                    }
                    rowStyle={letterRowsStyle}
                    enterKeyNextLineEnabled={
                      mode.type === 'typing' ? enterKeyNextLineEnabled : false
                    }
                    focusedKeyId={
                      controllerKeyboardActive && showKeys
                        ? focusedControllerKey?.id
                        : null
                    }
                    typeLiftProcessing={isAiAutocorrectProcessing}
                    predictiveHitboxTick={predictiveHitboxTick}
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
        scheduleBackgroundEnglishSymSpellSeed();
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
    suggestionBarShell: {
      position: 'relative',
      zIndex: 70,
    },
    keysPadding: {
      paddingTop: theme.keysPaddingTop,
      paddingBottom: theme.imeStripClearance,
    },
    keysPaddingFrosted: {
      position: 'relative',
      overflow: 'visible',
    },
    frostedKeyboardForeground: {
      zIndex: 1,
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
