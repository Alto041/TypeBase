import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;

export function initKeyPreview(): void {
  KeyPreview?.init();
}

export function setKeyPreviewTheme(
  backgroundColor: string,
  textColor: string,
): void {
  KeyPreview?.setTheme(backgroundColor, textColor);
}

export function showKeyPreview(reactTag: number, label: string): void {
  KeyPreview?.show(reactTag, label);
}

/** @param delayMs When set, keeps the preview visible briefly (default 80ms on release). */
export function hideKeyPreview(delayMs?: number): void {
  if (delayMs != null && delayMs > 0) {
    KeyPreview?.hideDelayed(delayMs);
  } else {
    KeyPreview?.hide();
  }
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
