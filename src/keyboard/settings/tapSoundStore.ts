import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {Platform} from 'react-native';

import {keyboardBridge} from '../keyboardBridge';
import {updateKeyboardLayoutSetting} from './layoutStore';

export const TAP_SOUND_DIR_NAME = 'keyboard_tap_sounds';
const TAP_SOUND_BASENAME = 'custom_tap';

const AUDIO_MIME_TYPES = [
  'audio/*',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
];

function tapSoundDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${TAP_SOUND_DIR_NAME}`;
}

function extensionFromAsset(name: string, mimeType?: string | null): string {
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'mp4'].includes(fromName)) {
    return fromName;
  }
  switch ((mimeType ?? '').toLowerCase()) {
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp4':
    case 'audio/aac':
      return 'm4a';
    default:
      return 'mp3';
  }
}

async function ensureTapSoundDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error('File storage is unavailable on this device.');
  }
  const dir = tapSoundDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, {intermediates: true});
  }
}

async function removeExistingTapSounds(): Promise<void> {
  const dir = tapSoundDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    return;
  }
  try {
    const entries = await FileSystem.readDirectoryAsync(dir);
    await Promise.all(
      entries.map(entry => FileSystem.deleteAsync(`${dir}/${entry}`, {idempotent: true})),
    );
  } catch {
    // Ignore cleanup failures.
  }
}

export function resolveCustomTapSoundPath(fileName: string | null | undefined): string | null {
  if (!fileName || !FileSystem.documentDirectory) {
    return null;
  }
  return `${tapSoundDir()}/${fileName}`;
}

export async function importCustomTapSound(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Custom tap sounds are only supported on Android.');
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: AUDIO_MIME_TYPES,
  });
  if (result.canceled || !result.assets?.[0]) {
    throw new Error('IMPORT_CANCELED');
  }

  const asset = result.assets[0];
  await ensureTapSoundDir();
  await removeExistingTapSounds();

  const ext = extensionFromAsset(asset.name, asset.mimeType);
  const fileName = `${TAP_SOUND_BASENAME}.${ext}`;
  const destination = `${tapSoundDir()}/${fileName}`;
  await FileSystem.copyAsync({from: asset.uri, to: destination});

  await updateKeyboardLayoutSetting('customTapSoundFile', fileName);
  await updateKeyboardLayoutSetting('customTapSoundEnabled', true);
  keyboardBridge.syncCustomTapSound?.();

  return fileName;
}

export async function clearCustomTapSound(): Promise<void> {
  await removeExistingTapSounds();
  await updateKeyboardLayoutSetting('customTapSoundFile', null);
  await updateKeyboardLayoutSetting('customTapSoundEnabled', false);
  keyboardBridge.syncCustomTapSound?.();
}

export async function previewCustomTapSound(): Promise<void> {
  keyboardBridge.playCustomTapSound?.();
}
