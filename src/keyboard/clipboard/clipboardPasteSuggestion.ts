import {keyboardBridge} from '../keyboardBridge';
import type {ClipboardContent} from './types';

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

export async function fetchClipboardPasteSuggestion(): Promise<ClipboardPasteSuggestion | null> {
  const content = await keyboardBridge.getClipboardContent();
  return clipboardContentToPasteSuggestion(content);
}

export function clipboardPastePreviewText(text: string, maxLength = 48): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
}
