import type {KeyboardLayoutSettings} from './theme';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isLandscapeOrientation(
  width: number,
  height: number,
): boolean {
  return width > height;
}

/** Shorter keys and tighter rows so the keyboard fits in landscape. */
export function landscapeLayoutSettings(
  layout: KeyboardLayoutSettings,
): KeyboardLayoutSettings {
  return {
    ...layout,
    keyHeight: clamp(Math.round(layout.keyHeight * 0.78), 36, 52),
    keyRowMargin: clamp(Math.round(layout.keyRowMargin * 0.58), 4, 10),
    keyGap: clamp(Math.round(layout.keyGap * 0.85), 2, layout.keyGap),
    keyRadius: clamp(Math.round(layout.keyRadius * 0.9), 4, layout.keyRadius),
  };
}

export function layoutSettingsForOrientation(
  layout: KeyboardLayoutSettings,
  landscape: boolean,
): KeyboardLayoutSettings {
  return landscape ? landscapeLayoutSettings(layout) : layout;
}
