import * as FileSystem from 'expo-file-system/legacy';
import {Platform} from 'react-native';

import {pickDocumentAsync} from '../../../lib/pickDocumentAsync';
import {updateKeyboardLayoutSetting} from './layoutStore';

export const FONT_DIR_NAME = 'keyboard_fonts';
const FONT_BASENAME = 'custom_keyboard_font';

const FONT_MIME_TYPES = [
  'font/*',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/octet-stream',
  '*/*',
];

function fontDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${FONT_DIR_NAME}`;
}

async function ensureFontDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error('File storage is unavailable on this device.');
  }
  const dir = fontDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, {intermediates: true});
  }
}

async function removeExistingCustomFonts(): Promise<void> {
  const dir = fontDir();
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
    // ignore
  }
}

export function resolveCustomFontUri(fileName: string | null | undefined): string | null {
  if (!fileName || !FileSystem.documentDirectory) {
    return null;
  }
  return `${fontDir()}/${fileName}`;
}

function extensionFromFontAsset(name: string, mimeType?: string | null): string {
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && ['ttf', 'otf'].includes(fromName)) {
    return fromName;
  }
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('ttf') || mime.includes('truetype')) return 'ttf';
  if (mime.includes('otf') || mime.includes('opentype')) return 'otf';
  // Fallback: try to keep extension if present
  return fromName && fromName.length <= 4 ? fromName : 'ttf';
}

export async function importCustomKeyboardFont(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Custom fonts are only supported on Android.');
  }

  const result = await pickDocumentAsync({
    copyToCacheDirectory: true,
    type: FONT_MIME_TYPES,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new Error('IMPORT_CANCELED');
  }

  const asset = result.assets[0];
  const name = asset.name || 'font.ttf';

  // Basic validation by extension
  const lowerName = name.toLowerCase();
  if (!lowerName.endsWith('.ttf') && !lowerName.endsWith('.otf')) {
    // Still allow if user picked something that looks like a font; we'll try.
  }

  await ensureFontDir();
  await removeExistingCustomFonts();

  const ext = extensionFromFontAsset(name, asset.mimeType);
  const fileName = `${FONT_BASENAME}.${ext}`;
  const destination = `${fontDir()}/${fileName}`;

  await FileSystem.copyAsync({from: asset.uri, to: destination});

  await updateKeyboardLayoutSetting('customFontFile', fileName);
  await updateKeyboardLayoutSetting('customFontEnabled', true);

  return fileName;
}

export async function clearCustomKeyboardFont(): Promise<void> {
  await removeExistingCustomFonts();
  await updateKeyboardLayoutSetting('customFontFile', null);
  await updateKeyboardLayoutSetting('customFontEnabled', false);
}

export async function getCurrentCustomFontUri(): Promise<string | null> {
  // This is a helper the keyboard can use after layout is loaded.
  // Actual resolution happens in KeyboardApp using the live layout settings.
  return null; // resolved at call site from layout
}
