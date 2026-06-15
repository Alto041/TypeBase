import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;

export function initKeyPreview(): void {
  KeyPreview?.init();
}

export function showKeyPreview(reactTag: number, label: string): void {
  KeyPreview?.show(reactTag, label);
}

export function hideKeyPreview(delayMs = 80): void {
  KeyPreview?.hideDelayed(delayMs);
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
