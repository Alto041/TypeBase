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
  useColorScheme,
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
import {TypingSuggestionBarHost} from './components/TypingSuggestionBarHost';
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
  normalizeEmojiSubcategoryId,
  type EmojiPanelTab,
  type EmojiSubcategoryId,
} from './emoji/emojis';
import {downloadAndInsertGif} from './emoji/gifInsert';
import {insertStickerLySticker} from './emoji/stickerInsert';
import {recordRecentSticker} from './emoji/recentStickersStore';
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
  expandEssentialForInsert,
  getEssentialsList,
  matchEssentialSuggestions,
} from './essentials/essentialsStore';
import {
  extractEssentialTrigger,
  isEssentialTriggerPrefix,
  resolveEssentialExpansion,
} from './essentials/essentialsTrigger';
import {snippetSuggestionLimit} from './essentials/snippetTier';
import type {Essential, KeyboardMode} from './essentials/types';
import type {KeyGesturesConfig} from './components/Key';
import {GestureTypingLayer} from './gesture/GestureTypingLayer';
import {PremiumUpsellSheet} from './components/PremiumUpsellSheet';
import {useKeyboardPremium} from './hooks/useKeyboardPremium';
import {canUseFeature} from '../licensing/entitlements';
import {canUsePluginMenuItem} from '../licensing/freeTierAccess';
import {setUndoCommittedTextHandler} from './gesture/multiTouchKeys';
import {SwipeTypingKeysHost} from './gesture/SwipeTypingContext';
import {PredictiveHitboxOverlay} from './gesture/PredictiveHitboxOverlay';
import {ContextCorrectionDebugOverlay} from './autocorrect/ContextCorrectionDebugOverlay';
import {setContextCorrectionDebugCapture} from './autocorrect/contextCorrectionEngine';
import {preloadContextBigrams} from './autocorrect/contextBigrams';
import {
  isMinimalSuggestionEngineReady,
  startSuggestionEngineWarmup,
  waitForMinimalSuggestionEngine,
} from './suggestionEngineBootstrap';
import {
  clearNativeSuggestionSnapshot,
  getFreshNativeSuggestions,
  parseNativeSuggestionsPayload,
  recordNativeSuggestionSnapshot,
  syncNativeSuggestionPrefix,
  type NativeSuggestionSnapshot,
} from './nativeSuggestionBar';
import {
  getTypingSuggestionBarState,
  resetTypingSuggestionBarState,
  setTypingBarAutocorrectPreview,
  setTypingBarEssentialTriggerLength,
  setTypingBarEssentials,
  setTypingBarPrefix,
  setTypingBarSuggestions,
  setTypingBarTypedKeep,
  subscribeTypingSuggestionBar,
} from './typingSuggestionBarStore';
import {
  buildMyRowKeyDefinitions,
  ensureMyRowUsageLoaded,
  getMyRowUsageSnapshot,
  isMyRowTrackableChar,
  MY_ROW_USAGE_CHANGED_EVENT,
  recordMyRowSymbol,
} from './myRow/myRowStore';
import {KeyLayoutProvider, useKeyLayoutContext} from './gesture/KeyLayoutContext';
import {
  clearWordLetterTapsForTapMap,
  getTouchIntelligenceNativeConfig,
  getWordLetterTapsForTapMap,
  setTouchIntelligenceTypingContextProvider,
  syncTouchIntelligenceToNative,
} from './gesture/touchIntelligence';
import {
  hydrateTapMapFromStorage,
  learnTapMapFromKeyTap,
  learnTapMapFromWordCorrection,
  getTapMapNativeSignature,
  serializeTapMapOffsetsForNative,
  setTapMapLayoutProvider,
  subscribeTapMapChanges,
} from './gesture/tapMap';
import {
  serializeKeyExpansionsForNative,
  updatePredictiveHitboxes,
} from './gesture/predictiveHitboxes';
import {installTouchIntelligenceNativeTelemetry} from './gesture/touchIntelligenceNativeBridge';
import {hydrateTouchIntelligenceHitsFromStorage} from './gesture/touchIntelligenceTelemetry';
import {
  destroyKeyPreview,
  hideAllKeyPreviews,
  initKeyPreview,
  setKeyPreviewStyle,
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
  setAutocorrectIntensity,
} from './autocorrect/autocorrectStore';
import {getAiPreflightSkipMinConfidence} from './autocorrect/autocorrectIntensityProfile';
import {
  extractPreviousWordFromContext,
  getAutocorrectCandidate,
  getFastAutocorrectPreview,
  getSuggestionBarAutocorrect,
  isDictionaryWord,
  shouldAutoApply,
  shouldLearnAutocorrectPair,
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
import {playTypeLiftSound} from './autocorrect/typeLiftSound';
import {
  recordAiPreflightRequest,
  recordAiPreflightResult,
  recordAiPreflightStale,
} from './autocorrect/aiAutocorrectTelemetry';
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
import {recordCompactTypingFastPathPublish} from './metrics/compactTypingMetrics';
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
  getPeriodRewriteArmed,
  reloadGesturesFromStorage,
  setCommaLauncherArmed,
  setGestureSetting,
  setPeriodRewriteArmed,
} from './gestures/gesturesStore';
import type {GestureSettings} from './gestures/types';
import {
  executeShiftEditorShortcut,
  isShiftEditorShortcutEligible,
  tryShiftEditorShortcut,
} from './editor/shiftEditorShortcuts';
import {deferKeyboardSideEffect, triggerKeyHaptic} from './haptics';
import {isLandscapeTypingProfile, setLandscapeTypingProfile} from './landscapeTypingProfile';
import {
  isCompactNativeTypingActive,
  setCompactNativeTypingActive,
} from './compactNativeTyping';
import {keyboardBridge} from './keyboardBridge';
import {getKeyReactTag, subscribeKeyReactTags} from './keyReactTags';
import {
  isBurstTypingActive,
  isTypingChurnActive,
  markTypingChurn,
  setBurstTypingActive,
  setGamePerformanceModeActive,
  setFloatingKeyboardDragActive,
  setZeroLatencyModeActive as setZeroLatencyRuntimeActive,
  isFloatingKeyboardDragActive,
  shouldDeferHeavyTypingSideEffects,
  shouldDeferLiveSuggestionBar,
  shouldSkipFrostedKeyboardEffects,
  shouldSkipTouchIntelligenceWork,
  shouldDeferNativeTouchIntelligenceSync,
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
  undoLearnedWord,
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
  resolveKeyboardColorScheme,
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
  layoutSettingsForOrientation,
} from './orientation';
import {useVoiceInput} from './voice/useVoiceInput';
import {
  derivePreviousWordFromEditor,
  buildEffectiveTextBeforeCursor,
  pickTypedWordForBoundary,
  reconcileLivePrefixFromContext,
  shouldInsertLeadingSpaceBeforeWord,
} from './typingCompositor';

const DOUBLE_TAP_MS = 350;
/** Debounced async refresh (phrases, essentials, native cursor sync). */
const SUGGESTION_FULL_REFRESH_DEBOUNCE_MS = 280;
const INSTANT_SUGGESTION_MIN_INTERVAL_MS = 48;
const LETTER_SIDE_EFFECTS_DEBOUNCE_MS = 220;
/** Gap between letters that counts as fast typing (~6–7 chars/sec and above). */
const BURST_TYPING_INTERVAL_MS = 200;
const BURST_TYPING_IDLE_MS = 380;
/** While keys are arriving, defer SymSpell bar work and native touch-intel sync. */
const TYPING_HEAVY_DEFER_MS = 480;
/** Coalesce live suggestion-bar React updates (portrait + landscape). */
const DEFERRED_BAR_FLUSH_MS = 52;
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

function shouldUseLightSuggestionBar(lastTypingAtMs: number, now = Date.now()): boolean {
  return (
    isLandscapeTypingProfile() ||
    isTypingChurnActive(now) ||
    (lastTypingAtMs > 0 && now - lastTypingAtMs < TYPING_HEAVY_DEFER_MS)
  );
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
/** Commit letters in Kotlin and skip RN dispatch — portrait only (landscape uses JS typing). */
const COMPACT_NATIVE_TYPING_ENABLED = true;
const COMPACT_NATIVE_TYPING_PORTRAIT_ONLY = true;

function nativeTypingOriginReady(bounds: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}): boolean {
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    Number.isFinite(bounds.pageX) &&
    Number.isFinite(bounds.pageY)
  );
}

function buildNativeFastPathReactTagsSignature(
  keyLayouts: {id: string}[],
): string {
  return keyLayouts.map(({id}) => `${id}:${getKeyReactTag(id) ?? 0}`).join('|');
}
const AI_AUTOCORRECT_LOG_PREFIX = '[AiAutocorrect]';

function logAiAutocorrect(...args: unknown[]): void {
  if (__DEV__) {
    console.log(AI_AUTOCORRECT_LOG_PREFIX, ...args);
  }
}

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

type TypedWordLearnUndo = {
  word: string;
  boundary: string;
  at: number;
};

type AiAutocorrectSuggestion = Extract<
  AiAutocorrectResult,
  {kind: 'suggest'}
>;

const TYPED_WORD_UNDO_WINDOW_MS = 2600;

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
  isShiftEditorHeld?: boolean;
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
  compactTypingNativeActive?: boolean;
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
  isShiftEditorHeld,
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
  compactTypingNativeActive = false,
}: LetterKeyboardRowsProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createKeyboardAppStyles);
  const multiTouchActive =
    multiTouchEnabled ??
    (modeType === 'typing');

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
          isShiftEditorHeld={isShiftEditorHeld}
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
          compactTypingNativeActive={compactTypingNativeActive}
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

const ENGLISH_PREFIX_STARTERS = [
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
] as const;

function englishPrefixStarterCompletions(prefix: string): string[] {
  if (prefix.length < 1) {
    return [];
  }
  const lower = prefix.toLowerCase();
  return ENGLISH_PREFIX_STARTERS.filter(word => word.startsWith(lower)).slice(
    0,
    TYPING_BAR_WORD_LIMIT,
  );
}

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
    /** Prefer native prefix chips; JS still computes autocorrect preview. */
    preferNativeWords?: boolean;
    /** Landscape idle flush — skip heavy bar autocorrect (SymSpell/context scans). */
    landscapeLight?: boolean;
  },
) {
  const fast = options.fast;
  const suggestionsOnly = options.suggestionsOnly ?? false;
  const prefixOnly = options.prefixOnly ?? false;
  const landscapeLight = options.landscapeLight === true;
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
      : landscapeLight
        ? {
            keepTyped: null,
            correction: getFastAutocorrectPreview(prefix, {previousWord}) ?? null,
          }
        : getSuggestionBarAutocorrect(prefix, {
            fast,
            previousWord,
            context: options.context,
          });

  const phraseSuggestions =
    fast ||
    !options.context ||
    shouldSkipAutocorrectForToken(prefix) ||
    extractTrailingWords(options.context, 3).length < 2
      ? []
      : getPhraseSuggestions(options.context, 2);
  // Prefix completions (trie) plus a small high-confidence fuzzy pass while typing.
  const autocorrectLang = getActiveLanguage();
  const preferNativeWords = options.preferNativeWords ?? false;
  const nativeSuggestions =
    Platform.OS === 'android' && fast && autocorrectLang === 'en'
      ? getFreshNativeSuggestions(prefix)
      : null;
  let wordSuggestions: string[];
  if (shouldSkipAutocorrectForToken(prefix) || prefix.length < 1) {
    wordSuggestions = [];
  } else {
    const nativeWords =
      nativeSuggestions && nativeSuggestions.length > 0
        ? nativeSuggestions
        : null;
    const useNativeOnly =
      preferNativeWords && Platform.OS === 'android' && nativeWords;
    wordSuggestions = useNativeOnly
      ? nativeWords
      : (nativeWords ??
        getWordSuggestions(prefix, TYPING_BAR_WORD_LIMIT, {
          skipFuzzy: suggestionsOnly || landscapeLight,
          lightweight: true,
        }));
  }
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
  keyPreviewStyle: KeyboardLayoutSettings['keyPreviewStyle'];
};

