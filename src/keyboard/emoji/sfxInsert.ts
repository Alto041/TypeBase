import * as FileSystem from 'expo-file-system/legacy';
import {keyboardBridge} from '../keyboardBridge';
import type {MyInstantsSound} from './myinstantsService';

const SHARED_MEDIA_DIR = `${FileSystem.documentDirectory ?? ''}clipboard_images`;

async function ensureSharedMediaDir(): Promise<string | null> {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(SHARED_MEDIA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SHARED_MEDIA_DIR, {
      intermediates: true,
    });
  }

  return SHARED_MEDIA_DIR;
}

/** Streams the remote mp3 and plays it once, without touching the tap sound. */
export function previewSfx(sound: MyInstantsSound): void {
  if (!sound.mp3?.trim()) {
    return;
  }
  void keyboardBridge.previewSoundUrl(sound.mp3).catch(() => {});
}

/** Stops any currently previewing SFX sound. */
export function stopSfxPreview(): void {
  void keyboardBridge.stopPreviewSound?.().catch(() => {});
}

/** Downloads the mp3 and hands it to the target app as a shareable file. */
export async function downloadAndSendSfx(sound: MyInstantsSound): Promise<boolean> {
  if (!sound.mp3?.trim()) {
    return false;
  }

  const dir = await ensureSharedMediaDir();
  if (!dir) {
    return false;
  }

  const safeId = sound.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'sound';
  const destination = `${dir}/myinstants-${safeId}.mp3`;
  const downloaded = await FileSystem.downloadAsync(sound.mp3, destination);
  if (downloaded.status !== 200) {
    return false;
  }

  const localPath = downloaded.uri.replace(/^file:\/\//, '');

  // Try to attach inline via the IME (works only for apps that accept audio
  // content, which is rare). Fall back to an Android share sheet, which
  // reliably attaches the mp3 file into the target app.
  const committed = await keyboardBridge.insertClipboardFile(localPath);
  if (committed) {
    return true;
  }

  return keyboardBridge.shareMediaFile(localPath);
}
