import type {KeyDefinition} from '../layouts/qwerty';
import {triggerKeyHaptic} from '../haptics';
import {KEY_HIT_SLOP} from '../theme';
import {markSwipeTypingTapCommitted} from './gestureState';
import type {KeyBounds} from './types';

/** Half the visual gap between keys — matches theme keyGap / keyRowMargin. */
export type KeyHitSlop = {
  horizontal: number;
  vertical: number;
};

export const DEFAULT_KEY_HIT_SLOP: KeyHitSlop = KEY_HIT_SLOP;

const pressVisualHandlers = new Map<string, (pressed: boolean) => void>();
const keyPressCounts = new Map<string, number>();
const keyReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Keep pressed visuals visible long enough to paint between fast taps. */
const MIN_PRESS_VISIBLE_MS = 90;

export function pointerIdFromTouch(touch: {identifier: number | string}): number {
  return typeof touch.identifier === 'number'
    ? touch.identifier
    : Number(touch.identifier);
}

/** Comma/period — Pressable-only keys (long-press launcher / rewrite). */
export function isGesturePunctuationKey(keyDef: KeyDefinition): boolean {
  return keyDef.type === 'comma' || keyDef.type === 'period';
}

/** Letter/digit keys handled by the multi-touch router (not Pressable). */
export function isMultiTouchTextKey(keyDef: KeyDefinition): boolean {
  if (!keyDef.value || keyDef.type === 'spacer') {
    return false;
  }
  if (isGesturePunctuationKey(keyDef)) {
    return false;
  }
  switch (keyDef.type) {
    case 'space':
    case 'shift':
    case 'backspace':
    case 'comma':
    case 'period':
    case 'enter':
    case 'enter-backspace':
    case 'numbers':
    case 'symbols':
    case 'letters':
    case 'numpad-back':
    case 'essentials-back':
    case 'essentials-save':
      return false;
    default:
      return true;
  }
}

function expandedBounds(layout: KeyBounds, slop: KeyHitSlop) {
  return {
    left: layout.x - slop.horizontal,
    right: layout.x + layout.width + slop.horizontal,
    top: layout.y - slop.vertical,
    bottom: layout.y + layout.height + slop.vertical,
  };
}

/** Nearest-key hit test with gap slop (Gboard-style taps between keys/rows). */
export function hitTestKey(
  localX: number,
  localY: number,
  layouts: readonly KeyBounds[],
  slop: KeyHitSlop = DEFAULT_KEY_HIT_SLOP,
): KeyBounds | null {
  let strictMatch: KeyBounds | null = null;
  let smallestArea = Infinity;

  for (let index = layouts.length - 1; index >= 0; index -= 1) {
    const layout = layouts[index];
    const inside =
      localX >= layout.x &&
      localX <= layout.x + layout.width &&
      localY >= layout.y &&
      localY <= layout.y + layout.height;

    if (!inside) {
      continue;
    }

    const area = layout.width * layout.height;
    if (area < smallestArea) {
      smallestArea = area;
      strictMatch = layout;
    }
  }

  if (strictMatch) {
    return strictMatch;
  }

  let gapMatch: KeyBounds | null = null;
  let nearestCenter = Infinity;

  for (const layout of layouts) {
    const bounds = expandedBounds(layout, slop);
    if (
      localX < bounds.left ||
      localX > bounds.right ||
      localY < bounds.top ||
      localY > bounds.bottom
    ) {
      continue;
    }

    const centerDistance = Math.hypot(
      localX - layout.centerX,
      localY - layout.centerY,
    );
    if (centerDistance < nearestCenter) {
      nearestCenter = centerDistance;
      gapMatch = layout;
    }
  }

  return gapMatch;
}