function KeyboardBody({
  controllerConnected,
  controllerSettings,
  keyPreviewStyle,
}: KeyboardBodyProps) {
  const theme = useKeyboardTheme();
  const layoutContext = useKeyLayoutContext();
  const {width: viewportWidth} = useWindowDimensions();
  const styles = useThemedStyles(createKeyboardAppStyles);
  const {showUpsell, setShowUpsell, requireFeature, isPremium, premiumReady} =
    useKeyboardPremium();
  const stickersLocked = premiumReady && !isPremium;
  const sfxLocked = premiumReady && !isPremium;
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
  const deferredBarFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scheduleDeferredLiveSuggestionBarRef = useRef<() => void>(() => {});
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
  const editorContextRef = useRef('');
  const lastInstantPrefixRef = useRef('');
  const previousWordRef = useRef('');
  const autocorrectPreviewRef = useRef<string | null>(null);
  const nativeFastPathActiveRef = useRef(false);
  const lastPublishedFastPathLayoutEpochRef = useRef(-1);
  const lastPublishedLandscapeRef = useRef<boolean | null>(null);
  const lastPublishedReactTagsSignatureRef = useRef('');
  const lastPublishedFastPathSignatureRef = useRef('');
  const [compactTypingNativeActive, setCompactTypingNativeActive] =
    useState(false);
  const instantSuggestionRafRef = useRef<number | null>(null);
  const instantSuggestionLastFlushAtRef = useRef(0);
  const nativeSideEffectDedupRef = useRef<{text: string; at: number} | null>(null);
  const lastFlushedSuggestionsRef = useRef<string[]>([]);
  const lastFlushedAutocorrectRef = useRef<string | null>(null);
  const lastFlushedTypedKeepRef = useRef<string | null>(null);
  const lastFlushedBarPrefixRef = useRef('');
  const pendingNativeSuggestionsRef =
    useRef<NativeSuggestionSnapshot | null>(null);
  const boundaryCommitSeqRef = useRef(0);
  const backspaceBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceSyncSeqRef = useRef(0);
  const autocorrectUndoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const autocorrectRedoStackRef = useRef<AutocorrectHistoryEdit[]>([]);
  const typedWordLearnUndoRef = useRef<TypedWordLearnUndo[]>([]);
  const lastTypingAtRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stoppedTyping, setStoppedTyping] = useState(true);
  const [suggestionEngineLoading, setSuggestionEngineLoading] = useState(
    () => !isMinimalSuggestionEngineReady(),
  );
  const [predictiveHitboxTick, setPredictiveHitboxTick] = useState(0);
  const [contextCorrectionTick, setContextCorrectionTick] = useState(0);
  const stoppedTypingRef = useRef(true);
  const [zeroLatencyMode, setZeroLatencyMode] = useState(false);
  const zeroLatencyModeRef = useRef(false);
  const [gamePerformanceActive, setGamePerformanceActive] = useState(false);
  const gamePerformanceModeRef = useRef(false);
  const autoGamePerformanceRef = useRef(false);
  const landscapeInputBoostRef = useRef(false);
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
  const [swipePreview, setSwipePreview] = useState<string | null>(null);
  const [essentials, setEssentials] = useState<Essential[]>([]);
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
  const gestureSettingsRef = useRef<GestureSettings>(gestureSettings);
  const [shiftEditorHeld, setShiftEditorHeld] = useState(false);
  const shiftEditorHeldRef = useRef(false);
  const shiftEditorPressStartedAtRef = useRef(0);
  const shiftEditorChordUsedRef = useRef(false);
  const SHIFT_EDITOR_QUICK_TAP_MS = 280;
  const [autocorrectSettings, setAutocorrectSettings] =
    useState<AutocorrectSettings>(getAutocorrectSettings());
  const [oneHandSettings, setOneHandSettings] = useState<OneHandSettings>(
    getOneHandSettings(),
  );
  const [aiAutocorrectSuggestion, setAiAutocorrectSuggestion] =
    useState<AiAutocorrectSuggestion | null>(null);
  const [isAiAutocorrectProcessing, setIsAiAutocorrectProcessing] =
    useState(false);
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

  const syncNativeFastPathPreviewChrome = useCallback(
    (style: KeyboardLayoutSettings['keyPreviewStyle']) => {
      keyboardBridge.updateNativeFastPathPreviewChrome(
        style === 'popup',
        style === 'popup' || style === 'subtle',
        style === 'doodle',
      );
    },
    [],
  );

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

  useEffect(() => {
    gestureSettingsRef.current = gestureSettings;
  }, [gestureSettings]);

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
    if (shouldSkipTouchIntelligenceWork()) {
      return;
    }
    const prefix = livePrefixRef.current;
    touchIntelligencePreviousKeyRef.current =
      prefix.length > 0 ? prefix[prefix.length - 1]!.toLowerCase() : null;
    if (layoutContext && theme.predictiveHitboxesEnabled) {
      updatePredictiveHitboxes(prefix, layoutContext.getLayouts(), {
        enabled: true,
        lang: getActiveLanguage(),
      });
      if (theme.developerEyeEnabled) {
        setPredictiveHitboxTick(tick => tick + 1);
      }
    }
    if (!shouldDeferNativeTouchIntelligenceSync()) {
      syncTouchIntelligenceToNative();
    }
  }, [
    layoutContext,
    syncTouchIntelligenceToNative,
    theme.developerEyeEnabled,
    theme.predictiveHitboxesEnabled,
  ]);

  const updateLivePrefixPredictiveHitboxes = useCallback(() => {
    if (
      shouldSkipTouchIntelligenceWork() ||
      !layoutContext ||
      !theme.predictiveHitboxesEnabled
    ) {
      return;
    }
    updatePredictiveHitboxes(livePrefixRef.current, layoutContext.getLayouts(), {
      enabled: true,
      lang: getActiveLanguage(),
    });
  }, [layoutContext, theme.predictiveHitboxesEnabled]);

  useEffect(() => {
    if (!layoutContext) {
      setTapMapLayoutProvider(null);
      return () => {
        setTapMapLayoutProvider(null);
      };
    }
    setTapMapLayoutProvider(() => layoutContext.getLayouts());
    refreshTouchIntelligenceFromLivePrefix();
    return () => {
      setTapMapLayoutProvider(null);
    };
  }, [layoutContext, refreshTouchIntelligenceFromLivePrefix]);

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
  const isClipboardMode = mode.type === 'clipboard';
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
  const showEmojiPluginPanel =
    isEmojiMode &&
    !isGifSearchMode &&
    !isSfxSearchMode &&
    !isEmojiSearchMode;
  const gestureEnabled =
    !zeroLatencyMode &&
    !gamePerformanceActive &&
    !theme.isLandscape &&
    gestureSettings.swipeTyping &&
    layout === 'letters' &&
    mode.type === 'typing' &&
    !isSwipeTypingDisabledForLayout(theme.letterLayoutId);
  const controllerKeyboardActive =
    controllerSettings.enabled && controllerConnected && theme.isLandscape;

  const [customLayoutsTick, setCustomLayoutsTick] = useState(0);
  const [myRowUsageTick, setMyRowUsageTick] = useState(0);

  const myRowSettingOn = theme.myRowEnabled && canUseFeature('my_row');
  const shiftActive = shiftOn || capsLocked;

  const extraTopRowEnabled = myRowSettingOn || theme.numberRowEnabled;

  const rows = useMemo(() => {
    let baseRows = getKeyboardRows(layout, theme.letterLayoutId);
    if (layout === 'letters' && theme.design === 'apple' && baseRows.length > 0) {
      baseRows = [...baseRows.slice(0, -1), APPLE_BOTTOM_ROW];
    }
    if (layout === 'letters') {
      const showMyRowTop = myRowSettingOn && shiftActive;
      const showNumberTop =
        theme.numberRowEnabled || (myRowSettingOn && !shiftActive);

      if (showMyRowTop) {
        return [
          buildMyRowKeyDefinitions(theme.myRowPins, getMyRowUsageSnapshot()),
          ...baseRows,
        ];
      }
      if (showNumberTop) {
        return [DIGITS_ROW, ...baseRows];
      }
    }
    return baseRows;
  }, [
    layout,
    theme.design,
    theme.letterLayoutId,
    theme.myRowPins,
    theme.numberRowEnabled,
    myRowSettingOn,
    shiftActive,
    customLayoutsTick,
    myRowUsageTick,
  ]);

  const numberRowLayoutBoost = useMemo(
    () => getNumberRowLayoutBoost(layout, theme),
    [layout, theme.keyGap, theme.keyHeight, theme.keyRowMargin, myRowSettingOn, theme.numberRowEnabled],
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
    (extraTopRowEnabled ? theme.keyHeight + theme.keyRowMargin : 0);
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
    startSuggestionEngineWarmup();
    return installTouchIntelligenceNativeTelemetry();
  }, []);

  useEffect(() => {
    void hydrateTouchIntelligenceHitsFromStorage();
    void hydrateTapMapFromStorage();
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
    void ensureMyRowUsageLoaded();
    const subscription = DeviceEventEmitter.addListener(
      MY_ROW_USAGE_CHANGED_EVENT,
      () => {
        setMyRowUsageTick(tick => tick + 1);
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
      keyboardOpaqueKeyFill(theme, 'letterPressed'),
    );
  }, [
    theme.design,
    theme.keyRadius,
    theme.label,
    theme.scheme,
    theme.letterKey,
    theme.letterKeyPressed,
  ]);

  useEffect(() => {
    setKeyPreviewStyle(keyPreviewStyle);
    hideAllKeyPreviews();
    keyboardBridge.setKeyPreviewDoodleEnabled(keyPreviewStyle === 'doodle');
    syncNativeFastPathPreviewChrome(keyPreviewStyle);
  }, [keyPreviewStyle, syncNativeFastPathPreviewChrome]);

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
    editorContextRef.current = '';
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
    setAiAutocorrectSuggestion(null);
    setIsAiAutocorrectProcessing(false);
    resetTypingSuggestionBarState();
    clearNativeSuggestionSnapshot();
  }, []);

  const syncTypingCompositorFromEditor = useCallback(
    (context: string, options: {recentLetterCommit?: boolean} = {}) => {
      editorContextRef.current = context;
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

  const getEffectiveEditorContext = useCallback((prefix?: string) => {
    return buildEffectiveTextBeforeCursor(
      editorContextRef.current,
      prefix ?? livePrefixRef.current,
    );
  }, []);

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
    lastPublishedFastPathSignatureRef.current = '';

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
    setCalculatorDisplay('0');
    setTypingBarPrefix('');
    setTypingBarSuggestions([]);
    setTypingBarEssentials([]);
    setTypingBarEssentialTriggerLength(0);
    setTypingBarAutocorrectPreview(null);
    setTypingBarTypedKeep(null);
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
    typedWordLearnUndoRef.current = [];
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
      keyboardBridge.performSubtleKeyHaptic();
    }
    zeroLatencyModeRef.current = true;
    setZeroLatencyRuntimeActive(true);
    keyboardBridge.setNativeZeroLatencyMode(true);
    suggestionRefreshRunIdRef.current += 1;
    aiProofreadRunIdRef.current += 1;
    livePrefixRef.current = '';
    lastInstantPrefixRef.current = '';
    autocorrectPreviewRef.current = null;
    pendingNativeSuggestionsRef.current = null;
    clearNativeSuggestionSnapshot();

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
    if (burstTypingEndTimerRef.current) {
      clearTimeout(burstTypingEndTimerRef.current);
      burstTypingEndTimerRef.current = null;
    }
    if (letterSideEffectsTimerRef.current) {
      clearTimeout(letterSideEffectsTimerRef.current);
      letterSideEffectsTimerRef.current = null;
    }
    if (instantSuggestionRafRef.current != null) {
      cancelAnimationFrame(instantSuggestionRafRef.current);
      instantSuggestionRafRef.current = null;
    }
    setBurstTypingActive(false);

    // Drop live suggestion-bar React work — native already committed the path.
    setTypingBarPrefix('');
    setTypingBarSuggestions([]);
    setTypingBarTypedKeep(null);
    setTypingBarAutocorrectPreview(null);
    setTypingBarEssentials([]);
    setTypingBarEssentialTriggerLength(0);

    // Disable touch-intel reranking on native for pure geometric hits.
    keyboardBridge.updateTouchIntelligenceContext(JSON.stringify({enabled: false}));

    setZeroLatencyMode(true);
    lastPublishedFastPathSignatureRef.current = '';
  }, []);

  const deactivatePerformanceModes = useCallback(() => {
    const wasZeroLatency = zeroLatencyModeRef.current;
    zeroLatencyModeRef.current = false;
    gamePerformanceModeRef.current = false;
    autoGamePerformanceRef.current = false;
    landscapeInputBoostRef.current = false;
    setZeroLatencyRuntimeActive(false);
    setGamePerformanceModeActive(false);
    keyboardBridge.setGamePerformanceMode(false);
    setGamePerformanceActive(false);
    keyboardBridge.setNativeZeroLatencyMode(false);
    lastPublishedFastPathSignatureRef.current = '';
    setZeroLatencyMode(false);
    if (wasZeroLatency) {
      syncTouchIntelligenceToNative();
    }
  }, [syncTouchIntelligenceToNative]);

  const activateGamePerformanceMode = useCallback(() => {
    if (gamePerformanceModeRef.current) {
      return;
    }
    gamePerformanceModeRef.current = true;
    autoGamePerformanceRef.current = true;
    setGamePerformanceModeActive(true);
    keyboardBridge.setGamePerformanceMode(true);
    setGamePerformanceActive(true);
    lastPublishedFastPathSignatureRef.current = '';
  }, []);

  /** Landscape: keep multi-touch but disable heavy touch intelligence. */
  const activateLandscapeInputBoost = useCallback(() => {
    if (landscapeInputBoostRef.current) {
      return;
    }
    landscapeInputBoostRef.current = true;
  }, []);

  const deactivateLandscapeInputBoost = useCallback(() => {
    if (!landscapeInputBoostRef.current) {
      return;
    }
    landscapeInputBoostRef.current = false;
    if (autoGamePerformanceRef.current) {
      return;
    }
    gamePerformanceModeRef.current = false;
    setGamePerformanceModeActive(false);
    keyboardBridge.setGamePerformanceMode(false);
    setGamePerformanceActive(false);
  }, []);

  const isNativeTypingCommitActive = useCallback(
    () => nativeFastPathActiveRef.current,
    [],
  );

  const handleSpaceLongPressZeroLatency = useCallback(() => {
    activateZeroLatencyMode();
  }, [activateZeroLatencyMode]);

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
        const context =
          payload && typeof payload.textBeforeCursor === 'string'
            ? payload.textBeforeCursor
            : '';
        editorContextRef.current = context;
        if (shouldDeferHeavyTypingSideEffects()) {
          const recentLetterCommit =
            Date.now() - lastLetterCommitAtRef.current < 400;
          const prefix = reconcileLivePrefixFromContext(
            context,
            livePrefixRef.current,
            recentLetterCommit,
          );
          livePrefixRef.current = prefix;
          previousWordRef.current = derivePreviousWordFromEditor(context, prefix);
          return;
        }
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
    setLayout('letters');
    resetCase();
    setCommaLauncherActive(getCommaLauncherArmed());
    setPeriodRewriteActive(getPeriodRewriteArmed());
  }, [resetCase]);

  const openItemsMenu = useCallback(() => {
    reloadEssentials();
    setMode({type: 'items-menu'});
    setLayout('letters');
    resetCase();
  }, [reloadEssentials, resetCase]);

  const openEssentialsList = useCallback(() => {
    if (!canUsePluginMenuItem('essentials')) {
      setShowUpsell(true);
      return;
    }
    reloadEssentials();
    setMode({type: 'essentials-list'});
    setLayout('letters');
    resetCase();
  }, [reloadEssentials, resetCase]);

  const reloadAutocorrect = useCallback(async () => {
    await reloadAutocorrectFromStorage();
    await ensurePersonalTypingLoaded();
    setAutocorrectSettings(getAutocorrectSettings());
  }, []);

  const runSuggestionEngineBootstrap = useCallback(() => {
    startSuggestionEngineWarmup();
    if (isMinimalSuggestionEngineReady()) {
      suggestionDictionariesReadyRef.current = true;
      setSuggestionEngineLoading(false);
      return Promise.resolve();
    }
    setSuggestionEngineLoading(true);
    return waitForMinimalSuggestionEngine().then(() => {
      suggestionDictionariesReadyRef.current = true;
      setSuggestionEngineLoading(false);
    });
  }, []);

  useEffect(() => {
    void runSuggestionEngineBootstrap().then(() => {
      scheduleDeferredLiveSuggestionBarRef.current();
    });
  }, [runSuggestionEngineBootstrap]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('keyboardShown', () => {
      void runSuggestionEngineBootstrap().then(() => {
        scheduleDeferredLiveSuggestionBarRef.current();
      });
    });
    return () => subscription.remove();
  }, [runSuggestionEngineBootstrap]);

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
    return subscribeTypingSuggestionBar(() => {
      setContextCorrectionTick(tick => tick + 1);
    });
  }, [theme.developerEyeEnabled]);

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
    const wasStopped = stoppedTypingRef.current;
    stoppedTypingRef.current = false;
    if (wasStopped) {
      setStoppedTyping(false);
    }
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      typingIdleTimerRef.current = null;
      if (!stoppedTypingRef.current) {
        stoppedTypingRef.current = true;
        setStoppedTyping(true);
      }
    }, 450);
  }, []);

  const openAutocorrect = useCallback(() => {
    if (!canUsePluginMenuItem('autocorrect')) {
      setShowUpsell(true);
      return;
    }
    setMode({type: 'autocorrect'});
    setLayout('letters');
    resetCase();
    void reloadAutocorrect();
  }, [reloadAutocorrect, resetCase]);

  const openGestures = useCallback(() => {
    if (!canUsePluginMenuItem('gestures')) {
      setShowUpsell(true);
      return;
    }
    setMode({type: 'gestures'});
    setLayout('letters');
    resetCase();
    void reloadGestures();
  }, [reloadGestures, resetCase]);

  const openCalculator = useCallback(() => {
    if (!canUsePluginMenuItem('calculator')) {
      setShowUpsell(true);
      return;
    }
    setCalculatorDisplay('0');
    setMode({type: 'calculator'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openTouchpad = useCallback(() => {
    if (!canUsePluginMenuItem('touchpad')) {
      setShowUpsell(true);
      return;
    }
    keyboardBridge.setTouchpadGestureConsuming(false);
    setTouchpadGestureActive(false);
    setMode({type: 'touchpad'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openResize = useCallback(() => {
    if (!canUsePluginMenuItem('resize')) {
      setShowUpsell(true);
      return;
    }
    setMode({type: 'resize'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openMetrics = useCallback(() => {
    if (!canUsePluginMenuItem('metrics')) {
      setShowUpsell(true);
      return;
    }
    setMode({type: 'metrics'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openOneHand = useCallback(() => {
    if (!canUsePluginMenuItem('onehand')) {
      setShowUpsell(true);
      return;
    }
    setMode({type: 'onehand'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const closeResize = useCallback((saveOffset?: number) => {
    if (typeof saveOffset === 'number') {
      const baseHeight =
        theme.keyboardHeightDp +
        (extraTopRowEnabled ? theme.keyHeight + theme.keyRowMargin : 0);
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
    theme.myRowEnabled,
    myRowSettingOn,
    theme.numberRowEnabled,
  ]);

  const openFormatPanel = useCallback(async () => {
    requireFeature('format', async () => {
      if (isListening) {
        await toggleListening();
      }
      if (mode.type !== 'typing' && mode.type !== 'emoji') {
        closeItemsFlow();
      }
      setMode({type: 'format'});
      setLayout('letters');
      resetCase();
    });
  }, [closeItemsFlow, isListening, mode.type, requireFeature, resetCase, toggleListening]);

  const closeFormatPanel = useCallback(() => {
    setMode({type: 'typing'});
    setLayout('letters');
    resetCase();
  }, [resetCase]);

  const openRewritePanel = useCallback(async () => {
    requireFeature('rewrite', async () => {
      if (isListening) {
        await toggleListening();
      }
      if (mode.type !== 'typing' && mode.type !== 'emoji') {
        closeItemsFlow();
      }
      setMode({type: 'rewrite'});
      setLayout('letters');
      resetCase();
    });
  }, [closeItemsFlow, isListening, mode.type, requireFeature, resetCase, toggleListening]);

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
      setShowUpsell(false);
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

  const openClipboard = useCallback(() => {
    if (!canUsePluginMenuItem('clipboard')) {
      setShowUpsell(true);
      return;
    }
    setClipboardItems(getClipboardItems());
    refreshClipboardPasteSuggestion?.();
    setMode({type: 'clipboard'});
    setLayout('letters');
    resetCase();
    void (async () => {
      await ensureClipboardLoaded().catch(() => {});
      await captureSystemClipboard().catch(() => null);
      setClipboardItems(getClipboardItems());
      refreshClipboardPasteSuggestion?.();
    })();
  }, [refreshClipboardPasteSuggestion, resetCase]);

  const toggleEmojiPanel = useCallback(async () => {
    if (mode.type === 'emoji') {
      setShowUpsell(false);
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
            void keyboardBridge.getTextBeforeCursor(280).then(text => {
              syncTypingCompositorFromEditor(text);
            });
  }, [isListening, mode.type, resetCase, syncTypingCompositorFromEditor, toggleListening]);

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

  const refreshSuggestions = useCallback(async (options?: {fast?: boolean}) => {
    const runId = suggestionRefreshRunIdRef.current + 1;
    suggestionRefreshRunIdRef.current = runId;
    if (isFloatingKeyboardDragActive()) {
      return;
    }
    if (
      layout !== 'letters' ||
      isClipboardMode ||
      isEmojiMode ||
      isRewriteMode ||
      isFormatMode ||
      isTranslateMode
    ) {
      startTransition(() => {
        setTypingBarSuggestions([]);
        setTypingBarEssentials([]);
        setTypingBarEssentialTriggerLength(0);
        setTypingBarPrefix('');
        setTypingBarAutocorrectPreview(null);
        setTypingBarTypedKeep(null);
      });
      return;
    }

    const fast = options?.fast ?? false;
    const livePrefix = livePrefixRef.current;
    const canUseLivePrefixFastPath =
      fast &&
      livePrefix.length > 0 &&
      !isEssentialTriggerPrefix(livePrefix);

    if (canUseLivePrefixFastPath) {
      const barState = computeTypingSuggestionBar(livePrefix, {
        fast: true,
        context: getEffectiveEditorContext(livePrefix),
        previousWord: previousWordRef.current,
        suggestionsOnly: true,
      });
      startTransition(() => {
        setTypingBarPrefix(livePrefix);
        setTypingBarTypedKeep(barState.typedKeepSuggestion);
        setTypingBarAutocorrectPreview(barState.autocorrectPreview);
        autocorrectPreviewRef.current = barState.autocorrectPreview;
        setTypingBarSuggestions(barState.suggestions);
        setTypingBarEssentials([]);
        setTypingBarEssentialTriggerLength(0);
      });
      return;
    }

    await ensureEssentialsLoaded();
    const context = await keyboardBridge.getTextBeforeCursor(96);
    editorContextRef.current = context;
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
    const essentialTrigger = extractEssentialTrigger(
      context,
      theme.essentialsMatchCaseEnabled,
    );
    if (essentialTrigger) {
      startTransition(() => {
        setTypingBarEssentialTriggerLength(essentialTrigger.triggerLength);
        setTypingBarEssentials(
          matchEssentialSuggestions(
            essentialTrigger.query,
            snippetSuggestionLimit(isPremium),
            theme.essentialsMatchCaseEnabled,
          ),
        );
        setTypingBarSuggestions([]);
        setTypingBarPrefix('');
        setTypingBarAutocorrectPreview(null);
        setTypingBarTypedKeep(null);
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
      setTypingBarPrefix(prefix);
      setTypingBarTypedKeep(barState.typedKeepSuggestion);
      setTypingBarAutocorrectPreview(barState.autocorrectPreview);
      autocorrectPreviewRef.current = barState.autocorrectPreview;
      setTypingBarSuggestions(barState.suggestions);
      setTypingBarEssentials([]);
      setTypingBarEssentialTriggerLength(0);
    });
  }, [
    isClipboardMode,
    isEmojiMode,
    isRewriteMode,
    isFormatMode,
    isTranslateMode,
    isPremium,
    layout,
    syncAutoCapitalizeShift,
    getEffectiveEditorContext,
  ]);

  const clearSuggestionBarForPrefix = useCallback((prefix: string) => {
    suggestionRefreshRunIdRef.current += 1;
    lastInstantPrefixRef.current = prefix;
    autocorrectPreviewRef.current = null;
    startTransition(() => {
      setTypingBarPrefix(prefix);
      setTypingBarTypedKeep(null);
      setTypingBarAutocorrectPreview(null);
      setTypingBarSuggestions([]);
      setTypingBarEssentials([]);
      setTypingBarEssentialTriggerLength(0);
    });
  }, []);

  const applyInstantSuggestionBar = useCallback((prefix: string) => {
    if (INSTANT_SUGGESTION_DISABLED) {
      return;
    }
    if (shouldDeferLiveSuggestionBar()) {
      scheduleDeferredLiveSuggestionBarRef.current();
      return;
    }
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }
    if (
      prefix.length > 0 &&
      !zeroLatencyModeRef.current &&
      !gamePerformanceModeRef.current
    ) {
      scheduleDeferredLiveSuggestionBarRef.current();
      return;
    }
    if (isEssentialTriggerPrefix(prefix)) {
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
      if (
        Platform.OS === 'android' &&
        !nativeFastPathActiveRef.current
      ) {
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
          setTypingBarPrefix(nextPrefix);
          setTypingBarTypedKeep(barState.typedKeepSuggestion);
          setTypingBarAutocorrectPreview(barState.autocorrectPreview);
          autocorrectPreviewRef.current = barState.autocorrectPreview;
          setTypingBarSuggestions(suggestions);
          setTypingBarEssentials([]);
          setTypingBarEssentialTriggerLength(0);
        });
      };

      if (!nextPrefix) {
        startTransition(() => {
          setTypingBarPrefix('');
          setTypingBarTypedKeep(null);
          setTypingBarAutocorrectPreview(null);
          autocorrectPreviewRef.current = null;
          setTypingBarEssentials([]);
          setTypingBarEssentialTriggerLength(0);
          lastFlushedBarPrefixRef.current = '';
          lastFlushedSuggestionsRef.current = [];
          lastFlushedAutocorrectRef.current = null;
          // Hinglish / Franglais: keep preferred-language starters visible between words.
          if (
            getActiveLanguage() === 'hi-en' ||
            getActiveLanguage() === 'fr-en' ||
            getActiveLanguage() === 'es-en'
          ) {
            const barState = computeTypingSuggestionBar('', {fast: true});
            setTypingBarSuggestions(barState.suggestions);
            lastFlushedSuggestionsRef.current = barState.suggestions;
          } else {
            setTypingBarSuggestions([]);
          }
        });
        return;
      }

      const preferNativeWords =
        nativeFastPathActiveRef.current &&
        Platform.OS === 'android' &&
        nextPrefix.length > 0;
      const liveContext = getEffectiveEditorContext(nextPrefix);
      const barState = computeTypingSuggestionBar(nextPrefix, {
        fast: true,
        context: liveContext,
        previousWord: previousWordRef.current,
        suggestionsOnly: true,
        prefixOnly: isBurstTypingActive(),
        preferNativeWords,
      });
      const suggestions =
        barState.suggestions.length > 0
          ? barState.suggestions
          : lastFlushedSuggestionsRef.current.length > 0
            ? lastFlushedSuggestionsRef.current
            : englishPrefixStarterCompletions(nextPrefix);
      commitSuggestionBarState(barState, suggestions);
    };

    if (instantSuggestionRafRef.current !== null) {
      return;
    }
    instantSuggestionRafRef.current = requestAnimationFrame(flush);
  }, [clearSuggestionBarForPrefix, getEffectiveEditorContext]);

  const flushPendingNativeSuggestions = useCallback(() => {
    const pending = pendingNativeSuggestionsRef.current;
    if (!pending) {
      return;
    }
    if (pending.prefix !== livePrefixRef.current) {
      pendingNativeSuggestionsRef.current = null;
      return;
    }
    pendingNativeSuggestionsRef.current = null;
    lastInstantPrefixRef.current = pending.prefix;
    lastFlushedBarPrefixRef.current = pending.prefix;
    lastFlushedSuggestionsRef.current = pending.suggestions;
    const barState = computeTypingSuggestionBar(pending.prefix, {
      fast: true,
      context: getEffectiveEditorContext(pending.prefix),
      previousWord: previousWordRef.current,
      suggestionsOnly: true,
    });
    lastFlushedAutocorrectRef.current = barState.autocorrectPreview;
    startTransition(() => {
      setTypingBarPrefix(pending.prefix);
      setTypingBarSuggestions(
        pending.suggestions.length > 0 ? pending.suggestions : barState.suggestions,
      );
      setTypingBarAutocorrectPreview(barState.autocorrectPreview);
      setTypingBarTypedKeep(barState.typedKeepSuggestion);
      autocorrectPreviewRef.current = barState.autocorrectPreview;
    });
  }, [getEffectiveEditorContext]);

  const flushDeferredLiveSuggestionBar = useCallback(() => {
    if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
      return;
    }
    const prefix = livePrefixRef.current;
    flushPendingNativeSuggestions();
    if (prefix.length === 0 || shouldSkipAutocorrectForToken(prefix)) {
      clearSuggestionBarForPrefix(prefix);
      return;
    }
    if (
      prefix === lastFlushedBarPrefixRef.current &&
      prefix === lastInstantPrefixRef.current &&
      lastFlushedSuggestionsRef.current.length > 0
    ) {
      return;
    }
    const typingLight = shouldUseLightSuggestionBar(lastTypingAtRef.current);
    const preferNativeWords =
      nativeFastPathActiveRef.current &&
      Platform.OS === 'android' &&
      prefix.length > 0;
    const barState = computeTypingSuggestionBar(prefix, {
      fast: true,
      landscapeLight: typingLight,
      context: getEffectiveEditorContext(prefix),
      previousWord: previousWordRef.current,
      suggestionsOnly: true,
      prefixOnly: typingLight && isBurstTypingActive(),
      preferNativeWords,
    });
    const suggestions =
      barState.suggestions.length > 0
        ? barState.suggestions
        : lastFlushedSuggestionsRef.current.length > 0
          ? lastFlushedSuggestionsRef.current
          : englishPrefixStarterCompletions(prefix);
    lastInstantPrefixRef.current = prefix;
    lastFlushedBarPrefixRef.current = prefix;
    lastFlushedSuggestionsRef.current = suggestions;
    lastFlushedAutocorrectRef.current = barState.autocorrectPreview;
    lastFlushedTypedKeepRef.current = barState.typedKeepSuggestion;
    startTransition(() => {
      setTypingBarPrefix(prefix);
      setTypingBarTypedKeep(barState.typedKeepSuggestion);
      setTypingBarAutocorrectPreview(barState.autocorrectPreview);
      autocorrectPreviewRef.current = barState.autocorrectPreview;
      setTypingBarSuggestions(suggestions);
      setTypingBarEssentials([]);
      setTypingBarEssentialTriggerLength(0);
    });
  }, [
    clearSuggestionBarForPrefix,
    flushPendingNativeSuggestions,
    getEffectiveEditorContext,
  ]);

  const scheduleDeferredLiveSuggestionBar = useCallback(() => {
    if (deferredBarFlushTimerRef.current) {
      clearTimeout(deferredBarFlushTimerRef.current);
    }
    deferredBarFlushTimerRef.current = setTimeout(() => {
      deferredBarFlushTimerRef.current = null;
      InteractionManager.runAfterInteractions(() => {
        flushDeferredLiveSuggestionBar();
      });
    }, isLandscapeTypingProfile() ? 56 : DEFERRED_BAR_FLUSH_MS);
  }, [flushDeferredLiveSuggestionBar]);

  useEffect(() => {
    scheduleDeferredLiveSuggestionBarRef.current = scheduleDeferredLiveSuggestionBar;
  }, [scheduleDeferredLiveSuggestionBar]);

  const flushTypingIdleSideEffects = useCallback(() => {
    updateLivePrefixPredictiveHitboxes();
    if (shouldDeferHeavyTypingSideEffects()) {
      if (!shouldDeferNativeTouchIntelligenceSync()) {
        syncTouchIntelligenceToNative(true);
      }
      scheduleDeferredLiveSuggestionBar();
      return;
    }
    syncTouchIntelligenceToNative(true);
    flushPendingNativeSuggestions();
    applyInstantSuggestionBar(livePrefixRef.current);
  }, [
    applyInstantSuggestionBar,
    flushPendingNativeSuggestions,
    scheduleDeferredLiveSuggestionBar,
    syncTouchIntelligenceToNative,
    updateLivePrefixPredictiveHitboxes,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = DeviceEventEmitter.addListener(
      'keyboardFloatingDrag',
      (active: boolean) => {
        if (active === true) {
          return;
        }
        flushPendingNativeSuggestions();
        scheduleDeferredLiveSuggestionBar();
        applyInstantSuggestionBar(livePrefixRef.current);
      },
    );
    return () => subscription.remove();
  }, [
    applyInstantSuggestionBar,
    flushPendingNativeSuggestions,
    scheduleDeferredLiveSuggestionBar,
  ]);

  const recordTypedWordLearnUndo = useCallback((word: string, boundary: string) => {
    const normalized = word.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    typedWordLearnUndoRef.current = [
      ...typedWordLearnUndoRef.current.slice(-9),
      {
        word: normalized,
        boundary,
        at: Date.now(),
      },
    ];
  }, []);

  const recordAutocorrectHistory = useCallback(
    (edit: AutocorrectHistoryEdit) => {
      if (!edit.original || edit.original === edit.correction) {
        return;
      }
      learnTapMapFromWordCorrection(
        edit.original,
        edit.correction,
        getWordLetterTapsForTapMap(),
        layoutContext?.getLayouts(),
      );
      clearWordLetterTapsForTapMap();
      autocorrectUndoStackRef.current = [
        ...autocorrectUndoStackRef.current.slice(-9),
        edit,
      ];
      autocorrectRedoStackRef.current = [];
      recordAutocorrectCorrection(edit.original, edit.correction);
    },
    [layoutContext],
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
        logAiAutocorrect( 'apply skipped: context changed', {
          original: edit.original,
          correction: edit.correction,
          contextTail: context.slice(-80),
        });
        return false;
      }
      logAiAutocorrect( 'applying correction', {
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
      playTypeLiftSound();
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
    if (
      !canUseFeature('autocorrect_full') ||
      !settings.enabled ||
      !settings.aiAutoCorrectEnabled
    ) {
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
        previousWord: previousWordRef.current,
        context: getEffectiveEditorContext(requestedToken),
        lightweight: true,
        skipFrequentScan: true,
      });
      if (localCandidate && localCandidate.confidence >= getAiPreflightSkipMinConfidence()) {
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
        })
        .catch(error => {
          logAiAutocorrect('preflight failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }, AI_PREFLIGHT_DEBOUNCE_MS);
  }, [getEffectiveEditorContext]);

  const scheduleAiProofread = useCallback(
    (delayMs = AI_PROOFREAD_DELAY_MS) => {
      if (
        zeroLatencyModeRef.current ||
        layoutRef.current !== 'letters' ||
        modeRef.current.type !== 'typing'
      ) {
        logAiAutocorrect( 'schedule skipped: not typing letters', {
          layout: layoutRef.current,
          mode: modeRef.current.type,
        });
        return;
      }
      const settings = getAutocorrectSettings();
      if (
        !canUseFeature('autocorrect_full') ||
        !settings.enabled ||
        !settings.aiAutoCorrectEnabled
      ) {
        logAiAutocorrect( 'schedule skipped: setting off', {
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
      logAiAutocorrect( 'scheduled', {delayMs, runId});
      aiProofreadTimerRef.current = setTimeout(() => {
        aiProofreadTimerRef.current = null;
        void (async () => {
          const idleMs = Date.now() - lastTypingAtRef.current;
          if (idleMs < AI_PROOFREAD_MIN_IDLE_MS || !stoppedTypingRef.current) {
            logAiAutocorrect( 'run skipped: still typing', {
              idleMs,
              runId,
              stoppedTyping: stoppedTypingRef.current,
            });
            if (!stoppedTypingRef.current) {
              scheduleAiProofread(AI_PROOFREAD_MIN_IDLE_MS);
            }
            return;
          }
          if (
            zeroLatencyModeRef.current ||
            layoutRef.current !== 'letters' ||
            modeRef.current.type !== 'typing'
          ) {
            logAiAutocorrect( 'run skipped: not typing letters', {
              layout: layoutRef.current,
              mode: modeRef.current.type,
              runId,
            });
            return;
          }
          const context = await keyboardBridge.getTextBeforeCursor(260);
          if (aiProofreadRunIdRef.current !== runId) {
            logAiAutocorrect( 'run skipped: stale run', {
              runId,
              currentRunId: aiProofreadRunIdRef.current,
            });
            return;
          }
          logAiAutocorrect( 'running proofread', {
            runId,
            contextTail: context.slice(-120),
          });
          setIsAiAutocorrectProcessing(true);
          try {
            const result = await proofreadRecentTypingContext(context);
            if (aiProofreadRunIdRef.current !== runId || result.kind === 'none') {
              logAiAutocorrect( 'run finished: no correction', {
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
              logAiAutocorrect( 'result skipped: context/original gate', {
                runId,
                original: result.original,
                lastOriginal: lastAiProofreadOriginalRef.current,
                contextTail: context.slice(-120),
              });
              return;
            }
            if (result.kind === 'auto' || result.kind === 'suggest') {
              logAiAutocorrect( 'auto apply result', {
                kind: result.kind,
                original: result.original,
                correction: result.correction,
              });
              await applyAiAutocorrectEdit(result);
              lastAiProofreadOriginalRef.current = result.original;
            }
          } catch (error) {
            logAiAutocorrect('run failed', {
              runId,
              message: error instanceof Error ? error.message : String(error),
            });
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
      // After a short pause, run the full context-aware path (not prefix-only).
      void refreshSuggestions({fast: false});
    }, debounceMs);
  },
  [applyInstantSuggestionBar, refreshSuggestions],
  );

  const applyShiftEditorChordSideEffects = useCallback(() => {
    shiftEditorChordUsedRef.current = true;
    hideAllKeyPreviews();
    triggerKeyHaptic();
    if (clipboardPasteSuggestionRef.current) {
      clearClipboardPasteSuggestion();
    }
    scheduleRefreshSuggestions();
  }, [clearClipboardPasteSuggestion, scheduleRefreshSuggestions]);

  const attemptShiftEditorChord = useCallback(
    (letter: string): boolean => {
      if (
        !tryShiftEditorShortcut({
          enabled: gestureSettingsRef.current.shiftEditorShortcuts,
          shiftEditorHeld: shiftEditorHeldRef.current,
          capsLocked: capsLockedRef.current,
          layout: layoutRef.current,
          letter,
        })
      ) {
        return false;
      }
      applyShiftEditorChordSideEffects();
      return true;
    },
    [applyShiftEditorChordSideEffects],
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

    lastInstantPrefixRef.current = prefix;
    scheduleDeferredLiveSuggestionBar();
  }, [
    applyInstantSuggestionBar,
    cancelPendingInstantSuggestionBar,
    clearSuggestionBarForPrefix,
    scheduleDeferredLiveSuggestionBar,
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
    }, isLandscapeTypingProfile() ? 72 : BACKSPACE_BAR_FLUSH_MS);
  }, [flushBackspaceSuggestionBar]);

  useEffect(() => {
    return () => {
      if (suggestionRefreshTimerRef.current) {
        clearTimeout(suggestionRefreshTimerRef.current);
      }
      if (backspaceBarTimerRef.current) {
        clearTimeout(backspaceBarTimerRef.current);
      }
      if (deferredBarFlushTimerRef.current) {
        clearTimeout(deferredBarFlushTimerRef.current);
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
        commitSeq?: number;
      },
    ) => {
      const commitSeq = options?.commitSeq;
      clearMidWordAutoShift();
      const zeroLatency = zeroLatencyModeRef.current;
      const boundaryLength = options?.boundaryPreInserted ? boundary.length : 0;
      const boundaryText = options?.boundaryPreInserted ? boundary : '';
      const applyBoundary = () => {
        if (!options?.boundaryPreInserted) {
          insertBoundary();
        }
      };
      // Space/enter handlers may start getTextBeforeCursor before the boundary char
      // is committed — always re-read after a pre-inserted boundary.
      const context = options?.boundaryPreInserted
        ? await keyboardBridge.getTextBeforeCursor(96)
        : await (options?.contextPromise ??
            keyboardBridge.getTextBeforeCursor(96));

      if (commitSeq != null && commitSeq !== boundaryCommitSeqRef.current) {
        return;
      }
      if (livePrefixRef.current.length > 0 && !options?.boundaryPreInserted) {
        return;
      }
      if (options?.boundaryPreInserted && livePrefixRef.current.length > 0) {
        livePrefixRef.current = '';
      }

      const finishLightweightBoundary = () => {
        const typedWord = typedWordFallback.trim();
        if (typedWord) {
          const lower = typedWord.toLowerCase();
          if (isDictionaryWord(lower) || (getLearnedCounts().get(lower) ?? 0) > 0) {
            recordLearnedWord(typedWord, 'typed');
            recordTypedWordLearnUndo(typedWord, boundaryText || boundary);
          }
          recordWordCommitted();
          previousWordRef.current = lower;
        }
        applyBoundary();
      };

      if (zeroLatency) {
        finishLightweightBoundary();
        return;
      }

      syncTypingCompositorFromEditor(context);
      startSuggestionEngineWarmup();
      if (isMinimalSuggestionEngineReady()) {
        suggestionDictionariesReadyRef.current = true;
      }
      if (endsWithRewriteCommand(context)) {
        keyboardBridge.replaceWordPrefix(REWRITE_COMMAND.length, '');
        await openRewritePanel();
        return;
      }
      const expansion = theme.essentialsEnabled
        ? resolveEssentialExpansion(context, theme.essentialsMatchCaseEnabled)
        : null;
      if (expansion) {
        keyboardBridge.replaceWordPrefix(
          expansion.triggerLength + boundaryLength,
          expansion.value + boundaryText,
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
        suggestionDictionariesReadyRef.current = true;
      }

      let typedWord = pickTypedWordForBoundary(context, typedWordFallback.trim());
      const autocorrectOn = getAutocorrectSettings().enabled;

      const contextTail =
        boundaryText.length > 0 && context.endsWith(boundaryText)
          ? context.slice(0, -boundaryText.length)
          : context;
      const contextWord = extractCurrentWord(contextTail).trim();
      const contextMatchesTypedWord =
        typedWord.length >= 2 &&
        (context.endsWith(typedWord) ||
          context.endsWith(`${typedWord}${boundaryText}`) ||
          (contextWord.length > 0 &&
            contextWord.toLowerCase() === typedWord.toLowerCase()));

      if (autocorrectOn && typedWord.length >= 2 && contextMatchesTypedWord) {
        const preflight = aiPreflightCacheRef.current.get(typedWord);
        aiPreflightCacheRef.current.delete(typedWord);
        if (preflight?.kind === 'auto' || preflight?.kind === 'suggest') {
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
          lightweight: false,
          boundary: true,
          context,
          previousWord: extractPreviousWordFromContext(
            context,
            typedWord,
          ),
        });
        if (shouldAutoApply(candidate, typedWord)) {
          learnTapMapFromWordCorrection(
            typedWord,
            candidate!.correction,
            getWordLetterTapsForTapMap(),
            layoutContext?.getLayouts(),
          );
          clearWordLetterTapsForTapMap();
          keyboardBridge.replaceWordPrefix(
            typedWord.length + boundaryLength,
            candidate!.correction + boundaryText,
          );
          const correctedTail =
            candidate!.correction.split(/\s+/).pop() ?? typedWord;
          previousWordRef.current = correctedTail.toLowerCase();
          if (shouldLearnAutocorrectPair(typedWord, candidate!.correction)) {
            observeCorrectionAccepted(typedWord, candidate!.correction);
          }
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
          recordTypedWordLearnUndo(typedWord, boundaryText || boundary);
        }
        clearWordLetterTapsForTapMap();
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
      recordTypedWordLearnUndo,
      refreshSuggestions,
      scheduleAiProofread,
      syncTypingCompositorFromEditor,
      startSuggestionEngineWarmup,
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
    setLandscapeTypingProfile(theme.isLandscape);
    if (theme.isLandscape) {
      activateLandscapeInputBoost();
    } else {
      deactivateLandscapeInputBoost();
      if (gamePerformanceModeRef.current && !autoGamePerformanceRef.current) {
        gamePerformanceModeRef.current = false;
        setGamePerformanceModeActive(false);
        keyboardBridge.setGamePerformanceMode(false);
        setGamePerformanceActive(false);
      }
    }
    return () => {
      deactivateLandscapeInputBoost();
      setLandscapeTypingProfile(false);
    };
  }, [
    activateLandscapeInputBoost,
    deactivateLandscapeInputBoost,
    theme.isLandscape,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      layoutContext?.requestRemeasure();
    }, 100);
    return () => clearTimeout(timer);
  }, [layoutContext, theme.isLandscape]);

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

  const orientationPrefixSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'keyboardOrientationChange',
      () => {
        hideAllKeyPreviews();
        initKeyPreview();
        layoutContext?.requestRemeasure();
        requestAnimationFrame(() => {
          layoutContext?.requestRemeasure();
        });
        if (orientationPrefixSyncTimerRef.current) {
          clearTimeout(orientationPrefixSyncTimerRef.current);
        }
        orientationPrefixSyncTimerRef.current = setTimeout(() => {
          orientationPrefixSyncTimerRef.current = null;
          void keyboardBridge.getTextBeforeCursor(96).then(context => {
            editorContextRef.current = context;
            const prefix = reconcileLivePrefixFromContext(
              context,
              livePrefixRef.current,
              false,
            );
            livePrefixRef.current = prefix;
            previousWordRef.current = derivePreviousWordFromEditor(context, prefix);
            syncNativeSuggestionPrefix(prefix);
            keyboardBridge.syncCompactTypingPrefix(prefix);
          });
        }, 120);
        void keyboardBridge.isCurrentEditorGame().then(isGame => {
          if (isGame && modeRef.current.type === 'typing') {
            activateGamePerformanceMode();
            return;
          }
          if (autoGamePerformanceRef.current) {
            autoGamePerformanceRef.current = false;
            if (!landscapeInputBoostRef.current) {
              gamePerformanceModeRef.current = false;
              setGamePerformanceModeActive(false);
              keyboardBridge.setGamePerformanceMode(false);
              setGamePerformanceActive(false);
            }
          }
          if (isLandscapeTypingProfile()) {
            activateLandscapeInputBoost();
          }
        });
      },
    );
    return () => {
      subscription.remove();
      if (orientationPrefixSyncTimerRef.current) {
        clearTimeout(orientationPrefixSyncTimerRef.current);
      }
    };
  }, [
    activateGamePerformanceMode,
    activateLandscapeInputBoost,
    layoutContext,
  ]);

  useEffect(() => {
    setControllerFocus(current => normalizeControllerFocus(rows, current));
  }, [rows]);

  const handleShiftEditorPressIn = useCallback(() => {
    shiftEditorPressStartedAtRef.current = Date.now();
    shiftEditorChordUsedRef.current = false;
    shiftEditorHeldRef.current = true;
    setShiftEditorHeld(true);
  }, []);

  const handleShiftEditorPressOut = useCallback(() => {
    const elapsed = Date.now() - shiftEditorPressStartedAtRef.current;
    shiftEditorHeldRef.current = false;
    setShiftEditorHeld(false);
    if (
      elapsed < SHIFT_EDITOR_QUICK_TAP_MS &&
      !shiftEditorChordUsedRef.current
    ) {
      handleShiftPressRef.current();
    }
  }, []);

  const handleShiftPressRef = useRef<() => void>(() => {});

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
    if (!nextShift) {
      autoShiftConsumedMidWordRef.current = true;
    } else {
      autoShiftConsumedMidWordRef.current = false;
      keyboardBridge.clearNativeMidWordShiftBlock();
    }
    shiftOnRef.current = nextShift;
    setShiftOn(nextShift);
    syncNativeFastPathCaseState();
  }, [syncNativeFastPathCaseState]);

  useEffect(() => {
    handleShiftPressRef.current = handleShiftPress;
  }, [handleShiftPress]);

  const handleEssentialSuggestionSelect = useCallback(
    (essential: {keyword: string; value: string}) => {
      markTyping();
      const stored = getEssentialsList().find(
        item => item.keyword === essential.keyword,
      );
      const insertValue = stored
        ? expandEssentialForInsert(stored)
        : essential.value;
      keyboardBridge.replaceWordPrefix(
        getTypingSuggestionBarState().essentialTriggerLength,
        insertValue,
      );
      setTypingBarEssentials([]);
      setTypingBarEssentialTriggerLength(0);
      requestAnimationFrame(() => {
        refreshSuggestions();
      });
    },
    [
      isPremium,
      markTyping,
      refreshSuggestions,
    ],
  );

  const handleSuggestionSelect = useCallback(
    (word: string) => {
      markTyping();
      void keyboardBridge.getTextBeforeCursor(96).then(context => {
        const bar = getTypingSuggestionBarState();
        const {autocorrectPreview, typedKeepSuggestion, currentPrefix} = bar;
        const isAutocorrectCorrection =
          autocorrectPreview != null && word === autocorrectPreview;
        const isKeepChip =
          typedKeepSuggestion != null &&
          word === typedKeepSuggestion &&
          currentPrefix.length > 0;

        if (isAutocorrectCorrection && currentPrefix) {
          // Autocorrect corrections (including ones with punctuation like "i guess," or
          // multi-word like "i don't know,") always replace the current typed letters only.
          if (shouldLearnAutocorrectPair(currentPrefix, word)) {
            observeCorrectionAccepted(currentPrefix, word);
          }
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
      capsLocked,
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

  const handleClipboardPasteDismiss = useCallback(() => {
    const item = clipboardPasteSuggestion;
    if (!item) {
      return;
    }
    clearClipboardPasteSuggestion(item.fingerprint);
    const match = getClipboardItems().find(entry => {
      if (item.kind === 'image' && entry.kind === 'image') {
        return entry.imageUri === item.imageUri;
      }
      if (item.kind === 'text' && entry.kind === 'text') {
        return entry.text === item.text;
      }
      return false;
    });
    if (match) {
      void deleteClipboardItem(match.id).then(reloadClipboard);
      return;
    }
    void reloadClipboard();
  }, [
    clearClipboardPasteSuggestion,
    clipboardPasteSuggestion,
    reloadClipboard,
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

  const handleTypedWordLearningBackspace = useCallback((): boolean => {
    const entry = typedWordLearnUndoRef.current.at(-1);
    if (!entry) {
      return false;
    }
    // Only treat as "undo learned word" when user has not started typing next token.
    if (livePrefixRef.current.length > 0) {
      return false;
    }
    if (Date.now() - entry.at > TYPED_WORD_UNDO_WINDOW_MS) {
      typedWordLearnUndoRef.current = typedWordLearnUndoRef.current.slice(0, -1);
      return false;
    }
    typedWordLearnUndoRef.current = typedWordLearnUndoRef.current.slice(0, -1);
    undoLearnedWord(entry.word, 'typed');
    keyboardBridge.deleteBackward();
    livePrefixRef.current = '';
    refreshTouchIntelligenceFromLivePrefix();
    lastTypingAtRef.current = Date.now();
    scheduleBackspaceBarFlush();
    scheduleRefreshSuggestions();
    return true;
  }, [
    refreshTouchIntelligenceFromLivePrefix,
    scheduleBackspaceBarFlush,
    scheduleRefreshSuggestions,
  ]);

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
      setTypingBarAutocorrectPreview(null);
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
          if (
            keyDef.type === 'backspace' &&
            (handleAutocorrectBackspace() || handleTypedWordLearningBackspace())
          ) {
            return;
          }
          keyboardBridge.deleteBackward();
          livePrefixRef.current = livePrefixRef.current.slice(0, -1);
          if (!zeroLatencyModeRef.current) {
            refreshTouchIntelligenceFromLivePrefix();
          }
          return;
        }
        if (
          keyDef.type !== 'space' &&
          keyDef.type !== 'enter' &&
          keyDef.value
        ) {
          if (
            layout === 'letters' &&
            attemptShiftEditorChord(keyDef.value)
          ) {
            return;
          }
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

      switch (keyDef.type) {
        case 'backspace':
          if (handleAutocorrectBackspace() || handleTypedWordLearningBackspace()) {
            return;
          }
          if (
            layoutRef.current === 'letters' &&
            modeRef.current.type === 'typing'
          ) {
            keyboardBridge.deleteBackwardFast();
          } else {
            keyboardBridge.deleteBackward();
          }
          backspaceSyncSeqRef.current += 1;
          livePrefixRef.current = livePrefixRef.current.slice(0, -1);
          if (
            !isLandscapeTypingProfile() &&
            !isCompactNativeTypingActive()
          ) {
            refreshTouchIntelligenceFromLivePrefix();
          }
          lastTypingAtRef.current = Date.now();
          if (autocorrectPreviewRef.current) {
            autocorrectPreviewRef.current = null;
            if (
              !isLandscapeTypingProfile() &&
              !isCompactNativeTypingActive()
            ) {
              setTypingBarAutocorrectPreview(null);
            }
          }
          if (
            !isLandscapeTypingProfile() &&
            !isCompactNativeTypingActive()
          ) {
            setTypingBarTypedKeep(current => (current ? null : current));
          }
          scheduleBackspaceBarFlush();
          return;
        case 'space': {
          const typedFallback = livePrefixRef.current;
          if (typedFallback.trim()) {
            previousWordRef.current = typedFallback.trim().toLowerCase();
          }
          boundaryCommitSeqRef.current += 1;
          const commitSeq = boundaryCommitSeqRef.current;
          livePrefixRef.current = '';
          touchIntelligencePreviousKeyRef.current = null;
          syncTouchIntelligenceToNative();
          keyboardBridge.insertText(' ');
          syncNativeSuggestionPrefix('');
          if (zeroLatencyModeRef.current) {
            if (typedFallback.trim()) {
              const lower = typedFallback.trim().toLowerCase();
              if (
                isDictionaryWord(lower) ||
                (getLearnedCounts().get(lower) ?? 0) > 0
              ) {
                recordLearnedWord(typedFallback.trim(), 'typed');
                recordTypedWordLearnUndo(typedFallback.trim(), ' ');
              }
              recordWordCommitted();
            }
            return;
          }
          applyInstantSuggestionBar('');
          void commitTypedWordBoundary(
            () => {},
            ' ',
            typedFallback,
            {boundaryPreInserted: true, commitSeq},
          );
          return;
        }
        case 'enter': {
          const typedFallback = livePrefixRef.current;
          boundaryCommitSeqRef.current += 1;
          const commitSeq = boundaryCommitSeqRef.current;
          livePrefixRef.current = '';
          touchIntelligencePreviousKeyRef.current = null;
          syncTouchIntelligenceToNative();
          previousWordRef.current = '';
          emptyContextTrustworthyRef.current = false;
          autocorrectPreviewRef.current = null;
          setTypingBarAutocorrectPreview(null);
          setTypingBarTypedKeep(null);
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
            if (typedFallback.trim()) {
              const lower = typedFallback.trim().toLowerCase();
              if (
                isDictionaryWord(lower) ||
                (getLearnedCounts().get(lower) ?? 0) > 0
              ) {
                recordLearnedWord(typedFallback.trim(), 'typed');
                recordTypedWordLearnUndo(typedFallback.trim(), '');
              }
              recordWordCommitted();
            }
            return;
          }
          void commitTypedWordBoundary(
            () => {
              keyboardBridge.submitEnterKey();
            },
            '',
            typedFallback,
            {commitSeq},
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
            if (
              layout === 'letters' &&
              mode.type === 'typing' &&
              attemptShiftEditorChord(keyDef.value)
            ) {
              return;
            }
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
      applyInstantSuggestionBar,
      attemptShiftEditorChord,
      clearClipboardPasteSuggestion,
      clearSuggestionBarForPrefix,
      commitTypedWordBoundary,
      consumeLetterCommitText,
      handleAutocorrectBackspace,
      handleTypedWordLearningBackspace,
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
    if (zeroLatencyModeRef.current || gamePerformanceModeRef.current) {
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

      if (isCompactNativeTypingActive()) {
        hasTypedInFieldRef.current = true;
        const now = Date.now();
        lastTypingAtRef.current = now;
        markTypingChurn(now + TYPING_HEAVY_DEFER_MS);
        return;
      }

      if (isLandscapeTypingProfile()) {
        hasTypedInFieldRef.current = true;
        const now = Date.now();
        if (/[a-z]/i.test(text)) {
          lastLetterCommitAtRef.current = now;
          livePrefixRef.current += text;
          editorContextRef.current = getEffectiveEditorContext(
            livePrefixRef.current,
          );
          previousWordRef.current = derivePreviousWordFromEditor(
            editorContextRef.current,
            livePrefixRef.current,
          );
          updateLivePrefixPredictiveHitboxes();
          scheduleDeferredLiveSuggestionBar();
        } else if (text === ' ') {
          livePrefixRef.current = '';
          clearMidWordAutoShift();
        }
        lastTypingAtRef.current = now;
        markTypingChurn(now + TYPING_HEAVY_DEFER_MS);
        return;
      }

      if (zeroLatencyModeRef.current) {
        hasTypedInFieldRef.current = true;
        if (/[a-z]/i.test(text)) {
          lastLetterCommitAtRef.current = Date.now();
          livePrefixRef.current += text;
          updateLivePrefixPredictiveHitboxes();
        } else if (text === ' ') {
          livePrefixRef.current = '';
          clearMidWordAutoShift();
        }
        return;
      }

      const now = Date.now();
      const burstTyping =
        isBurstTypingActive() ||
        (/[a-z]/i.test(text) && isBurstTyping(lastLetterCommitAtRef.current, now));

      hasTypedInFieldRef.current = true;
      if (myRowSettingOn && isMyRowTrackableChar(text)) {
        recordMyRowSymbol(text);
      }
      if (/[a-z]/i.test(text)) {
        lastLetterCommitAtRef.current = now;
        livePrefixRef.current += text;
        editorContextRef.current = getEffectiveEditorContext(
          livePrefixRef.current,
        );
        previousWordRef.current = derivePreviousWordFromEditor(
          editorContextRef.current,
          livePrefixRef.current,
        );
        touchIntelligencePreviousKeyRef.current = text.toLowerCase();
        updateLivePrefixPredictiveHitboxes();
        if (!shouldDeferNativeTouchIntelligenceSync()) {
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
        updateLivePrefixPredictiveHitboxes();
        if (!shouldDeferNativeTouchIntelligenceSync()) {
          syncTouchIntelligenceToNative();
        }
        if (text === ' ' && Platform.OS === 'android') {
          void keyboardBridge.getTextBeforeCursor(96).then(nextContext => {
            syncAutoCapitalizeShift(nextContext);
          });
        }
      }
      lastTypingAtRef.current = now;
      markTypingChurn(now + TYPING_HEAVY_DEFER_MS);

      if (burstTyping) {
        setBurstTypingActive(true);
        if (burstTypingEndTimerRef.current) {
          clearTimeout(burstTypingEndTimerRef.current);
        }
        burstTypingEndTimerRef.current = setTimeout(() => {
          burstTypingEndTimerRef.current = null;
          setBurstTypingActive(false);
          flushTypingIdleSideEffects();
        }, BURST_TYPING_IDLE_MS);
      }

      const deferLiveSuggestionBar =
        burstTyping || shouldDeferLiveSuggestionBar();

      if (/[a-z]/i.test(text)) {
        scheduleDeferredLiveSuggestionBar();
      } else if (!deferLiveSuggestionBar) {
        if (text === ' ' || text.trim().length === 0) {
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
    [applyInstantSuggestionBar, clearMidWordAutoShift, flushTypingIdleSideEffects, getEffectiveEditorContext, myRowSettingOn, scheduleAiPreflight, scheduleBackspaceBarFlush, scheduleDeferredLiveSuggestionBar, syncAutoCapitalizeShift, syncTouchIntelligenceToNative, updateLivePrefixPredictiveHitboxes],
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

      if (
        modeRef.current.type === 'typing' &&
        layoutRef.current === 'letters' &&
        keyDef.value &&
        attemptShiftEditorChord(keyDef.value)
      ) {
        markTyping();
        return;
      }

      keyboardBridge.insertKeyText(text);
      applyCommittedKeyTextSideEffects(text);
    },
    [
      applyCommittedKeyTextSideEffects,
      attemptShiftEditorChord,
      markTyping,
    ],
  );

  const handleNativeFastPathLetterCommit = useCallback(
    (text: string) => {
      if (!text || modeRef.current.type !== 'typing') {
        return;
      }
      if (isCompactNativeTypingActive()) {
        return;
      }
      if (
        layoutRef.current === 'letters' &&
        isShiftEditorShortcutEligible({
          enabled: gestureSettingsRef.current.shiftEditorShortcuts,
          shiftEditorHeld: shiftEditorHeldRef.current,
          capsLocked: capsLockedRef.current,
          layout: 'letters',
          letter: text,
        })
      ) {
        keyboardBridge.deleteBackward();
        void executeShiftEditorShortcut(text);
        applyShiftEditorChordSideEffects();
        return;
      }
      nativeSideEffectDedupRef.current = {text, at: Date.now()};
      if (clipboardPasteSuggestionRef.current) {
        clearClipboardPasteSuggestion();
      }
      applyCommittedKeyTextSideEffects(text);
    },
    [
      applyShiftEditorChordSideEffects,
      applyCommittedKeyTextSideEffects,
      clearClipboardPasteSuggestion,
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
    const subscription = DeviceEventEmitter.addListener(
      'keyboardEditorShortcut',
      (payload: {action?: string; shiftConsumed?: boolean}) => {
        if (modeRef.current.type !== 'typing') {
          return;
        }
        if (payload?.shiftConsumed) {
          syncNativeShiftConsumed();
        }
        if (clipboardPasteSuggestionRef.current) {
          clearClipboardPasteSuggestion();
        }
        if (payload?.action === 'paste') {
          scheduleRefreshSuggestions();
        }
      },
    );
    return () => subscription.remove();
  }, [clearClipboardPasteSuggestion, scheduleRefreshSuggestions, syncNativeShiftConsumed]);

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
        if (shouldDeferLiveSuggestionBar()) {
          pendingNativeSuggestionsRef.current = snapshot;
          lastInstantPrefixRef.current = snapshot.prefix;
          return;
        }
        pendingNativeSuggestionsRef.current = null;
        lastInstantPrefixRef.current = snapshot.prefix;
        lastFlushedBarPrefixRef.current = snapshot.prefix;
        lastFlushedSuggestionsRef.current = snapshot.suggestions;
        const typingLight = shouldUseLightSuggestionBar(lastTypingAtRef.current);
        const barState = computeTypingSuggestionBar(snapshot.prefix, {
          fast: true,
          landscapeLight: typingLight,
          context: getEffectiveEditorContext(snapshot.prefix),
          previousWord: previousWordRef.current,
          suggestionsOnly: true,
          prefixOnly: typingLight && isBurstTypingActive(),
        });
        lastFlushedAutocorrectRef.current = barState.autocorrectPreview;
        startTransition(() => {
          setTypingBarPrefix(snapshot.prefix);
          setTypingBarSuggestions(
            snapshot.suggestions.length > 0
              ? snapshot.suggestions
              : barState.suggestions,
          );
          setTypingBarAutocorrectPreview(barState.autocorrectPreview);
          setTypingBarTypedKeep(barState.typedKeepSuggestion);
          autocorrectPreviewRef.current = barState.autocorrectPreview;
        });
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const stateSubscription = DeviceEventEmitter.addListener(
      'compactTypingStateSync',
      (payload: {
        prefix?: string;
        shiftOn?: boolean;
        capsLocked?: boolean;
        reason?: string;
      }) => {
        if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
          return;
        }
        const prefix = typeof payload?.prefix === 'string' ? payload.prefix : '';
        livePrefixRef.current = prefix;
        const reason = payload?.reason ?? '';
        if (typeof payload?.shiftOn === 'boolean') {
          shiftOnRef.current = payload.shiftOn;
        }
        if (typeof payload?.capsLocked === 'boolean') {
          capsLockedRef.current = payload.capsLocked;
        }
        if (reason === 'idle') {
          setShiftOn(shiftOnRef.current);
          setCapsLocked(capsLockedRef.current);
          syncNativeFastPathCaseState();
          editorContextRef.current = getEffectiveEditorContext(prefix);
          previousWordRef.current = derivePreviousWordFromEditor(
            editorContextRef.current,
            prefix,
          );
          flushTypingIdleSideEffects();
        }
        if (reason === 'space' || reason === 'enter' || reason === 'backspace') {
          startTransition(() => {
            setTypingBarPrefix(prefix);
            if (prefix.length === 0) {
              setTypingBarSuggestions([]);
              setTypingBarAutocorrectPreview(null);
              setTypingBarTypedKeep(null);
              autocorrectPreviewRef.current = null;
            }
          });
        }
      },
    );

    const boundarySubscription = DeviceEventEmitter.addListener(
      'compactTypingBoundary',
      (payload: {boundary?: string; typedWord?: string}) => {
        if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
          return;
        }
        if (zeroLatencyModeRef.current) {
          return;
        }
        const boundary = typeof payload?.boundary === 'string' ? payload.boundary : '';
        const typedWord =
          typeof payload?.typedWord === 'string' ? payload.typedWord : '';
        boundaryCommitSeqRef.current += 1;
        const commitSeq = boundaryCommitSeqRef.current;
        livePrefixRef.current = '';
        touchIntelligencePreviousKeyRef.current = null;
        if (typedWord.trim()) {
          previousWordRef.current = typedWord.trim().toLowerCase();
        }
        applyInstantSuggestionBar('');
        void commitTypedWordBoundary(
          () => {},
          boundary,
          typedWord,
          {
            boundaryPreInserted: boundary.length > 0,
            commitSeq,
          },
        );
      },
    );

    const shiftSubscription = DeviceEventEmitter.addListener(
      'compactTypingShiftPress',
      () => {
        if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
          return;
        }
        handleShiftPressRef.current();
        queueMicrotask(() => {
          syncNativeFastPathCaseState();
        });
      },
    );

    const letterTapSubscription = DeviceEventEmitter.addListener(
      'compactLetterTap',
      (payload: {letter?: string; localX?: number; localY?: number}) => {
        if (layoutRef.current !== 'letters' || modeRef.current.type !== 'typing') {
          return;
        }
        if (shouldSkipTouchIntelligenceWork()) {
          return;
        }
        const letter =
          typeof payload?.letter === 'string' ? payload.letter.trim().toLowerCase() : '';
        if (letter.length !== 1 || !/[a-z]/.test(letter)) {
          return;
        }
        const localX = Number(payload?.localX);
        const localY = Number(payload?.localY);
        if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
          return;
        }
        learnTapMapFromKeyTap(letter, localX, localY);
      },
    );

    return () => {
      stateSubscription.remove();
      boundarySubscription.remove();
      shiftSubscription.remove();
      letterTapSubscription.remove();
    };
  }, [
    applyInstantSuggestionBar,
    commitTypedWordBoundary,
    flushTypingIdleSideEffects,
    getEffectiveEditorContext,
    syncNativeFastPathCaseState,
  ]);

  const handleWordCommitted = useCallback(
    (word: string, options?: {textAlreadyInserted?: boolean}) => {
      setSwipePreview(null);
      markTyping();
      clearClipboardPasteSuggestion();
      recordLearnedWord(word);
      recordWordCommitted();
      recordKeystroke('char');

      const afterInsert = () => {
        livePrefixRef.current = '';
        touchIntelligencePreviousKeyRef.current = null;
        syncTouchIntelligenceToNative();

        if (shiftOn && !capsLocked) {
          setShiftOn(false);
        }
        requestAnimationFrame(() => {
          void refreshSuggestions();
        });
      };

      if (options?.textAlreadyInserted) {
        afterInsert();
        return;
      }

      void (async () => {
        const context = await keyboardBridge.getTextBeforeCursor(64);
        const needsLeadingSpace = shouldInsertLeadingSpaceBeforeWord(
          context,
          livePrefixRef.current,
        );
        keyboardBridge.insertText(needsLeadingSpace ? ` ${word} ` : `${word} `);
        afterInsert();
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
    if (!canUseFeature('stickers')) {
      setShowUpsell(true);
      return;
    }
    try {
      await insertStickerLySticker(sticker);
      void recordRecentSticker(sticker);
    } catch (error) {
      console.warn('Failed to insert sticker', error);
    }
  }, []);

  const handleSfxSelect = useCallback(async (sound: MyInstantsSound) => {
    if (!canUseFeature('sfx')) {
      setShowUpsell(true);
      return;
    }
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
    if (!canUseFeature('sfx')) {
      setShowUpsell(true);
      return;
    }
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
    mode.type === 'typing' && layout === 'letters';
  const keyGesturesActive = mode.type === 'typing';
  const nativeFastPathEligible =
    NATIVE_FAST_PATH_ENABLED &&
    mode.type === 'typing' &&
    layout === 'letters';

  useEffect(() => {
    if (!layoutContext) {
      nativeFastPathActiveRef.current = false;
      lastPublishedLandscapeRef.current = null;
      setCompactTypingNativeActive(false);
      setCompactNativeTypingActive(false);
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
      return;
    }
    if (!nativeFastPathEligible) {
      nativeFastPathActiveRef.current = false;
      lastPublishedLandscapeRef.current = null;
      setCompactTypingNativeActive(false);
      setCompactNativeTypingActive(false);
      keyboardBridge.setNativeKeyFastPathConfig(JSON.stringify({enabled: false}));
      if (theme.predictiveHitboxesEnabled) {
        updatePredictiveHitboxes(livePrefixRef.current, layoutContext.getLayouts(), {
          enabled: true,
          lang: getActiveLanguage(),
        });
      }
      syncTouchIntelligenceToNative(true);
      return;
    }

    let cancelled = false;
    let publishRaf: number | null = null;
    const publishConfig = () => {
      if (cancelled) {
        return;
      }

      layoutContext.refreshAreaBounds(
        measuredBounds => {
          if (cancelled) {
            return;
          }

          const origin = {
            pageX: measuredBounds.pageX,
            pageY: measuredBounds.pageY,
          };
          const originReady = nativeTypingOriginReady(measuredBounds);

        const keyLayouts = layoutContext
          .getLayouts()
          .filter(({keyDef}) => {
            if (keyDef.type === 'spacer') {
              return false;
            }
            const type = keyDef.type;
            if (
              type === 'backspace' ||
              type === 'space' ||
              type === 'shift' ||
              type === 'enter' ||
              type === 'enter-backspace' ||
              type === 'numbers' ||
              type === 'symbols' ||
              type === 'letters'
            ) {
              return true;
            }
            if (!keyDef.value || type === 'comma' || type === 'period') {
              return false;
            }
            return keyDef.value.length > 0;
          });

        const layoutEpoch = layoutContext.layoutEpoch;
        const landscape = theme.isLandscape;
        const reactTagsSignature =
          buildNativeFastPathReactTagsSignature(keyLayouts);
        const previewPopupEnabled = keyPreviewStyle === 'popup';
        const previewPressedEnabled =
          keyPreviewStyle === 'popup' || keyPreviewStyle === 'subtle';
        const previewDoodleEnabled = keyPreviewStyle === 'doodle';

        if (keyLayouts.length < NATIVE_FAST_PATH_MIN_KEYS) {
          nativeFastPathActiveRef.current = false;
          setCompactTypingNativeActive(false);
          setCompactNativeTypingActive(false);
          keyboardBridge.setNativeKeyFastPathConfig(
            JSON.stringify({enabled: false}),
          );
          if (theme.predictiveHitboxesEnabled) {
            updatePredictiveHitboxes(livePrefixRef.current, keyLayouts, {
              enabled: true,
              lang: getActiveLanguage(),
            });
          }
          syncTouchIntelligenceToNative(true);
          return;
        }

        const compactTyping =
          COMPACT_NATIVE_TYPING_ENABLED &&
          (!COMPACT_NATIVE_TYPING_PORTRAIT_ONLY || !landscape) &&
          originReady;
        const nativeFastPathEnabled = nativeFastPathEligible && compactTyping;
        const fastPathSignature = [
          landscape,
          layoutEpoch,
          reactTagsSignature,
          shiftOnRef.current,
          capsLockedRef.current,
          keyPreviewStyle,
          zeroLatencyModeRef.current,
          gamePerformanceModeRef.current,
          compactTyping,
          Math.round(origin.pageX),
          Math.round(origin.pageY),
          getTapMapNativeSignature(),
        ].join('|');

        if (
          nativeFastPathEnabled &&
          fastPathSignature === lastPublishedFastPathSignatureRef.current &&
          nativeFastPathActiveRef.current
        ) {
          return;
        }

        if (layoutEpoch !== lastPublishedFastPathLayoutEpochRef.current) {
          if (!compactTyping && theme.predictiveHitboxesEnabled) {
            updatePredictiveHitboxes(livePrefixRef.current, keyLayouts, {
              enabled: true,
              lang: getActiveLanguage(),
            });
          }
          lastPublishedFastPathLayoutEpochRef.current = layoutEpoch;
        }
        const touchIntelligence = compactTyping
          ? {
              enabled: false,
              previousKeyLetter: null,
              wordPrefix: '',
              lastTapX: 0,
              lastTapY: 0,
              lastTapAtMs: 0,
              predictiveNeutralMode: true,
              topPredictedLetter: null,
              topExpansionKeyId: null,
              keyExpansions: [] as ReturnType<
                typeof serializeKeyExpansionsForNative
              >,
            }
          : getTouchIntelligenceNativeConfig();
        if (landscape && nativeFastPathEnabled) {
          recordCompactTypingFastPathPublish();
        }
        if (!nativeFastPathEnabled) {
          nativeFastPathActiveRef.current = false;
          setCompactTypingNativeActive(false);
          setCompactNativeTypingActive(false);
          keyboardBridge.setNativeKeyFastPathConfig(
            JSON.stringify({enabled: false}),
          );
          lastPublishedLandscapeRef.current = landscape;
          lastPublishedReactTagsSignatureRef.current = reactTagsSignature;
          lastPublishedFastPathLayoutEpochRef.current = layoutEpoch;
          lastPublishedFastPathSignatureRef.current = '';
          if (theme.predictiveHitboxesEnabled) {
            updatePredictiveHitboxes(livePrefixRef.current, keyLayouts, {
              enabled: true,
              lang: getActiveLanguage(),
            });
          }
          syncTouchIntelligenceToNative(true);
          return;
        }

        keyboardBridge.setNativeKeyFastPathConfig(
          JSON.stringify({
            enabled: true,
            commitOnDown: true,
            compactTyping,
            shiftEditorShortcuts:
              gestureSettingsRef.current.shiftEditorShortcuts,
            shiftEditorHeld: shiftEditorHeldRef.current,
            shiftOn: shiftOnRef.current,
            capsLocked: capsLockedRef.current,
            zeroLatency: zeroLatencyModeRef.current,
            gamePerformance: gamePerformanceModeRef.current,
            areaPageX: origin.pageX,
            areaPageY: origin.pageY,
            hitSlopHorizontal: theme.keyHitSlop.horizontal,
            hitSlopVertical: theme.keyHitSlop.vertical,
            previewPopupEnabled,
            previewPressedEnabled,
            previewDoodleEnabled,
            layout,
            tapMap: serializeTapMapOffsetsForNative(),
            touchIntelligence,
            keyExpansions: touchIntelligence.keyExpansions,
            keys: keyLayouts.map(
              ({id, keyDef, x, y, width, height, centerX, centerY}) => ({
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
              }),
            ),
          }),
        );
        if (!autoShiftConsumedMidWordRef.current) {
          syncNativeFastPathCaseState();
        }
        keyboardBridge.syncCompactTypingPrefix(livePrefixRef.current);
        nativeFastPathActiveRef.current = true;
        setCompactTypingNativeActive(true);
        setCompactNativeTypingActive(true);
        lastPublishedLandscapeRef.current = landscape;
        lastPublishedReactTagsSignatureRef.current = reactTagsSignature;
        lastPublishedFastPathSignatureRef.current = fastPathSignature;
        },
        {originRefOnly: true},
      );
    };

    let publishDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePublishConfig = () => {
      if (publishDebounceTimer != null) {
        return;
      }
      publishDebounceTimer = setTimeout(() => {
        publishDebounceTimer = null;
        if (publishRaf != null) {
          cancelAnimationFrame(publishRaf);
        }
        publishRaf = requestAnimationFrame(() => {
          publishRaf = null;
          publishConfig();
        });
      }, 32);
    };

    const shownSubscription = DeviceEventEmitter.addListener('keyboardShown', () => {
      layoutContext.refreshAreaBounds();
      schedulePublishConfig();
    });

    schedulePublishConfig();
    const unsubscribeTags = subscribeKeyReactTags(schedulePublishConfig);
    const unsubscribeTapMap = subscribeTapMapChanges(schedulePublishConfig);

    return () => {
      cancelled = true;
      shownSubscription.remove();
      if (publishDebounceTimer != null) {
        clearTimeout(publishDebounceTimer);
      }
      if (publishRaf != null) {
        cancelAnimationFrame(publishRaf);
      }
      unsubscribeTags();
      unsubscribeTapMap();
    };
  }, [
    layout,
    layoutContext?.layoutEpoch,
    layoutContext?.areaBounds.width,
    layoutContext?.areaBounds.height,
    mode.type,
    nativeFastPathEligible,
    gestureEnabled,
    gestureSettings.shiftEditorShortcuts,
    shiftEditorHeld,
    theme.keyHitSlop.horizontal,
    theme.keyHitSlop.vertical,
    theme.predictiveHitboxesEnabled,
    theme.letterLayoutId,
    theme.isLandscape,
    keyPreviewStyle,
    syncNativeFastPathCaseState,
    syncNativeFastPathPreviewChrome,
    syncTouchIntelligenceToNative,
  ]);

  useEffect(() => {
    setZeroLatencyRuntimeActive(false);
    return () => {
      zeroLatencyModeRef.current = false;
      setZeroLatencyRuntimeActive(false);
      keyboardBridge.setNativeZeroLatencyMode(false);
    lastPublishedFastPathSignatureRef.current = '';
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
    if (zeroLatencyModeRef.current) {
      syncTouchIntelligenceToNative();
    }
    zeroLatencyModeRef.current = false;
    setZeroLatencyRuntimeActive(false);
    keyboardBridge.setNativeZeroLatencyMode(false);
    lastPublishedFastPathSignatureRef.current = '';
    setZeroLatencyMode(false);
  }, [mode.type, syncTouchIntelligenceToNative]);

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
        openClipboard();
      },
      onCommaLauncherDisarm: () => {
        setCommaLauncherActive(false);
        void setCommaLauncherArmed(false);
      },
      periodRewrite:
        !zeroLatencyMode &&
        theme.design !== 'apple' &&
        gestureSettings.commaLauncher,
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
      shiftEditorShortcuts: gestureSettings.shiftEditorShortcuts,
      onShiftEditorPressIn: handleShiftEditorPressIn,
      onShiftEditorPressOut: handleShiftEditorPressOut,
    };
  }, [
    clearSuggestionBarForPrefix,
    commaLauncherActive,
    gestureSettings,
    openClipboard,
    handleShiftEditorPressIn,
    handleShiftEditorPressOut,
    keyGesturesActive,
    layout,
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

  const handleAutocorrectIntensityChange = useCallback(
    (intensity: AutocorrectSettings['intensity']) => {
      void setAutocorrectIntensity(intensity).then(() => {
        void reloadAutocorrect();
        void refreshSuggestions();
      });
    },
    [reloadAutocorrect, refreshSuggestions],
  );

  const isNumpadLayout = layout === 'numpad';
  const useCompactLayout = isNumpadLayout || theme.isLandscape;
  /** Native IME skips RN dispatch on compact hits; gate passthrough until native confirms. */
  const compactTypingNativeActiveForKeys =
    compactTypingNativeActive &&
    (Platform.OS !== 'android' ||
      keyboardBridge.isCompactTypingConsumingTouches());
  const frostedKeyboardVisible =
    theme.frostedGlass &&
    showKeys &&
    !shouldSkipFrostedKeyboardEffects() &&
    (!isEmojiMode || isGifSearchMode || isEmojiSearchMode || isSfxSearchMode);
  const frostedKeyboardLayout = frostedKeyboardBackdropLayout(
    effectiveLetterKeyHeight ?? theme.keyHeight,
    theme.keyRowMargin,
    theme.imeStripClearance,
    showEmojiPluginPanel ? 1 : 0,
  );

  return (
    <View
      style={[
        styles.container,
        useCompactLayout && styles.containerCompact,
        theme.isLandscape &&
        theme.landscapeFloatingKeyboardEnabled
          ? styles.containerFloatingLandscape
          : null,
      ]}>
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
          <TypingSuggestionBarHost
          swipePreview={swipePreview}
          onSelect={handleSuggestionSelect}
          clipboardPasteSuggestion={clipboardPasteSuggestion}
          onClipboardPasteSelect={handleClipboardPasteSelect}
          onClipboardPasteDismiss={handleClipboardPasteDismiss}
          aiAutocorrectSuggestion={aiAutocorrectSuggestion}
          onAiAutocorrectSelect={handleAiAutocorrectSelect}
          isAiAutocorrectProcessing={isAiAutocorrectProcessing}
          isSuggestionBootstrapLoading={
            suggestionEngineLoading &&
            mode.type === 'typing' &&
            layout === 'letters' &&
            !zeroLatencyMode
          }
          onEssentialSelect={handleEssentialSuggestionSelect}
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
                      if (emojiSearchActive && emojiSearchQuery.trim().length > 0) {
                        setEmojiSearchActive(false);
                        return;
                      }
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
          onVoicePress={() => {
            void toggleListening();
          }}
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
            isCalculatorMode
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
            showUpsell &&
              mode.type !== 'items-menu' &&
              mode.type !== 'translate' &&
              mode.type !== 'emoji' &&
              styles.keysPaddingOverlayHost,
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

          {showEmojiPluginPanel ? (
            <EmojiPanel
              panelTab={emojiPanelTab}
              emojiSubcategory={normalizeEmojiSubcategoryId(emojiSubcategory)}
              onEmojiSubcategorySelect={id =>
                setEmojiSubcategory(normalizeEmojiSubcategoryId(id))
              }
              emojiSearchQuery={emojiSearchQuery}
              emojiSearchActive={emojiSearchActive}
              panelHeight={emojiPanelScrollHeight}
              contextSnippet={getEffectiveEditorContext('')}
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
              stickersLocked={stickersLocked}
              sfxLocked={sfxLocked}
              showUpsell={showUpsell}
              onLockedPress={() => setShowUpsell(true)}
              onDismissUpsell={() => setShowUpsell(false)}
            />
          ) : null}

          {mode.type === 'items-menu' ? (
            <ItemsMenuPanel
              canOpenPlugin={canUsePluginMenuItem}
              showUpsell={showUpsell}
              onDismissUpsell={() => setShowUpsell(false)}
              onLockedPluginPress={() => setShowUpsell(true)}
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
            <TranslatePanel
              locked={!canUseFeature('translate')}
              showUpsell={showUpsell}
              onLockedPress={() => setShowUpsell(true)}
              onDismissUpsell={() => setShowUpsell(false)}
            />
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
              onToggle={handleGestureToggle}
            />
          ) : null}

          {mode.type === 'autocorrect' ? (
            <AutocorrectPanel
              settings={autocorrectSettings}
              onToggleEnabled={handleAutocorrectToggle}
              onToggleAutoApply={handleAutoApplyToggle}
              onToggleAiAutoCorrect={handleAiAutoCorrectToggle}
              onIntensityChange={handleAutocorrectIntensityChange}
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
              isPremium={isPremium}
              onSelect={essential => {
                keyboardBridge.insertText(
                  expandEssentialForInsert(essential),
                );
                closeItemsFlow();
              }}
              onDelete={async essential => {
                await deleteEssential(essential.id);
                reloadEssentials();
              }}
            />
          ) : null}

          {showEmojiPluginPanel ? (
            <EmojiBottomRow
              panelTab={emojiPanelTab}
              onPanelTabSelect={tab => {
                setEmojiPanelTab(tab);
                setShowUpsell(false);
              }}
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
                    isShiftEditorHeld={shiftEditorHeld}
                    onKeyPress={handleKeyPress}
                    onMultiTouchKeyCommit={handleMultiTouchKeyCommit}
                    isNativeTypingCommitActive={isNativeTypingCommitActive}
                    onNativeFastPathLetterCommit={handleNativeFastPathLetterCommit}
                    onNativeFastPathShiftConsumed={syncNativeShiftConsumed}
                    shouldConsumeShiftForCommit={shouldConsumeShiftForCommit}
                    onSpaceLongPress={
                      mode.type === 'typing'
                        ? handleSpaceLongPressZeroLatency
                        : undefined
                    }
                    keyGestures={
                      isGifSearchMode || isEmojiSearchMode || isSfxSearchMode
                        ? undefined
                        : keyGestures
                    }
                    multiTouchEnabled={
                      mode.type === 'typing' ||
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
                    compactTypingNativeActive={compactTypingNativeActiveForKeys}
                  />
            </View>
          ) : null}
          {showUpsell &&
          mode.type !== 'items-menu' &&
          mode.type !== 'translate' &&
          mode.type !== 'emoji' ? (
            <PremiumUpsellSheet
              placement="keyboard"
              onDismiss={() => setShowUpsell(false)}
            />
          ) : null}
        </View>
        </GestureTypingLayer>
    </View>
  );
}


export default function KeyboardApp() {
  const [deviceLandscape, setDeviceLandscape] = useState(() =>
    keyboardBridge.isDeviceLandscapeSync(),
  );
  const [fontsLoaded] = useFonts({
    Geist: require('../../assets/Geist-VariableFont_wght.ttf'),
    Chicago: require('../../assets/Chicago.ttf'),
    Ndot: require('../../assets/Ndot-55.otf'),
    Pixel: require('../../assets/pixel.ttf'),
  });
  const [colorScheme, setColorScheme] =
    useState<KeyboardColorScheme>('auto');
  const [keyboardDesign, setKeyboardDesign] =
    useState<KeyboardDesign>('typebase');
  const [customThemeJson, setCustomThemeJson] = useState<string>('{}');
  const [layoutSettings, setLayoutSettings] = useState<KeyboardLayoutSettings>(
    DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  );
  const [controllerConnected, setControllerConnected] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const systemColorScheme = useColorScheme();
  const [customUserFontFamily, setCustomUserFontFamily] = useState<string | null>(null);

  const resolvedColorScheme = useMemo(
    () => resolveKeyboardColorScheme(colorScheme, systemColorScheme),
    [colorScheme, systemColorScheme],
  );

  const effectiveLayoutSettings = useMemo(
    () => layoutSettingsForOrientation(layoutSettings, deviceLandscape),
    [deviceLandscape, layoutSettings],
  );

  useEffect(() => {
    const orientationSubscription = DeviceEventEmitter.addListener(
      'keyboardOrientationChange',
      (landscape: boolean) => {
        setDeviceLandscape(landscape === true);
      },
    );
    const shownSubscription = DeviceEventEmitter.addListener('keyboardShown', () => {
      if (Platform.OS !== 'android') {
        return;
      }
      setDeviceLandscape(keyboardBridge.isDeviceLandscapeSync());
      keyboardBridge.syncFloatingKeyboardForOrientation();
    });
    return () => {
      orientationSubscription.remove();
      shownSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    keyboardBridge.syncFloatingKeyboardForOrientation();
  }, [deviceLandscape, layoutSettings.landscapeFloatingKeyboardEnabled]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const dragSubscription = DeviceEventEmitter.addListener(
      'keyboardFloatingDrag',
      (active: boolean) => {
        const dragging = active === true;
        setFloatingKeyboardDragActive(dragging);
        if (dragging) {
          hideAllKeyPreviews();
        }
      },
    );
    return () => {
      dragSubscription.remove();
      setFloatingKeyboardDragActive(false);
    };
  }, []);

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
      scheme={resolvedColorScheme}
      design={keyboardDesign}
      customThemeJson={customThemeJson}
      layoutSettings={effectiveLayoutSettings}
      customFontLoaded={fontsLoaded}
      isLandscape={deviceLandscape}
      customUserFontFamily={customUserFontFamily}
    >
      <KeyLayoutProvider layoutSettings={effectiveLayoutSettings}>
        <KeyboardBody
          controllerConnected={controllerConnected}
          controllerSettings={layoutSettings.controller}
          keyPreviewStyle={layoutSettings.keyPreviewStyle}
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
    keysPaddingOverlayHost: {
      position: 'relative',
    },
    numpadKeysPadding: {
      paddingTop: theme.numpadKeysPaddingTop,
    },
    containerCompact: {
      justifyContent: 'flex-start',
    },
    containerFloatingLandscape: {
      paddingBottom: theme.floatingKeyboardCardInsetBottom,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      overflow: 'visible',
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
