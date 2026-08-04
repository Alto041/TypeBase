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
  if (
    lower.includes('not attached to an activity') ||
    lower.includes('no current activity') ||
    lower.includes('activity is null') ||
    lower.includes('current activity')
  ) {
    return 'TypeBase is still switching back to the app. Wait a moment and try the upload again.';
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

function isDetachedActivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('not attached to an activity') ||
    lower.includes('no current activity') ||
    lower.includes('activity is null') ||
    lower.includes('current activity') ||
    lower.includes('activity has been destroyed') ||
    lower.includes('activity is destroyed')
  );
}

async function waitForActivityReattach(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await new Promise<void>(resolve => setTimeout(resolve, 500));
  await waitForUiSettle();
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
    await waitForActivityReattach();
    try {
      return await DocumentPicker.getDocumentAsync(options);
    } catch (error) {
      // The keyboard and the main app share one React host. When returning from
      // the IME, Expo can briefly see a detached Activity; retry once after the
      // host has had time to reattach instead of failing every font/sound import.
      if (!isDetachedActivityError(error)) {
        throw error;
      }
      await waitForActivityReattach();
      return await DocumentPicker.getDocumentAsync(options);
    }
  } finally {
    activePickCount = Math.max(0, activePickCount - 1);
    releaseTurn();
  }
}
