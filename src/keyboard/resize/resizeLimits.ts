export const MIN_KEYBOARD_HEIGHT_DP = 245;
export const MAX_KEYBOARD_HEIGHT_DP = 510;

/** Offset bounds so `baseHeight + offset` stays within min/max keyboard height. */
export function computeKeyboardResizeOffsetBounds(baseHeightDp: number): {
  minOffset: number;
  maxOffset: number;
} {
  return {
    minOffset: MIN_KEYBOARD_HEIGHT_DP - baseHeightDp,
    maxOffset: MAX_KEYBOARD_HEIGHT_DP - baseHeightDp,
  };
}

export function clampKeyboardResizeOffset(
  offset: number,
  baseHeightDp: number,
): number {
  const {minOffset, maxOffset} = computeKeyboardResizeOffsetBounds(baseHeightDp);
  return Math.max(minOffset, Math.min(maxOffset, Math.round(offset)));
}

export function computeResizedKeyboardHeightDp(
  baseHeightDp: number,
  offset: number,
): number {
  const clampedOffset = clampKeyboardResizeOffset(offset, baseHeightDp);
  return Math.max(
    MIN_KEYBOARD_HEIGHT_DP,
    Math.min(
      MAX_KEYBOARD_HEIGHT_DP,
      Math.round(baseHeightDp + clampedOffset),
    ),
  );
}
