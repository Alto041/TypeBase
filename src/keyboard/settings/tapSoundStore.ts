import * as FileSystem from 'expo-file-system/legacy';
import {Image, Platform} from 'react-native';

import {pickDocumentAsync} from '../../../lib/pickDocumentAsync';
import {keyboardBridge} from '../keyboardBridge';
import {updateKeyboardLayoutSetting} from './layoutStore';

export const TAP_SOUND_DIR_NAME = 'keyboard_tap_sounds';
export const DEFAULT_TAP_SOUND_FILE = 'haptic.wav';
const TAP_SOUND_BASENAME = 'custom_tap';

const DEFAULT_TAP_SOUND_ASSET = require('../../../assets/sounds/haptic.wav');

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

/** Copies the bundled haptic.wav into keyboard storage if it is not already present. */
export async function ensureBundledDefaultTapSound(): Promise<void> {
  if (Platform.OS !== 'android' || !FileSystem.documentDirectory) {
    return;
  }

  await ensureTapSoundDir();
  const destination = `${tapSoundDir()}/${DEFAULT_TAP_SOUND_FILE}`;
  const info = await FileSystem.getInfoAsync(destination);
  if (info.exists) {
    return;
  }

  const bundledUri = Image.resolveAssetSource(DEFAULT_TAP_SOUND_ASSET)?.uri;
  if (!bundledUri) {
    throw new Error('Bundled tap sound could not be loaded.');
  }
  await FileSystem.copyAsync({from: bundledUri, to: destination});
}

export async function installDefaultTapSoundSettings(): Promise<void> {
  await ensureBundledDefaultTapSound();
  await updateKeyboardLayoutSetting('customTapSoundFile', DEFAULT_TAP_SOUND_FILE);
  await updateKeyboardLayoutSetting('customTapSoundEnabled', true);
  keyboardBridge.syncCustomTapSound?.();
}

export async function importCustomTapSound(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Custom tap sounds are only supported on Android.');
  }

  const result = await pickDocumentAsync({
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

export async function installTapSoundFromLocalFile(
  sourceUri: string,
  soundId: string,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Custom tap sounds are only supported on Android.');
  }

  await ensureTapSoundDir();
  await removeExistingTapSounds();

  const safeId = soundId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'sound';
  const fileName = `myinstants_${safeId}.mp3`;
  const destination = `${tapSoundDir()}/${fileName}`;
  await FileSystem.copyAsync({from: sourceUri, to: destination});

  await updateKeyboardLayoutSetting('customTapSoundFile', fileName);
  await updateKeyboardLayoutSetting('customTapSoundEnabled', true);
  keyboardBridge.syncCustomTapSound?.();

  return fileName;
}

export async function installTapSoundFromUrl(
  mp3Url: string,
  soundId: string,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Custom tap sounds are only supported on Android.');
  }
  if (!mp3Url.trim()) {
    throw new Error('Sound URL is missing.');
  }

  const safeId = soundId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'sound';
  const tempDestination = `${FileSystem.cacheDirectory ?? ''}myinstants_${safeId}.mp3`;
  const download = await FileSystem.downloadAsync(mp3Url, tempDestination);
  if (download.status !== 200) {
    throw new Error('Could not download sound.');
  }

  return installTapSoundFromLocalFile(download.uri, soundId);
}

export async function previewCustomTapSound(): Promise<void> {
  keyboardBridge.playCustomTapSound?.();
}
