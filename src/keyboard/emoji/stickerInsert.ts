import * as FileSystem from 'expo-file-system/legacy';
import {keyboardBridge} from '../keyboardBridge';
import type {StickerLySticker} from './stickers';

const CLIPBOARD_IMAGES_DIR = `${FileSystem.documentDirectory ?? ''}clipboard_images`;

async function ensureClipboardImagesDir(): Promise<string | null> {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(CLIPBOARD_IMAGES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CLIPBOARD_IMAGES_DIR, {
      intermediates: true,
    });
  }

  return CLIPBOARD_IMAGES_DIR;
}

function stickerFileExtension(url: string): string {
  const withoutQuery = url.split('?')[0] ?? url;
  const extension = withoutQuery.split('.').pop()?.toLowerCase();
  if (!extension || extension.length > 5) {
    return 'png';
  }
  return extension === 'jfif' ? 'jpg' : extension;
}

export async function insertStickerLySticker(
  sticker: StickerLySticker,
): Promise<boolean> {
  const remoteUrl = sticker.insertUrl;
  if (!remoteUrl) {
    return false;
  }

  const dir = await ensureClipboardImagesDir();
  if (!dir) {
    return false;
  }

  const extension = stickerFileExtension(remoteUrl);
  const destination = `${dir}/stickerly-${sticker.id.replace(/[^\w-]+/g, '_')}.${extension}`;
  const downloaded = await FileSystem.downloadAsync(remoteUrl, destination);
  if (downloaded.status !== 200) {
    return false;
  }

  const localPath = downloaded.uri.replace(/^file:\/\//, '');
  return keyboardBridge.insertClipboardImage(localPath);
}
