import {
  captureSystemClipboard,
  ensureClipboardLoaded,
  getClipboardItems,
  importRecentScreenshots,
} from './clipboardStore';
import type {ClipboardContent, ClipboardItem} from './types';

export type ClipboardPasteSuggestion = {
  kind: 'text' | 'image';
  text?: string;
  imageUri?: string;
  fingerprint: string;
};

function toImageUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function clipboardContentToPasteSuggestion(
  content: ClipboardContent,
): ClipboardPasteSuggestion | null {
  if (content.kind === 'text') {
    const text = content.text.trim();
    if (!text) {
      return null;
    }
    return {kind: 'text', text, fingerprint: `text:${text}`};
  }
  if (content.kind === 'image') {
    return {
      kind: 'image',
      imageUri: toImageUri(content.imagePath),
      fingerprint: `image:${content.imageHash}`,
    };
  }
  return null;
}

function clipboardItemToPasteSuggestion(
  item: ClipboardItem | undefined,
): ClipboardPasteSuggestion | null {
  if (!item) {
    return null;
  }
  if (item.kind === 'text') {
    const text = item.text?.trim();
    if (!text) {
      return null;
    }
    return {kind: 'text', text, fingerprint: `text:${text}`};
  }
  if (item.kind === 'image' && item.imageUri && item.imageHash) {
    return {
      kind: 'image',
      imageUri: item.imageUri.startsWith('file://')
        ? item.imageUri
        : `file://${item.imageUri}`,
      fingerprint: `image:${item.imageHash}`,
    };
  }
  return null;
}

export async function fetchClipboardPasteSuggestion(): Promise<ClipboardPasteSuggestion | null> {
  await ensureClipboardLoaded();
  await captureSystemClipboard().catch(() => null);
  await importRecentScreenshots({bumpExisting: true}).catch(() => 0);
  return clipboardItemToPasteSuggestion(getClipboardItems()[0]);
}

export function clipboardPastePreviewText(text: string, maxLength = 48): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
}
