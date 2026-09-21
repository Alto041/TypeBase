import {startTransition} from 'react';

import type {Essential} from './essentials/types';

export type TypingSuggestionBarState = {
  suggestions: string[];
  currentPrefix: string;
  typedKeepSuggestion: string | null;
  autocorrectPreview: string | null;
  essentialSuggestions: Essential[];
  essentialTriggerLength: number;
};

const EMPTY: TypingSuggestionBarState = {
  suggestions: [],
  currentPrefix: '',
  typedKeepSuggestion: null,
  autocorrectPreview: null,
  essentialSuggestions: [],
  essentialTriggerLength: 0,
};

let state: TypingSuggestionBarState = {...EMPTY};
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export function getTypingSuggestionBarState(): TypingSuggestionBarState {
  return state;
}

export function subscribeTypingSuggestionBar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetTypingSuggestionBarState(): void {
  state = {...EMPTY};
  emit();
}

export function patchTypingSuggestionBar(
  partial: Partial<TypingSuggestionBarState>,
  options?: {transition?: boolean},
): void {
  if (Object.keys(partial).length === 0) {
    return;
  }
  const apply = () => {
    state = {...state, ...partial};
    emit();
  };
  if (options?.transition) {
    startTransition(apply);
  } else {
    apply();
  }
}

type SetStateAction<T> = T | ((prev: T) => T);

function resolveSetState<T>(value: SetStateAction<T>, prev: T): T {
  return typeof value === 'function'
    ? (value as (p: T) => T)(prev)
    : value;
}

export function setTypingBarSuggestions(value: SetStateAction<string[]>): void {
  const next = resolveSetState(value, state.suggestions);
  if (next === state.suggestions) {
    return;
  }
  patchTypingSuggestionBar({suggestions: next}, {transition: true});
}

export function setTypingBarPrefix(value: SetStateAction<string>): void {
  const next = resolveSetState(value, state.currentPrefix);
  if (next === state.currentPrefix) {
    return;
  }
  patchTypingSuggestionBar({currentPrefix: next}, {transition: true});
}

export function setTypingBarTypedKeep(
  value: SetStateAction<string | null>,
): void {
  const next = resolveSetState(value, state.typedKeepSuggestion);
  if (next === state.typedKeepSuggestion) {
    return;
  }
  patchTypingSuggestionBar({typedKeepSuggestion: next}, {transition: true});
}

export function setTypingBarAutocorrectPreview(
  value: SetStateAction<string | null>,
): void {
  const next = resolveSetState(value, state.autocorrectPreview);
  if (next === state.autocorrectPreview) {
    return;
  }
  patchTypingSuggestionBar({autocorrectPreview: next}, {transition: true});
}

export function setTypingBarEssentials(
  value: SetStateAction<Essential[]>,
): void {
  const next = resolveSetState(value, state.essentialSuggestions);
  if (next === state.essentialSuggestions) {
    return;
  }
  patchTypingSuggestionBar({essentialSuggestions: next}, {transition: true});
}

export function setTypingBarEssentialTriggerLength(
  value: SetStateAction<number>,
): void {
  const next = resolveSetState(value, state.essentialTriggerLength);
  if (next === state.essentialTriggerLength) {
    return;
  }
  patchTypingSuggestionBar({essentialTriggerLength: next}, {transition: true});
}
