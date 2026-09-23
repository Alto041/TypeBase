/** True while the keyboard is in device landscape (compact typing profile). */
let landscapeTypingProfileActive = false;

/**
 * Landscape defers suggestion bar + native suggestion traffic while typing;
 * flushes once on idle so the JS thread stays free for key input.
 */

export function setLandscapeTypingProfile(active: boolean): void {
  landscapeTypingProfileActive = active;
}

export function isLandscapeTypingProfile(): boolean {
  return landscapeTypingProfileActive;
}
