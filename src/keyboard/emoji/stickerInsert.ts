import {Image} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {keyboardBridge} from '../keyboardBridge';
import type {KeyboardSticker} from './stickers';

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

function stickerExtension(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) {
    return 'jpg';
  }
  return extension === 'jfif' ? 'jpg' : extension;
}

function encodeBundledAssetUri(uri: string): string {
  return uri.replace(/ /g, '%20');
}

async function materializeBundledSticker(
  sticker: KeyboardSticker,
  destination: string,
): Promise<boolean> {
  const resolved = Image.resolveAssetSource(sticker.source);
  const sourceUri = resolved?.uri;
  if (!sourceUri) {
    return false;
  }

  if (sourceUri.startsWith('file://')) {
    await FileSystem.copyAsync({from: sourceUri, to: destination});
    return true;
  }

  const download = await FileSystem.downloadAsync(
    encodeBundledAssetUri(sourceUri),
    destination,
  );
  return download.status === 200;
}

export async function insertBundledSticker(
  sticker: KeyboardSticker,
): Promise<boolean> {
  const dir = await ensureClipboardImagesDir();
  if (!dir) {
    return false;
  }

  const extension = stickerExtension(sticker.filename);
  const destination = `${dir}/sticker-${sticker.id}.${extension}`;
  const materialized = await materializeBundledSticker(sticker, destination);
  if (!materialized) {
    return false;
  }

  const localPath = destination.replace(/^file:\/\//, '');
  return keyboardBridge.insertClipboardImage(localPath);
}
