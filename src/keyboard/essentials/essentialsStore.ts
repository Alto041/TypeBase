import {keyboardBridge} from '../keyboardBridge';
import type {Essential} from './types';

const essentials = new Map<string, Essential>();
let loadPromise: Promise<void> | null = null;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeEssentialKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/^@+/, '');
}

export function isValidEssentialKeyword(keyword: string): boolean {
  const normalized = normalizeEssentialKeyword(keyword);
  return normalized.length >= 1 && /^[a-z0-9_]+$/.test(normalized);
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
              keyword: normalizeEssentialKeyword(item.keyword),
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

export function getEssentialByKeyword(keyword: string): Essential | undefined {
  const normalized = normalizeEssentialKeyword(keyword);
  return getEssentialsList().find(item => item.keyword === normalized);
}

export async function saveEssential(
  keyword: string,
  value: string,
  essentialId?: string,
): Promise<Essential | null> {
  const normalized = normalizeEssentialKeyword(keyword);
  if (!isValidEssentialKeyword(normalized)) {
    return null;
  }

  const duplicate = getEssentialsList().find(
    item => item.keyword === normalized && item.id !== essentialId,
  );
  if (duplicate) {
    return null;
  }

  const essential: Essential = {
    id: essentialId ?? createId(),
    keyword: normalized,
    value,
  };

  essentials.set(essential.id, essential);
  await persistEssentials();
  return essential;
}

export async function deleteEssential(essentialId: string): Promise<void> {
  essentials.delete(essentialId);
  await persistEssentials();
}

export function matchEssentialSuggestions(query: string, limit = 3): Essential[] {
  const normalized = normalizeEssentialKeyword(query);
  const list = getEssentialsList();
  if (!normalized) {
    return list.slice(0, limit);
  }
  return list
    .filter(item => item.keyword.startsWith(normalized))
    .slice(0, limit);
}
