import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;

export function initKeyPreview(): void {
  KeyPreview?.init();
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
