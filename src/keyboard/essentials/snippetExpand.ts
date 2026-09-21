import {getClipboardItems} from '../clipboard/clipboardStore';

/** `{date}` or easy-to-type `;date` (semicolon + name, word boundary). */
const PLACEHOLDER_PATTERN =
  /\{(date|time|clipboard|cursor)\}|;(date|time|clipboard|cursor)\b/gi;
const PLACEHOLDER_TEST =
  /\{(date|time|clipboard|cursor)\}|;(date|time|clipboard|cursor)\b/i;

export const BUILTIN_PLACEHOLDER_KEYS = [
  'date',
  'time',
  'clipboard',
  'cursor',
] as const;

export type BuiltinPlaceholderKey = (typeof BUILTIN_PLACEHOLDER_KEYS)[number];

export function isBuiltinPlaceholderKey(key: string): key is BuiltinPlaceholderKey {
  return BUILTIN_PLACEHOLDER_KEYS.includes(
    key.toLowerCase() as BuiltinPlaceholderKey,
  );
}

export function containsSnippetPlaceholders(value: string): boolean {
  return PLACEHOLDER_TEST.test(value);
}

export type SnippetExpandContext = {
  now?: Date;
  clipboardText?: string;
};

function clipboardTextForPlaceholders(): string {
  const items = getClipboardItems();
  return items[0]?.kind === 'text' && items[0].text ? items[0].text : '';
}

function formatPlaceholder(key: string, context: SnippetExpandContext): string {
  const now = context.now ?? new Date();
  switch (key.toLowerCase()) {
    case 'date':
      return now.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    case 'time':
      return now.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    case 'clipboard':
      return context.clipboardText ?? '';
    case 'cursor':
      return '';
    default:
      return key.startsWith(';') ? key : `{${key}}`;
  }
}

export function expandSnippetValue(
  template: string,
  context: SnippetExpandContext = {},
): string {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return template.replace(
    PLACEHOLDER_PATTERN,
    (match, bracedKey: string | undefined, semiKey: string | undefined) => {
      const key = (bracedKey ?? semiKey ?? '').toLowerCase();
      if (!key) {
        return match;
      }
      return formatPlaceholder(key, context);
    },
  );
}

/** Single built-in token typed as ;time, ;date, etc. */
export function expandBuiltinPlaceholder(key: string): string {
  if (!isBuiltinPlaceholderKey(key)) {
    return '';
  }
  return formatPlaceholder(key, {clipboardText: clipboardTextForPlaceholders()});
}

/** Expands placeholders whenever present (save rules gate who may store them). */
export function resolveSnippetInsertValue(rawValue: string): string {
  if (!containsSnippetPlaceholders(rawValue)) {
    return rawValue;
  }
  return expandSnippetValue(rawValue, {
    clipboardText: clipboardTextForPlaceholders(),
  });
}
