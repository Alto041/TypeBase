import {
  getCustomLayoutMeta,
  getCustomLayoutRows,
  hasCustomLayout,
} from '../settings/customLayoutStore';
import type {KeyDefinition} from './qwerty';
import {
  DEFAULT_LETTER_LAYOUT_ID,
  getBuiltInLetterLayoutMeta,
  getBuiltInLetterLayoutRows,
  isBuiltInLetterLayoutId,
  isCustomLayoutId,
  type LetterLayoutId,
  type LetterLayoutMeta,
} from './letterLayouts';

export function getLetterLayoutMeta(id: LetterLayoutId): LetterLayoutMeta {
  const custom = getCustomLayoutMeta(id);
  if (custom) {
    return custom;
  }
  return getBuiltInLetterLayoutMeta(id);
}

export function getLetterLayoutRows(id: LetterLayoutId): KeyDefinition[][] {
  const custom = getCustomLayoutRows(id);
  if (custom) {
    return custom;
  }
  return getBuiltInLetterLayoutRows(id);
}

export function normalizeLetterLayoutId(raw: unknown): LetterLayoutId {
  if (typeof raw === 'string') {
    if (isBuiltInLetterLayoutId(raw)) {
      return raw;
    }
    if (isCustomLayoutId(raw) && hasCustomLayout(raw)) {
      return raw;
    }
  }
  return DEFAULT_LETTER_LAYOUT_ID;
}

export function isLetterLayoutId(value: string): boolean {
  return isBuiltInLetterLayoutId(value) || hasCustomLayout(value);
}
