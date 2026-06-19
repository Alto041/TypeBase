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

export function hideKeyPreview(): void {
  KeyPreview?.hide();
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
