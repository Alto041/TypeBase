import * as FileSystem from 'expo-file-system/legacy';
import {keyboardBridge} from '../keyboardBridge';
import {getGifInsertUrl, type GiphyGif} from './giphyService';

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

export async function downloadAndInsertGif(gif: GiphyGif): Promise<boolean> {
  const remoteUrl = getGifInsertUrl(gif);
  if (!remoteUrl) {
    return false;
  }

  const dir = await ensureClipboardImagesDir();
  if (!dir) {
    return false;
  }

  const destination = `${dir}/giphy-${gif.id}.gif`;
  const downloaded = await FileSystem.downloadAsync(remoteUrl, destination);
  if (downloaded.status !== 200) {
    return false;
  }

  const localPath = downloaded.uri.replace(/^file:\/\//, '');
  return keyboardBridge.insertClipboardImage(localPath);
}
