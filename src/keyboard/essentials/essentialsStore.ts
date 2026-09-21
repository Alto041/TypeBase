import {getPremiumCached} from '../../licensing/entitlements';
import {keyboardBridge} from '../keyboardBridge';
import {containsSnippetPlaceholders, resolveSnippetInsertValue} from './snippetExpand';
import {
  FREE_SNIPPET_LIMIT,
  type SaveEssentialFailureReason,
} from './snippetTier';
import type {Essential} from './types';

const essentials = new Map<string, Essential>();
let loadPromise: Promise<void> | null = null;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function stripEssentialTriggerPrefix(keyword: string): string {
  return keyword.trim().replace(/^@+/, '');
}

export function normalizeEssentialKeyword(keyword: string): string {
  return stripEssentialTriggerPrefix(keyword).toLowerCase();
}

export function keywordForEssentialStorage(
  keyword: string,
  matchCase: boolean,
): string {
  const stripped = stripEssentialTriggerPrefix(keyword);
  return matchCase ? stripped : stripped.toLowerCase();
}

export function isValidEssentialKeyword(
  keyword: string,
  matchCase: boolean,
): boolean {
  const stored = keywordForEssentialStorage(keyword, matchCase);
  if (stored.length < 1) {
    return false;
  }
  return matchCase
    ? /^[a-zA-Z0-9_]+$/.test(stored)
    : /^[a-z0-9_]+$/.test(stored);
}

function validateSnippetSave(
  keyword: string,
  value: string,
  essentialId: string | undefined,
  isPremium: boolean,
  matchCase: boolean,
): SaveEssentialFailureReason | null {
  const stored = keywordForEssentialStorage(keyword, matchCase);
  if (!isValidEssentialKeyword(keyword, matchCase)) {
    return 'invalid_keyword';
  }

  const list = getEssentialsList();
  const duplicate = list.find(
    item => item.keyword === stored && item.id !== essentialId,
  );
  if (duplicate) {
    return 'duplicate';
  }

  if (!isPremium && containsSnippetPlaceholders(value)) {
    return 'placeholders';
  }

  const isNew = !essentialId;
  if (!isPremium && isNew && list.length >= FREE_SNIPPET_LIMIT) {
    return 'limit';
  }

  return null;
}

async function persistEssentials(): Promise<void> {
  const list = Array.from(essentials.values());
  await keyboardBridge.setEssentials(JSON.stringify(list));
}

export async function ensureEssentialsLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const raw = await keyboardBridge.getEssentials();
    essentials.clear();
    try {
      const parsed = JSON.parse(raw) as Essential[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.id && item?.keyword) {
            essentials.set(item.id, {
              id: item.id,
              keyword: stripEssentialTriggerPrefix(item.keyword),
              value: item.value ?? '',
            });
          }
        }
      }
    } catch {
      essentials.clear();
    }
  })();

  return loadPromise;
}

export function getEssentialsList(): Essential[] {
  return Array.from(essentials.values()).sort((a, b) =>
    a.keyword.localeCompare(b.keyword),
  );
}

export function getEssentialByKeyword(
  keyword: string,
  matchCase = false,
): Essential | undefined {
  const stripped = stripEssentialTriggerPrefix(keyword);
  const list = getEssentialsList();
  if (matchCase) {
    return list.find(item => item.keyword === stripped);
  }
  const lower = stripped.toLowerCase();
  return list.find(item => item.keyword.toLowerCase() === lower);
}

export type SaveEssentialResult =
  | {ok: true; essential: Essential}
  | {ok: false; reason: SaveEssentialFailureReason};

export async function saveEssential(
  keyword: string,
  value: string,
  essentialId?: string,
  isPremium: boolean = getPremiumCached(),
  matchCase = false,
): Promise<SaveEssentialResult> {
  const stored = keywordForEssentialStorage(keyword, matchCase);
  const failure = validateSnippetSave(
    keyword,
    value,
    essentialId,
    isPremium,
    matchCase,
  );
  if (failure) {
    return {ok: false, reason: failure};
  }

  const essential: Essential = {
    id: essentialId ?? createId(),
    keyword: stored,
    value,
  };

  essentials.set(essential.id, essential);
  await persistEssentials();
  return {ok: true, essential};
}

export async function deleteEssential(essentialId: string): Promise<void> {
  essentials.delete(essentialId);
  await persistEssentials();
}

export function matchEssentialSuggestions(
  query: string,
  limit = 3,
  matchCase = false,
): Essential[] {
  const stripped = stripEssentialTriggerPrefix(query);
  const needle = matchCase ? stripped : stripped.toLowerCase();
  const list = getEssentialsList();
  if (!needle) {
    return list.slice(0, limit);
  }
  return list
    .filter(item =>
      matchCase
        ? item.keyword.startsWith(needle)
        : item.keyword.toLowerCase().startsWith(needle),
    )
    .slice(0, limit);
}

export function formatSnippetTriggerLabel(keyword: string): string {
  return `;${keyword}`;
}

export function expandEssentialForInsert(essential: Essential): string {
  return resolveSnippetInsertValue(essential.value);
}
