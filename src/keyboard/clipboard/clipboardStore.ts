import {keyboardBridge} from '../keyboardBridge';
import type {ClipboardItem} from './types';

const MAX_HISTORY = 50;
const SCREENSHOT_LOOKBACK_MS = 5 * 60 * 1000;
const MAX_SCREENSHOTS_PER_IMPORT = 4;

const items = new Map<string, ClipboardItem>();

let loadPromise: Promise<void> | null = null;
let lastScreenshotImportAt = 0;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortItems(list: ClipboardItem[]): ClipboardItem[] {
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.createdAt - a.createdAt;
  });
}

async function persist(): Promise<void> {
  const list = sortItems(Array.from(items.values()));
  await keyboardBridge.setClipboardHistory(JSON.stringify(list));
}

function normalizeLoadedItem(
  item: Partial<ClipboardItem> & {text?: string},
): ClipboardItem | null {
  if (!item?.id) {
    return null;
  }

  const kind = item.kind ?? (item.imageUri ? 'image' : 'text');
  if (kind === 'image') {
    if (!item.imageUri) {
      return null;
    }
    return {
      id: item.id,
      kind: 'image',
      imageUri: item.imageUri,
      imageHash: item.imageHash,
      mimeType: item.mimeType,
      createdAt: item.createdAt ?? Date.now(),
      pinned: item.pinned ?? false,
    };
  }

  if (!item.text) {
    return null;
  }

  return {
    id: item.id,
    kind: 'text',
    text: item.text,
    createdAt: item.createdAt ?? Date.now(),
    pinned: item.pinned ?? false,
  };
}

async function deleteImageFileIfUnused(imageUri: string): Promise<void> {
  const stillReferenced = Array.from(items.values()).some(
    item => item.kind === 'image' && item.imageUri === imageUri,
  );
  if (!stillReferenced) {
    await keyboardBridge.deleteClipboardImageFile(imageUri);
  }
}

function trimUnpinnedOverflow(): void {
  let sorted = sortItems(Array.from(items.values()));
  while (sorted.length > MAX_HISTORY) {
    const removable = [...sorted].reverse().find(entry => !entry.pinned);
    if (!removable) {
      break;
    }
    items.delete(removable.id);
    if (removable.kind === 'image' && removable.imageUri) {
      void deleteImageFileIfUnused(removable.imageUri);
    }
    sorted = sortItems(Array.from(items.values()));
  }
}

export async function ensureClipboardLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const raw = await keyboardBridge.getClipboardHistory();
    items.clear();
    try {
      const parsed = JSON.parse(raw) as Array<
        Partial<ClipboardItem> & {text?: string}
      >;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const normalized = normalizeLoadedItem(item);
          if (normalized) {
            items.set(normalized.id, normalized);
          }
        }
      }
    } catch {
      items.clear();
    }
  })();

  return loadPromise;
}

export function getClipboardItems(): ClipboardItem[] {
  return sortItems(Array.from(items.values()));
}

export async function captureSystemClipboard(): Promise<ClipboardItem | null> {
  const content = await keyboardBridge.getClipboardContent();
  if (content.kind === 'text') {
    return addClipboardText(content.text);
  }
  if (content.kind === 'image') {
    return addClipboardImage(content.imagePath, content.imageHash, content.mimeType);
  }
  return null;
}

export async function addClipboardText(text: string): Promise<ClipboardItem> {
  const trimmed = text.trim();
  const existing = getClipboardItems().find(
    item => item.kind === 'text' && item.text === trimmed,
  );
  if (existing) {
    const updated: ClipboardItem = {...existing, createdAt: Date.now()};
    items.set(existing.id, updated);
    await persist();
    return updated;
  }

  const item: ClipboardItem = {
    id: createId(),
    kind: 'text',
    text: trimmed,
    createdAt: Date.now(),
    pinned: false,
  };
  items.set(item.id, item);
  trimUnpinnedOverflow();
  await persist();
  return item;
}

export async function addClipboardImage(
  imageUri: string,
  imageHash: string,
  mimeType?: string,
  options: {bumpExisting?: boolean} = {},
): Promise<ClipboardItem> {
  const existing = getClipboardItems().find(
    item => item.kind === 'image' && item.imageHash === imageHash,
  );
  if (existing) {
    if (options.bumpExisting === false) {
      return existing;
    }
    const updated: ClipboardItem = {...existing, createdAt: Date.now()};
    items.set(existing.id, updated);
    await persist();
    return updated;
  }

  const item: ClipboardItem = {
    id: createId(),
    kind: 'image',
    imageUri,
    imageHash,
    mimeType,
    createdAt: Date.now(),
    pinned: false,
  };
  items.set(item.id, item);
  trimUnpinnedOverflow();
  await persist();
  return item;
}

export async function importRecentScreenshots(
  options: {bumpExisting?: boolean} = {},
): Promise<number> {
  await ensureClipboardLoaded();
  const hasMediaPermission = await keyboardBridge
    .hasMediaImagesPermission()
    .catch(() => false);
  if (!hasMediaPermission) {
    return 0;
  }
  const now = Date.now();
  const sinceMs =
    options.bumpExisting
      ? now - SCREENSHOT_LOOKBACK_MS
      : lastScreenshotImportAt > 0
      ? Math.max(lastScreenshotImportAt - 2000, now - SCREENSHOT_LOOKBACK_MS)
      : now - SCREENSHOT_LOOKBACK_MS;

  const screenshots = await keyboardBridge.importRecentScreenshots(
    sinceMs,
    MAX_SCREENSHOTS_PER_IMPORT,
  );
  lastScreenshotImportAt = now;

  let imported = 0;
  // MediaStore returns newest first; insert/update oldest first so the newest
  // screenshot lands at the top of clipboard history.
  for (const screenshot of [...screenshots].reverse()) {
    const before = getClipboardItems().find(
      item => item.kind === 'image' && item.imageHash === screenshot.imageHash,
    );
    await addClipboardImage(
      screenshot.imagePath,
      screenshot.imageHash,
      screenshot.mimeType,
      {bumpExisting: options.bumpExisting ?? false},
    );
    if (!before) {
      imported += 1;
    }
  }
  return imported;
}

export async function deleteClipboardItem(itemId: string): Promise<void> {
  const item = items.get(itemId);
  const imageUri = item?.kind === 'image' ? item.imageUri : undefined;
  items.delete(itemId);
  if (imageUri) {
    await deleteImageFileIfUnused(imageUri);
  }
  await persist();
}

export async function toggleClipboardPin(itemId: string): Promise<void> {
  const item = items.get(itemId);
  if (!item) {
    return;
  }
  items.set(itemId, {...item, pinned: !item.pinned});
  await persist();
}
