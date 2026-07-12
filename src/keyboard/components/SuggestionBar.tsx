import React, {Fragment, memo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import AddIcon from '../../../assets/add.svg';
import InsertIcon from '../../../assets/insert.svg';
import BackIcon from '../../../assets/back.svg';
import CheckIcon from '../../../assets/check.svg';
import EmojiIcon from '../../../assets/emoji.svg';
import ItemsIcon from '../../../assets/items.svg';
import AppleComputerLogo from '../../../assets/Apple_Computer_Logo_rainbow.svg';
import UndoIcon from '../../../assets/undo.svg';
import RedoIcon from '../../../assets/redo.svg';
import ClipboardIcon from '../../../assets/plugins/clipboard.svg';
import SearchIcon from '../../../assets/enter.svg';
import TranslateIcon from '../../../assets/plugins/translate.svg';
import {VoiceConnectingDots} from './VoiceConnectingDots';
import {VoiceEqualizerIcon} from './VoiceEqualizerIcon';
import {VoiceTranscriptPreview} from './VoiceTranscriptPreview';
import {clipboardPastePreviewText} from '../clipboard/clipboardPasteSuggestion';
import type {ClipboardPasteSuggestion} from '../clipboard/clipboardPasteSuggestion';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {applyCaseToWord} from '../suggestions/wordSuggestions';
import type {KeyboardTheme} from '../theme';
import {keyboardKeyChromeStyle, keyboardTypefaceStyle} from '../theme';
import {MacintoshKeyBevels} from './MacintoshKeyBevels';

export type EssentialSuggestion = {
  keyword: string;
  value: string;
};

export type AiAutocorrectSuggestionBarItem = {
  original: string;
  correction: string;
};

const MAX_SUGGESTION_CHIPS = 3;
const TWO_CHIP_WORD_LENGTH = 13;
const ONE_CHIP_WORD_LENGTH = 20;
const THREE_CHIP_TEXT_LENGTH = 12;
const TWO_CHIP_TEXT_LENGTH = 18;
const ONE_CHIP_TEXT_LENGTH = 28;

type WordSuggestionChip =
  | {kind: 'keep'; text: string}
  | {kind: 'autocorrect'; text: string}
  | {kind: 'word'; text: string};

function buildWordSuggestionChips(
  prefix: string,
  typedKeepSuggestion: string | null,
  autocorrectPreview: string | null,
  suggestions: string[],
): WordSuggestionChip[] {
  const chips: WordSuggestionChip[] = [];

  if (typedKeepSuggestion && prefix.length > 0) {
    chips.push({kind: 'keep', text: typedKeepSuggestion});
  }
  if (autocorrectPreview && prefix.length > 0) {
    chips.push({kind: 'autocorrect', text: autocorrectPreview});
  }
  for (const word of suggestions) {
    if (!word) {
      continue;
    }
    chips.push({
      kind: 'word',
      text: word.includes(' ') ? word : applyCaseToWord(word, prefix),
    });
  }

  const longestChipLength = chips.reduce(
    (longest, chip) => Math.max(longest, chip.text.length),
    0,
  );
  const chipLimit =
    longestChipLength >= ONE_CHIP_WORD_LENGTH
      ? 1
      : longestChipLength >= TWO_CHIP_WORD_LENGTH
        ? 2
        : MAX_SUGGESTION_CHIPS;

  return chips.slice(0, chipLimit);
}

function middleTruncateSuggestion(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const available = Math.max(1, maxLength - 1);
  const headLength = Math.ceil(available * 0.62);
  const tailLength = Math.max(0, available - headLength);
  return `${text.slice(0, headLength)}…${
    tailLength > 0 ? text.slice(-tailLength) : ''
  }`;
}

function suggestionDisplayMaxLength(chipCount: number): number {
  if (chipCount <= 1) {
    return ONE_CHIP_TEXT_LENGTH;
  }
  if (chipCount === 2) {
    return TWO_CHIP_TEXT_LENGTH;
  }
  return THREE_CHIP_TEXT_LENGTH;
}

type EssentialsFormBarState = {
  focusField: 'keyword' | 'value';
  keyword: string;
  value: string;
  canConfirm: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

type PanelSearchBarState = {
  visible: boolean;
  active: boolean;
  query: string;
  placeholder: string;
  onActivate: () => void;
  onClear: () => void;
};

type SuggestionBarProps = {
  suggestions: string[];
  prefix: string;
  swipePreview?: string | null;
  autocorrectPreview?: string | null;
  /** What you typed — tap to keep it and add to adaptive dictionary. */
  typedKeepSuggestion?: string | null;
  onSelect: (word: string) => void;
  essentialSuggestions?: EssentialSuggestion[];
  onEssentialSelect?: (item: EssentialSuggestion) => void;
  essentialsForm?: EssentialsFormBarState;
  visible?: boolean;
  isListening?: boolean;
  isVoiceConnecting?: boolean;
  isVoiceProcessing?: boolean;
  partialTranscript?: string;
  onItemsPress?: () => void;
  onTranslatePress?: () => void;
  onEmojiPress?: () => void;
  onVoicePress?: () => void;
  itemsSelected?: boolean;
  translateSelected?: boolean;
  emojiSelected?: boolean;
  centerTitle?: string;
  clipboardPasteSuggestion?: ClipboardPasteSuggestion | null;
  onClipboardPasteSelect?: () => void;
  aiAutocorrectSuggestion?: AiAutocorrectSuggestionBarItem | null;
  onAiAutocorrectSelect?: () => void;
  isAiAutocorrectProcessing?: boolean;
  /** Show back chevron instead of the plugins icon (panels + essentials form). */
  leadingBack?: boolean;
  trailingAction?: {
    onPress: () => void;
    icon?: 'add' | 'insert';
  };
  showUndoRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  gifSearch?: PanelSearchBarState;
  panelSearch?: PanelSearchBarState;
};

function SuggestionBarComponent({
  suggestions,
  prefix,
  swipePreview = null,
  autocorrectPreview = null,
  typedKeepSuggestion = null,
  onSelect,
  essentialSuggestions = [],
  onEssentialSelect,
  essentialsForm,
  visible = true,
  isListening = false,
  isVoiceConnecting = false,
  isVoiceProcessing = false,
  partialTranscript = '',
  onItemsPress,
  onTranslatePress,
  onEmojiPress,
  onVoicePress,
  itemsSelected = false,
  translateSelected = false,
  emojiSelected = false,
  centerTitle,
  clipboardPasteSuggestion = null,
  onClipboardPasteSelect,
  aiAutocorrectSuggestion = null,
  onAiAutocorrectSelect,
  isAiAutocorrectProcessing = false,
  leadingBack = false,
  trailingAction,
  showUndoRedo = false,
  onUndo,
  onRedo,
  gifSearch,
  panelSearch: panelSearchProp,
}: SuggestionBarProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createSuggestionBarStyles);
  const panelSearch = panelSearchProp ?? gifSearch;

  if (!visible) {
    return null;
  }

  if (panelSearch?.visible) {
    return (
      <View style={[styles.container, styles.panelSearchContainer]}>
        {panelSearch.active ? (
          <View style={styles.gifSearchOnly}>
            <View style={styles.gifSearchField}>
              {panelSearch.query ? (
                <>
                  <Text
                    style={styles.gifSearchOnlyText}
                    numberOfLines={1}
                    ellipsizeMode="head">
                    {panelSearch.query}
                  </Text>
                  <View style={styles.cursor} />
                </>
              ) : (
                <>
                  <View style={styles.cursor} />
                  <Text
                    style={[styles.gifSearchOnlyText, styles.gifSearchPlaceholder]}
                    numberOfLines={1}>
                    {panelSearch.placeholder}
                  </Text>
                </>
              )}
            </View>
            {panelSearch.query ? (
              <Pressable
                onPressIn={() => {
                  triggerKeyHaptic();
                  panelSearch.onClear();
                }}
                hitSlop={6}
                style={({pressed}) => [
                  styles.gifSearchClear,
                  pressed && styles.toolbarButtonPressed,
                ]}>
                <Text style={styles.gifSearchClearLabel}>✕</Text>
              </Pressable>
            ) : (
              <SearchIcon width={18} height={18} color={theme.iconMuted} />
            )}
          </View>
        ) : (
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              panelSearch.onActivate();
            }}
            style={({pressed}) => [
              styles.gifSearchOnly,
              pressed && styles.gifSearchTriggerPressed,
            ]}>
            <Text
              style={[styles.gifSearchPlaceholder, {flex: 1}]}
              numberOfLines={1}>
              {panelSearch.placeholder}
            </Text>
            <SearchIcon width={18} height={18} color={theme.iconMuted} />
          </Pressable>
        )}
      </View>
    );
  }

  const isFormMode = Boolean(essentialsForm);
  const showLeadingBack = isFormMode || leadingBack;
  const showVoiceProcessing = !isFormMode && isVoiceProcessing;
  const showPartial =
    !isFormMode &&
    isListening &&
    !isVoiceProcessing &&
    partialTranscript.length > 0;
  const hasEssentials = !isFormMode && essentialSuggestions.length > 0;
  const wordSuggestionChips = isFormMode
    ? []
    : buildWordSuggestionChips(
        prefix,
        typedKeepSuggestion,
        autocorrectPreview,
        suggestions,
      );
  const showSwipePreview =
    !isFormMode &&
    !centerTitle &&
    Boolean(swipePreview) &&
    !showPartial &&
    !showVoiceProcessing &&
    !isAiAutocorrectProcessing;
  const showEssentials = hasEssentials && !showSwipePreview;
  const showWordSuggestions = wordSuggestionChips.length > 0 && !showSwipePreview;
  const wordSuggestionDisplayMax = suggestionDisplayMaxLength(
    wordSuggestionChips.length,
  );
  const hasClipboardPaste =
    !isFormMode &&
    !centerTitle &&
    Boolean(clipboardPasteSuggestion) &&
    !showEssentials &&
    !showPartial;
  const hasAiAutocorrectSuggestion =
    !isFormMode &&
    !centerTitle &&
    Boolean(aiAutocorrectSuggestion) &&
    !showEssentials &&
    !showPartial &&
    !showVoiceProcessing &&
    !isAiAutocorrectProcessing;

  const showAiProcessing =
    !isFormMode &&
    !centerTitle &&
    isAiAutocorrectProcessing &&
    !showVoiceProcessing &&
    !showPartial &&
    !hasAiAutocorrectSuggestion;
  const toolbarIconMuted = theme.icon;
  const toolbarIconActive = theme.icon;
  const toolbarIconSize = 20;
  const itemsIconColor = itemsSelected ? toolbarIconActive : toolbarIconMuted;
  const translateIconColor = translateSelected
    ? toolbarIconActive
    : toolbarIconMuted;
  const emojiIconColor = emojiSelected ? toolbarIconActive : toolbarIconMuted;
  const voiceActive = isListening || isVoiceConnecting;
  const voiceIconColor = voiceActive ? toolbarIconActive : toolbarIconMuted;
  const showUndoRedoButtons = showUndoRedo && !isFormMode && !centerTitle;
  const isMacintosh = theme.design === 'macintosh';

  return (
    <View style={styles.container}>
      <View style={styles.toolbarLeading}>
        <Pressable
          onPress={() => {
            triggerKeyHaptic();
            if (isFormMode) {
              essentialsForm?.onBack();
            } else {
              onItemsPress?.();
            }
          }}
          style={({pressed}) => [
            styles.toolbarButton,
            pressed && styles.toolbarButtonPressed,
          ]}
          hitSlop={6}>
          {showLeadingBack ? (
            <BackIcon width={22} height={14} color={theme.icon} />
          ) : isMacintosh ? (
            <AppleComputerLogo
              width={toolbarIconSize}
              height={toolbarIconSize}
            />
          ) : (
            <ItemsIcon
              width={toolbarIconSize}
              height={toolbarIconSize}
              color={itemsIconColor}
            />
          )}
        </Pressable>

        {!isFormMode ? (
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              onTranslatePress?.();
            }}
            style={({pressed}) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
            ]}
            hitSlop={6}>
            <TranslateIcon
              width={toolbarIconSize}
              height={toolbarIconSize}
              color={translateIconColor}
            />
          </Pressable>
        ) : null}

        {showUndoRedoButtons ? (
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              onUndo?.();
            }}
            style={({pressed}) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
            ]}
            hitSlop={6}>
            <UndoIcon width={22} height={22} color={theme.icon} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.center}>
        {isFormMode && essentialsForm ? (
          <View style={styles.formCenter}>
            <Text style={styles.formLabel}>
              {essentialsForm.focusField === 'keyword' ? 'Keyword' : 'Value'}
            </Text>
            <View style={styles.formRow}>
              {essentialsForm.focusField === 'keyword' ? (
                <Text style={styles.formPrefix}>@@</Text>
              ) : null}
              <Text
                style={[
                  styles.formText,
                  !(essentialsForm.focusField === 'keyword'
                    ? essentialsForm.keyword
                    : essentialsForm.value) && styles.formPlaceholder,
                ]}
                numberOfLines={1}>
                {essentialsForm.focusField === 'keyword'
                  ? essentialsForm.keyword || 'email'
                  : essentialsForm.value || 'Enter value'}
              </Text>
              <View style={styles.cursor} />
            </View>
          </View>
        ) : centerTitle ? null : showVoiceProcessing ? (
          <View style={styles.partialContainer}>
            <Text style={styles.partialText} numberOfLines={1}>
              Polishing…
            </Text>
          </View>
        ) : showAiProcessing ? (
          <View style={styles.aiProcessingContainer}>
            <VoiceConnectingDots size={22} color={theme.spaceLabel} />
          </View>
        ) : showPartial ? (
          <VoiceTranscriptPreview transcript={partialTranscript} />
        ) : showSwipePreview ? (
          <View style={styles.swipePreviewContainer}>
            <Text style={styles.swipePreviewText} numberOfLines={1}>
              {middleTruncateSuggestion(swipePreview ?? '', ONE_CHIP_TEXT_LENGTH)}
            </Text>
          </View>
        ) : hasAiAutocorrectSuggestion && aiAutocorrectSuggestion ? (
          <View style={styles.clipboardPasteContainer}>
            <Pressable
              onPressIn={() => {
                triggerKeyHaptic();
                onAiAutocorrectSelect?.();
              }}
              style={({pressed}) => [
                styles.aiAutocorrectPill,
                pressed && styles.clipboardPastePillPressed,
              ]}>
              <CheckIcon width={15} height={15} color={theme.icon} />
              <Text style={styles.aiAutocorrectText} numberOfLines={1}>
                {middleTruncateSuggestion(
                  aiAutocorrectSuggestion.correction,
                  ONE_CHIP_TEXT_LENGTH,
                )}
              </Text>
            </Pressable>
          </View>
        ) : hasClipboardPaste && clipboardPasteSuggestion ? (
          <View style={styles.clipboardPasteContainer}>
            <Pressable
              onPressIn={() => {
                triggerKeyHaptic();
                onClipboardPasteSelect?.();
              }}
              style={({pressed}) => [
                styles.clipboardPastePill,
                isMacintosh && styles.clipboardPastePillDepth,
                isMacintosh && keyboardKeyChromeStyle(theme, pressed),
                pressed && styles.clipboardPastePillPressed,
              ]}>
              {({pressed}) => (
                <>
                  {isMacintosh ? <MacintoshKeyBevels pressed={pressed} /> : null}
                  <ClipboardIcon
                    width={16}
                    height={16}
                    color={theme.icon}
                  />
                  {clipboardPasteSuggestion.kind === 'image' &&
                  clipboardPasteSuggestion.imageUri ? (
                    <Image
                      source={{uri: clipboardPasteSuggestion.imageUri}}
                      style={styles.clipboardPasteImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.clipboardPasteText} numberOfLines={1}>
                      {clipboardPastePreviewText(
                        clipboardPasteSuggestion.text ?? '',
                      )}
                    </Text>
                  )}
                </>
              )}
            </Pressable>
          </View>
        ) : showEssentials ? (
          <View style={styles.row}>
            {essentialSuggestions.map((item, index) => (
              <Fragment key={item.keyword}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPressIn={() => {
                    triggerKeyHaptic();
                    onEssentialSelect?.(item);
                  }}
                  style={({pressed}) => [
                    styles.suggestion,
                    pressed && styles.suggestionPressed,
                  ]}>
                  <Text style={styles.essentialKeyword} numberOfLines={1}>
                    @@{item.keyword}
                  </Text>
                  <Text style={styles.essentialValue} numberOfLines={1}>
                    {item.value}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </View>
        ) : showWordSuggestions ? (
          <View style={styles.row}>
            {wordSuggestionChips.map((chip, index) => (
              <Fragment key={`${chip.kind}:${chip.text}`}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPressIn={() => {
                    triggerKeyHaptic();
                    onSelect(chip.text);
                  }}
                  style={({pressed}) => [
                    styles.suggestion,
                    chip.kind === 'keep' && styles.typedKeepSuggestion,
                    chip.kind === 'autocorrect' && styles.autocorrectSuggestion,
                    pressed && styles.suggestionPressed,
                  ]}>
                  <Text
                    style={
                      chip.kind === 'keep'
                        ? styles.typedKeepSuggestionText
                        : styles.suggestionText
                    }
                    numberOfLines={1}>
                    {middleTruncateSuggestion(
                      chip.text ?? '',
                      wordSuggestionDisplayMax,
                    )}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </View>
        ) : null}
      </View>

      {isFormMode && essentialsForm ? (
        <Pressable
          onPressIn={() => {
            if (!essentialsForm.canConfirm) {
              return;
            }
            triggerKeyHaptic();
            essentialsForm.onConfirm();
          }}
          style={({pressed}) => [
            styles.toolbarButton,
            !essentialsForm.canConfirm && styles.confirmButtonDisabled,
            pressed && essentialsForm.canConfirm && styles.toolbarButtonPressed,
          ]}
          hitSlop={6}>
          <CheckIcon width={24} height={24} color={theme.icon} />
        </Pressable>
      ) : trailingAction ? (
        <Pressable
          onPressIn={() => {
            triggerKeyHaptic();
            trailingAction.onPress();
          }}
          style={({pressed}) => [
            styles.toolbarButton,
            pressed && styles.toolbarButtonPressed,
          ]}
          hitSlop={6}>
          {trailingAction.icon === 'insert' ? (
            <InsertIcon
              width={toolbarIconSize}
              height={toolbarIconSize}
              color={itemsIconColor}
            />
          ) : (
            <AddIcon
              width={toolbarIconSize}
              height={toolbarIconSize}
              color={theme.icon}
            />
          )}
        </Pressable>
      ) : (
        <View style={styles.toolbarTrailing}>
          {showUndoRedoButtons ? (
            <Pressable
              onPressIn={() => {
                triggerKeyHaptic();
                onRedo?.();
              }}
              style={({pressed}) => [
                styles.toolbarButton,
                pressed && styles.toolbarButtonPressed,
              ]}
              hitSlop={6}>
              <RedoIcon width={22} height={22} color={theme.icon} />
            </Pressable>
          ) : null}
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              onEmojiPress?.();
            }}
            style={({pressed}) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
            ]}
            hitSlop={6}>
            <EmojiIcon
              width={toolbarIconSize}
              height={toolbarIconSize}
              color={emojiIconColor}
            />
          </Pressable>
          <Pressable
            onPressIn={() => {
              triggerKeyHaptic();
              onVoicePress?.();
            }}
            style={({pressed}) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
            ]}
            hitSlop={6}>
            {isVoiceConnecting ? (
              <VoiceConnectingDots
                size={toolbarIconSize}
                color={voiceIconColor}
              />
            ) : (
              <VoiceEqualizerIcon
                active={isListening}
                size={toolbarIconSize}
                color={voiceIconColor}
              />
            )}
          </Pressable>
        </View>
      )}
      {centerTitle ? (
        <View style={styles.centerTitleOverlay} pointerEvents="none">
          <Text style={styles.centerTitle}>{centerTitle.toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createSuggestionBarStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
  container: {
    minHeight: theme.suggestionBarHeight,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  panelSearchContainer: {
    paddingHorizontal: 0,
  },
  toolbarLeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  toolbarButtonPressed: {
    opacity: 0.8,
  },
  confirmButtonDisabled: {
    opacity: 0.35,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.suggestionBarHeight,
  },
  centerTitleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: {
    color: theme.spaceLabel,
    fontSize: 12,
    ...keyboardTypefaceStyle(theme, '600'),
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  formCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  formLabel: {
    color: theme.spaceLabel,
    fontSize: 10,
    ...keyboardTypefaceStyle(theme, '600'),
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  formPrefix: {
    color: theme.essentialsAccent,
    fontSize: 16,
    ...keyboardTypefaceStyle(theme, '600'),
  },
  formText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 16,
    ...keyboardTypefaceStyle(theme, '500'),
  },
  formPlaceholder: {
    color: theme.spaceLabel,
    fontWeight: '400',
  },
  gifSearchTrigger: {
    flex: 1,
    minHeight: 36,
    marginHorizontal: 8,
    borderRadius: theme.keyRadius,
    backgroundColor: theme.letterKey,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  gifSearchTriggerPressed: {
    opacity: 0.85,
  },
  gifSearchPlaceholder: {
    color: theme.iconMuted,
    fontSize: 14,
    ...keyboardTypefaceStyle(theme),
  },
  gifSearchClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.modifierKey,
    marginLeft: 6,
  },
  gifSearchClearLabel: {
    color: theme.iconMuted,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '600',
  },
  gifSearchOnly: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    marginHorizontal: 0,
    marginTop: 6,
    borderRadius: theme.keyRadius,
    backgroundColor: theme.letterKey,
    paddingHorizontal: 12,
    gap: 6,
  },
  gifSearchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 6,
  },
  gifSearchOnlyText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 16,
    ...keyboardTypefaceStyle(theme, '500'),
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: theme.essentialsAccent,
    borderRadius: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.suggestionBarHeight,
  },
  suggestion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 1,
  },
  suggestionPressed: {
    backgroundColor: theme.letterKeyPressed,
  },
  suggestionText: {
    color: theme.label,
    fontSize: 17,
    ...keyboardTypefaceStyle(theme, '500'),
  },
  typedKeepSuggestion: {
    flex: 1.1,
  },
  typedKeepSuggestionText: {
    color: theme.label,
    fontSize: 17,
    ...keyboardTypefaceStyle(theme, '600'),
  },
  autocorrectSuggestion: {
    paddingHorizontal: 4,
  },
  essentialKeyword: {
    color: theme.essentialsAccent,
    fontSize: 14,
    ...keyboardTypefaceStyle(theme, '600'),
  },
  essentialValue: {
    color: theme.spaceLabel,
    fontSize: 12,
    ...keyboardTypefaceStyle(theme),
  },
  partialContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  swipePreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  swipePreviewText: {
    color: theme.label,
    fontSize: 20,
    ...keyboardTypefaceStyle(theme, '600'),
    textAlign: 'center',
  },
  partialText: {
    color: theme.spaceLabel,
    fontSize: 17,
    ...keyboardTypefaceStyle(theme, '500'),
    textAlign: 'right',
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: theme.suggestionDivider,
    borderRadius: 999,
  },
  clipboardPasteContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.suggestionBarHeight,
    paddingHorizontal: 4,
  },
  clipboardPastePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.letterKey,
    maxWidth: '88%',
  },
  clipboardPastePillDepth: {
    borderRadius: theme.keyRadius,
  },
  clipboardPastePillPressed: {
    backgroundColor: theme.letterKeyPressed,
  },
  clipboardPasteText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 15,
    ...keyboardTypefaceStyle(theme, '500'),
  },
  aiAutocorrectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.pluginCard,
    maxWidth: '92%',
  },
  aiAutocorrectText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 15,
    ...keyboardTypefaceStyle(theme, '600'),
  },
  aiProcessingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  clipboardPasteImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.modifierKey,
  },
  });
}

export const SuggestionBar = memo(SuggestionBarComponent);
