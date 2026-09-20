import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;
export type KeyPreviewStyle = 'popup' | 'subtle' | 'doodle';
let keyPreviewStyle: KeyPreviewStyle = 'popup';

export function initKeyPreview(): void {
  KeyPreview?.init();
}

export function setKeyPreviewStyle(style: KeyPreviewStyle): void {
  keyPreviewStyle = style;
}

export function getKeyPreviewStyle(): KeyPreviewStyle {
  return keyPreviewStyle;
}

export function primeKeyPreviewAnchor(reactTag: number): void {
  if (reactTag > 0) {
    KeyPreview?.primeAnchor(reactTag);
  }
}

export function setKeyPreviewTheme(
  backgroundColor: string,
  textColor: string,
  fontAssetPath?: string | null,
  cornerRadiusDp?: number,
  pressedOverlayColor?: string,
): void {
  KeyPreview?.setTheme(
    backgroundColor,
    textColor,
    fontAssetPath?.trim() ? fontAssetPath.trim() : '',
    typeof cornerRadiusDp === 'number' && Number.isFinite(cornerRadiusDp)
      ? Math.round(cornerRadiusDp)
      : 6,
    pressedOverlayColor ?? backgroundColor,
  );
}

export function showKeyPreview(reactTag: number, label: string): void {
  if (keyPreviewStyle !== 'popup') {
    return;
  }
  KeyPreview?.show(reactTag, label);
}

export function hideKeyPreview(reactTag: number): void {
  if (keyPreviewStyle !== 'popup') {
    return;
  }
  KeyPreview?.hide(reactTag);
}

export function showKeyPressed(reactTag: number): void {
  if (reactTag > 0 && (keyPreviewStyle === 'popup' || keyPreviewStyle === 'subtle')) {
    KeyPreview?.showPressed(reactTag);
  }
}

export function hideKeyPressed(reactTag: number): void {
  if (reactTag > 0 && (keyPreviewStyle === 'popup' || keyPreviewStyle === 'subtle')) {
    KeyPreview?.hidePressed(reactTag);
  }
}

export function hideAllKeyPreviews(): void {
  KeyPreview?.hideAll();
}

export function showKeyDoodleAt(pageX: number, pageY: number): void {
  if (keyPreviewStyle !== 'doodle') {
    return;
  }
  KeyPreview?.showDoodleAt(pageX, pageY);
}

/** @deprecated Prefer hideKeyPreview(reactTag) or hideAllKeyPreviews(). */
export function hideAllKeyPreviewsDelayed(delayMs: number): void {
  KeyPreview?.hideDelayed(delayMs);
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