/** True when a touch lies in a Pressable-only key zone (blocks multi-touch dispatch). */
export function touchHitsPressableOnlyKey(
  localX: number,
  localY: number,
  layouts: readonly KeyBounds[],
  slop: KeyHitSlop = DEFAULT_KEY_HIT_SLOP,
): boolean {
  for (const layout of layouts) {
    if (!isGesturePunctuationKey(layout.keyDef)) {
      continue;
    }
    const bounds = expandedBounds(layout, slop);
    if (
      localX >= bounds.left &&
      localX <= bounds.right &&
      localY >= bounds.top &&
      localY <= bounds.bottom
    ) {
      return true;
    }
  }
  return false;
}

function applyKeyPressedVisual(id: string, pressed: boolean): void {
  pressVisualHandlers.get(id)?.(pressed);
}

function clearKeyReleaseTimer(id: string): void {
  const timer = keyReleaseTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    keyReleaseTimers.delete(id);
  }
}

export function registerMultiTouchKeyVisual(
  id: string,
  handler: (pressed: boolean) => void,
): () => void {
  pressVisualHandlers.set(id, handler);
  return () => {
    pressVisualHandlers.delete(id);
    keyPressCounts.delete(id);
    clearKeyReleaseTimer(id);
    handler(false);
  };
}

export function setMultiTouchKeyPressed(id: string, pressed: boolean): void {
  if (pressed) {
    clearKeyReleaseTimer(id);
    const count = (keyPressCounts.get(id) ?? 0) + 1;
    keyPressCounts.set(id, count);
    if (count === 1) {
      applyKeyPressedVisual(id, true);
    }
    return;
  }

  const count = Math.max(0, (keyPressCounts.get(id) ?? 0) - 1);
  if (count === 0) {
    keyPressCounts.delete(id);
  } else {
    keyPressCounts.set(id, count);
    return;
  }

  clearKeyReleaseTimer(id);
  keyReleaseTimers.set(
    id,
    setTimeout(() => {
      keyReleaseTimers.delete(id);
      if ((keyPressCounts.get(id) ?? 0) === 0) {
        applyKeyPressedVisual(id, false);
      }
    }, MIN_PRESS_VISIBLE_MS),
  );
}

type DispatchMultiTouchOptions = {
  onKeyPress: (keyDef: KeyDefinition) => void;
  getLayouts: () => KeyBounds[];
  areaOrigin: {pageX: number; pageY: number};
  swipeTypingEnabled: boolean;
};

type TouchLike = {
  identifier: number | string;
  pageX: number;
  pageY: number;
  timestamp?: number;
};

export function dispatchMultiTouchStart(
  changedTouches: ReadonlyArray<TouchLike>,
  pointerToKeyId: Map<number, string>,
  options: DispatchMultiTouchOptions,
): void {
  const layouts = options.getLayouts();
  if (layouts.length === 0) {
    return;
  }

  const touches = [...changedTouches].sort(
    (left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0),
  );

  for (const touch of touches) {
    const pid = pointerIdFromTouch(touch);
    if (pointerToKeyId.has(pid)) {
      continue;
    }

    const localX = touch.pageX - options.areaOrigin.pageX;
    const localY = touch.pageY - options.areaOrigin.pageY;
    if (touchHitsPressableOnlyKey(localX, localY, layouts)) {
      continue;
    }
    const hit = hitTestKey(localX, localY, layouts);
    if (!hit || !isMultiTouchTextKey(hit.keyDef)) {
      continue;
    }

    pointerToKeyId.set(pid, hit.id);
    if (options.swipeTypingEnabled) {
      markSwipeTypingTapCommitted(pid);
    }
    setMultiTouchKeyPressed(hit.id, true);
    options.onKeyPress(hit.keyDef);
    triggerKeyHaptic();
  }
}

export function dispatchMultiTouchEnd(
  changedTouches: ReadonlyArray<{identifier: number | string}>,
  pointerToKeyId: Map<number, string>,
): void {
  for (const touch of changedTouches) {
    const pid = pointerIdFromTouch(touch);
    const keyId = pointerToKeyId.get(pid);
    if (!keyId) {
      continue;
    }
    pointerToKeyId.delete(pid);
    setMultiTouchKeyPressed(keyId, false);
  }
}
