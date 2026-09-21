import {
  expandEssentialForInsert,
  getEssentialByKeyword,
} from './essentialsStore';
import {
  expandBuiltinPlaceholder,
  isBuiltinPlaceholderKey,
} from './snippetExpand';

export type EssentialTrigger = {
  query: string;
  triggerLength: number;
};

export function extractEssentialTrigger(
  context: string,
  matchCase = false,
): EssentialTrigger | null {
  const semiMatch = context.match(/;([a-zA-Z0-9_]*)$/);
  if (!semiMatch) {
    return null;
  }
  const raw = semiMatch[1];
  return {
    query: matchCase ? raw : raw.toLowerCase(),
    triggerLength: semiMatch[0].length,
  };
}

export function resolveEssentialExpansion(
  context: string,
  matchCase = false,
): {
  triggerLength: number;
  value: string;
} | null {
  const semiMatch = context.match(/;([a-zA-Z0-9_]+)$/);
  if (!semiMatch) {
    return null;
  }
  const typed = semiMatch[1];
  const builtinKey = typed.toLowerCase();
  if (isBuiltinPlaceholderKey(builtinKey)) {
    return {
      triggerLength: semiMatch[0].length,
      value: expandBuiltinPlaceholder(builtinKey),
    };
  }
  const essential = getEssentialByKeyword(typed, matchCase);
  if (!essential) {
    return null;
  }
  return {
    triggerLength: semiMatch[0].length,
    value: expandEssentialForInsert(essential),
  };
}

export function formatEssentialSuggestionTrigger(keyword: string): string {
  return `;${keyword}`;
}

/** True while the user is typing a ;essential trigger (skip heavy prefix bar work). */
export function isEssentialTriggerPrefix(prefix: string): boolean {
  if (!prefix) {
    return false;
  }
  return /;\w*$/.test(prefix);
}
