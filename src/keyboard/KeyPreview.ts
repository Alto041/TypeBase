import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;

export function initKeyPreview(): void {
  KeyPreview?.init();
}

export function setKeyPreviewTheme(
  backgroundColor: string,
  textColor: string,
  fontAssetPath?: string | null,
  cornerRadiusDp?: number,
): void {
  KeyPreview?.setTheme(
    backgroundColor,
    textColor,
    fontAssetPath?.trim() ? fontAssetPath.trim() : '',
    typeof cornerRadiusDp === 'number' && Number.isFinite(cornerRadiusDp)
      ? Math.round(cornerRadiusDp)
      : 6,
  );
}

export function showKeyPreview(reactTag: number, label: string): void {
  KeyPreview?.show(reactTag, label);
}

export function hideKeyPreview(reactTag: number): void {
  KeyPreview?.hide(reactTag);
}

export function hideAllKeyPreviews(): void {
  KeyPreview?.hideAll();
}

/** @deprecated Prefer hideKeyPreview(reactTag) or hideAllKeyPreviews(). */
export function hideAllKeyPreviewsDelayed(delayMs: number): void {
  KeyPreview?.hideDelayed(delayMs);
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
