export type OneHandSide = 'left' | 'center' | 'right';

export type OneHandSettings = {
  /** When false, keyboard sits centered (normal). */
  enabled: boolean;
  /** Which side the keyboard content aligns to. */
  side: OneHandSide;
  /** 0..1 how much to shrink toward the chosen edge (0 = barely, 1 = max). */
  strength: number;
};

export const DEFAULT_ONE_HAND_SETTINGS: OneHandSettings = {
  enabled: false,
  side: 'right',
  strength: 0.55,
};

/**
 * Max fraction of viewport width reserved as empty space on the far side.
 * At strength 1, keys use (1 - this) of the width.
 */
export const ONE_HAND_MAX_SHRINK_RATIO = 0.36;

/** Soft floor so keys never become unusably tiny. */
export const ONE_HAND_MIN_WIDTH_RATIO = 0.62;
