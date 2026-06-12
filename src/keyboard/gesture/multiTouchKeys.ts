import type {KeyDefinition} from '../layouts/qwerty';
import {triggerKeyHaptic} from '../haptics';
import {markSwipeTypingTapCommitted} from './gestureState';
import type {KeyBounds} from './types';

const pressVisualHandlers = new Map<string, (pressed: boolean) => void>();

export function pointerIdFromTouch(touch: {identifier: number | string}): number {
  return typeof touch.identifier === 'number'
    ? touch.identifier
    : Number(touch.identifier);
}

/** Letter/digit keys handled by the multi-touch router (not Pressable). */
export function isMultiTouchTextKey(keyDef: KeyDefinition): boolean {
  if (!keyDef.value || keyDef.type === 'spacer') {
    return false;
  }
  switch (keyDef.type) {
    case 'space':
    case 'shift':
    case 'backspace':
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

export function hitTestKey(
  localX: number,
  localY: number,
  layouts: readonly KeyBounds[],
): KeyBounds | null {
  for (let index = layouts.length - 1; index >= 0; index -= 1) {
    const layout = layouts[index];
    if (
      localX >= layout.x &&
      localX <= layout.x + layout.width &&
      localY >= layout.y &&
      localY <= layout.y + layout.height
    ) {
      return layout;
    }
  }
  return null;
}

export function registerMultiTouchKeyVisual(
  id: string,
  handler: (pressed: boolean) => void,
): () => void {
  pressVisualHandlers.set(id, handler);
  return () => {
    pressVisualHandlers.delete(id);
  };
}

export function setMultiTouchKeyPressed(id: string, pressed: boolean): void {
  pressVisualHandlers.get(id)?.(pressed);
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
