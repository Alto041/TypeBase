import * as DocumentPicker from 'expo-document-picker';
import type {DocumentPickerOptions, DocumentPickerResult} from 'expo-document-picker';
import {InteractionManager, Platform} from 'react-native';

/** Serializes all document picks — Expo allows only one picker session at a time. */
let pickTurn: Promise<void> = Promise.resolve();
let activePickCount = 0;

export function isDocumentPickerActive(): boolean {
  return activePickCount > 0;
}

export function formatDocumentPickerError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (
    lower.includes('document picking in progress') ||
    lower.includes('different document picking') ||
    lower.includes('exportdocument') ||
    lower.includes('documentpicker')
  ) {
    return 'A file picker is already open. Close it, wait a moment, and try again.';
  }
  return message;
}

async function waitForUiSettle(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await new Promise<void>(resolve => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

/**
 * Drop-in replacement for `DocumentPicker.getDocumentAsync` that queues requests
 * so two imports (font, layout, sound) cannot overlap.
 */
export async function pickDocumentAsync(
  options: DocumentPickerOptions = {},
): Promise<DocumentPickerResult> {
  const previousTurn = pickTurn;
  let releaseTurn!: () => void;
  pickTurn = new Promise<void>(resolve => {
    releaseTurn = resolve;
  });

  await previousTurn;

  activePickCount += 1;
  try {
    await waitForUiSettle();
    return await DocumentPicker.getDocumentAsync(options);
  } finally {
    activePickCount = Math.max(0, activePickCount - 1);
    releaseTurn();
  }
}
