import React, {memo, useSyncExternalStore} from 'react';

import {formatEssentialSuggestionTrigger} from '../essentials/essentialsTrigger';
import {
  getTypingSuggestionBarState,
  subscribeTypingSuggestionBar,
} from '../typingSuggestionBarStore';
import {SuggestionBar} from './SuggestionBar';

type TypingSuggestionBarHostProps = Omit<
  React.ComponentProps<typeof SuggestionBar>,
  | 'suggestions'
  | 'prefix'
  | 'typedKeepSuggestion'
  | 'autocorrectPreview'
  | 'essentialSuggestions'
>;

function TypingSuggestionBarHostComponent(props: TypingSuggestionBarHostProps) {
  const bar = useSyncExternalStore(
    subscribeTypingSuggestionBar,
    getTypingSuggestionBarState,
    getTypingSuggestionBarState,
  );

  return (
    <SuggestionBar
      {...props}
      suggestions={bar.suggestions}
      prefix={bar.currentPrefix}
      typedKeepSuggestion={bar.typedKeepSuggestion}
      autocorrectPreview={bar.autocorrectPreview}
      essentialSuggestions={bar.essentialSuggestions.map(item => ({
        keyword: item.keyword,
        value: item.value,
        triggerLabel: formatEssentialSuggestionTrigger(item.keyword),
      }))}
    />
  );
}

export const TypingSuggestionBarHost = memo(TypingSuggestionBarHostComponent);
