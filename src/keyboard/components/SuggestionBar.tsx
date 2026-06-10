import React, {Fragment} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import AddIcon from '../../../assets/add.svg';
import InsertIcon from '../../../assets/insert.svg';
import BackIcon from '../../../assets/back.svg';
import CheckIcon from '../../../assets/check.svg';
import EmojiIcon from '../../../assets/emoji.svg';
import ItemsIcon from '../../../assets/items.svg';
import {VoiceEqualizerIcon} from './VoiceEqualizerIcon';
import {triggerKeyHaptic} from '../haptics';
import {applyCaseToWord} from '../suggestions/wordSuggestions';
import {keyboardTheme} from '../theme';

export type EssentialSuggestion = {
  keyword: string;
  value: string;
};

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
  onSelect: (word: string) => void;
  essentialSuggestions?: EssentialSuggestion[];
  onEssentialSelect?: (item: EssentialSuggestion) => void;
  essentialsForm?: EssentialsFormBarState;
  visible?: boolean;
  isListening?: boolean;
  partialTranscript?: string;
  onItemsPress?: () => void;
  onEmojiPress?: () => void;
  onVoicePress?: () => void;
  itemsSelected?: boolean;
  emojiSelected?: boolean;
  centerTitle?: string;
  trailingAction?: {
    onPress: () => void;
    icon?: 'add' | 'insert';
  };
};

export function SuggestionBar({
  suggestions,
  prefix,
  autocorrectPreview = null,
  onSelect,
  essentialSuggestions = [],
  onEssentialSelect,
  essentialsForm,
  visible = true,
  isListening = false,
  partialTranscript = '',
  onItemsPress,
  onEmojiPress,
  onVoicePress,
  itemsSelected = false,
  emojiSelected = false,
  centerTitle,
  trailingAction,
}: SuggestionBarProps) {
  if (!visible) {
    return null;
  }

  const isFormMode = Boolean(essentialsForm);
  const showPartial = !isFormMode && isListening && partialTranscript.length > 0;
  const hasEssentials = !isFormMode && essentialSuggestions.length > 0;
  const hasAutocorrect =
    !isFormMode && Boolean(autocorrectPreview) && prefix.length > 0;
  const hasSuggestions = !isFormMode && suggestions.length > 0;
  const showWordSuggestions = hasAutocorrect || hasSuggestions;
  const toolbarIconMuted = keyboardTheme.suggestionDivider;
  const toolbarIconActive = keyboardTheme.label;
  const toolbarIconSize = 20;
  const itemsIconColor = itemsSelected ? toolbarIconActive : toolbarIconMuted;
  const emojiIconColor = emojiSelected ? toolbarIconActive : toolbarIconMuted;
  const voiceIconColor = isListening ? toolbarIconActive : toolbarIconMuted;

  return (
    <View style={styles.container}>
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
        {isFormMode ? (
          <BackIcon width={22} height={14} />
        ) : (
          <ItemsIcon
            width={toolbarIconSize}
            height={toolbarIconSize}
            color={itemsIconColor}
          />
        )}
      </Pressable>

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
        ) : centerTitle ? null : showPartial ? (
          <View style={styles.partialContainer}>
            <Text style={styles.partialText} numberOfLines={1}>
              {partialTranscript}
            </Text>
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
            {hasAutocorrect && autocorrectPreview ? (
              <Pressable
                onPressIn={() => {
                  triggerKeyHaptic();
                  onSelect(autocorrectPreview);
                }}
                style={({pressed}) => [
                  styles.suggestion,
                  styles.autocorrectSuggestion,
                  pressed && styles.suggestionPressed,
                ]}>
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {autocorrectPreview}
                </Text>
              </Pressable>
            ) : null}
            {suggestions.map((word, index) => {
              const display = word.includes(' ')
                ? word
                : applyCaseToWord(word, prefix);
              return (
                <Fragment key={word}>
                  {index > 0 || hasAutocorrect ? (
                    <View style={styles.divider} />
                  ) : null}
                  <Pressable
                    onPressIn={() => {
                      triggerKeyHaptic();
                      onSelect(display);
                    }}
                    style={({pressed}) => [
                      styles.suggestion,
                      pressed && styles.suggestionPressed,
                    ]}>
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {display}
                    </Text>
                  </Pressable>
                </Fragment>
              );
            })}
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
          <CheckIcon width={24} height={24} />
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
              color={keyboardTheme.essentialsAccent}
            />
          )}
        </Pressable>
      ) : (
        <View style={styles.toolbarTrailing}>
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
            <VoiceEqualizerIcon
              active={isListening}
              size={toolbarIconSize}
              color={voiceIconColor}
            />
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

const styles = StyleSheet.create({
  container: {
    minHeight: keyboardTheme.suggestionBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
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
    minHeight: keyboardTheme.suggestionBarHeight,
  },
  centerTitleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: {
    color: keyboardTheme.spaceLabel,
    fontSize: 12,
    fontFamily: keyboardTheme.fontFamily,
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
    color: keyboardTheme.spaceLabel,
    fontSize: 10,
    fontFamily: keyboardTheme.fontFamily,
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
    color: keyboardTheme.essentialsAccent,
    fontSize: 16,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  formText: {
    flexShrink: 1,
    color: keyboardTheme.label,
    fontSize: 16,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '500',
  },
  formPlaceholder: {
    color: keyboardTheme.spaceLabel,
    fontWeight: '400',
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: keyboardTheme.essentialsAccent,
    borderRadius: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: keyboardTheme.suggestionBarHeight,
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
    backgroundColor: keyboardTheme.keyPressed,
  },
  suggestionText: {
    color: keyboardTheme.label,
    fontSize: 17,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '500',
  },
  autocorrectSuggestion: {
    paddingHorizontal: 4,
  },
  essentialKeyword: {
    color: keyboardTheme.essentialsAccent,
    fontSize: 14,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  essentialValue: {
    color: keyboardTheme.spaceLabel,
    fontSize: 12,
    fontFamily: keyboardTheme.fontFamily,
  },
  partialContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  partialText: {
    color: keyboardTheme.spaceLabel,
    fontSize: 17,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '500',
    textAlign: 'right',
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: keyboardTheme.suggestionDivider,
    borderRadius: 999,
  },
});
