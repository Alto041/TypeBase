import React, {Fragment, memo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import AddIcon from '../../../assets/add.svg';
import InsertIcon from '../../../assets/insert.svg';
import BackIcon from '../../../assets/back.svg';
import CheckIcon from '../../../assets/check.svg';
import EmojiIcon from '../../../assets/emoji.svg';
import ItemsIcon from '../../../assets/items.svg';
import UndoIcon from '../../../assets/undo.svg';
import RedoIcon from '../../../assets/redo.svg';
import ClipboardIcon from '../../../assets/plugins/clipboard.svg';
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

export type EssentialSuggestion = {
  keyword: string;
  value: string;
};

const MAX_SUGGESTION_CHIPS = 3;

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
    chips.push({
      kind: 'word',
      text: word.includes(' ') ? word : applyCaseToWord(word, prefix),
    });
  }

  return chips.slice(0, MAX_SUGGESTION_CHIPS);
}

type EssentialsFormBarState = {
  focusField: 'keyword' | 'value';
  keyword: string;
  value: string;
  canConfirm: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

type SuggestionBarProps = {
  suggestions: string[];
  prefix: string;
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
  /** Show back chevron instead of the plugins icon (panels + essentials form). */
  leadingBack?: boolean;
  trailingAction?: {
    onPress: () => void;
    icon?: 'add' | 'insert';
  };
  showUndoRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

function SuggestionBarComponent({
  suggestions,
  prefix,
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
  leadingBack = false,
  trailingAction,
  showUndoRedo = false,
  onUndo,
  onRedo,
}: SuggestionBarProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createSuggestionBarStyles);

  if (!visible) {
    return null;
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
  const showWordSuggestions = wordSuggestionChips.length > 0;
  const hasClipboardPaste =
    !isFormMode &&
    !centerTitle &&
    Boolean(clipboardPasteSuggestion) &&
    !hasEssentials &&
    !showPartial;
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

  return (
    <View style={styles.container}>
      <View style={styles.toolbarLeading}>
        <Pressable
          onPressIn={() => {
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
        ) : showPartial ? (
          <VoiceTranscriptPreview transcript={partialTranscript} />
        ) : hasClipboardPaste && clipboardPasteSuggestion ? (
          <View style={styles.clipboardPasteContainer}>
            <Pressable
              onPressIn={() => {
                triggerKeyHaptic();
                onClipboardPasteSelect?.();
              }}
              style={({pressed}) => [
                styles.clipboardPastePill,
                pressed && styles.clipboardPastePillPressed,
              ]}>
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
            </Pressable>
          </View>
        ) : hasEssentials ? (
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
                    {chip.text}
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
    fontFamily: theme.fontFamily,
    fontWeight: '600',
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
    fontFamily: theme.fontFamily,
    fontWeight: '600',
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
    fontFamily: theme.fontFamily,
    fontWeight: '600',
  },
  formText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 16,
    fontFamily: theme.fontFamily,
    fontWeight: '500',
  },
  formPlaceholder: {
    color: theme.spaceLabel,
    fontWeight: '400',
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
    fontFamily: theme.fontFamily,
    fontWeight: '500',
  },
  typedKeepSuggestion: {
    flex: 1.1,
  },
  typedKeepSuggestionText: {
    color: theme.label,
    fontSize: 17,
    fontFamily: theme.fontFamily,
    fontWeight: '600',
  },
  autocorrectSuggestion: {
    paddingHorizontal: 4,
  },
  essentialKeyword: {
    color: theme.essentialsAccent,
    fontSize: 14,
    fontFamily: theme.fontFamily,
    fontWeight: '600',
  },
  essentialValue: {
    color: theme.spaceLabel,
    fontSize: 12,
    fontFamily: theme.fontFamily,
  },
  partialContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  partialText: {
    color: theme.spaceLabel,
    fontSize: 17,
    fontFamily: theme.fontFamily,
    fontWeight: '500',
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
  clipboardPastePillPressed: {
    backgroundColor: theme.letterKeyPressed,
  },
  clipboardPasteText: {
    flexShrink: 1,
    color: theme.label,
    fontSize: 15,
    fontFamily: theme.fontFamily,
    fontWeight: '500',
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
