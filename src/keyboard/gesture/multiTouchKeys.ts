import {hideKeyPreview} from '../KeyPreview';
import {
  computeAlternatePopupGeometry,
  getKeyAlternates,
  hitTestAlternateIndex,
  type AlternatePopupGeometry,
} from '../keyAlternates';
import type {KeyboardLayout} from '../layouts/qwerty';
import type {KeyDefinition} from '../layouts/qwerty';
import {triggerKeyHaptic} from '../haptics';
import {KEY_HIT_SLOP} from '../theme';
import type {KeyBounds} from './types';

/** Half the visual gap between keys — matches theme keyGap / keyRowMargin. */
export type KeyHitSlop = {
  horizontal: number;
  vertical: number;
};

export const DEFAULT_KEY_HIT_SLOP: KeyHitSlop = KEY_HIT_SLOP;

const LONG_PRESS_MS = 350;
const POPUP_CELL_SIZE = 44;

const pressVisualHandlers = new Map<string, (pressed: boolean) => void>();

type MultiTouchSession = {
  keyId: string;
  keyDef: KeyDefinition;
  alternates: string[];
  phase: 'holding' | 'popup';
  selectedIndex: number;
  geometry: AlternatePopupGeometry | null;
  longPressTimer: ReturnType<typeof setTimeout> | null;
};

const activeSessions = new Map<number, MultiTouchSession>();

export type AlternatePopupState = {
  alternates: string[];
  selectedIndex: number;
  geometry: AlternatePopupGeometry;
};

type PopupListener = (popup: AlternatePopupState | null) => void;
let popupListener: PopupListener | null = null;

export function setAlternatePopupListener(listener: PopupListener | null): void {
  popupListener = listener;
}

function notifyPopup(session: MultiTouchSession | null) {
  if (!session || session.phase !== 'popup' || !session.geometry) {
    popupListener?.(null);
    return;
  }
  popupListener?.({
    alternates: session.alternates,
    selectedIndex: session.selectedIndex,
    geometry: session.geometry,
  });
}

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

export function hasActiveAlternatePopup(): boolean {
  for (const session of activeSessions.values()) {
    if (session.phase === 'popup') {
      return true;
    }
  }
  return false;
}

export function isPointerInAlternatePopup(pointerId: number): boolean {
  const session = activeSessions.get(pointerId);
  return session?.phase === 'popup';
}

function clearSessionTimer(session: MultiTouchSession) {
  if (session.longPressTimer) {
    clearTimeout(session.longPressTimer);
    session.longPressTimer = null;
  }
}

function finishSession(
  pointerId: number,
  session: MultiTouchSession,
  onKeyCommit: (keyDef: KeyDefinition, text: string) => void,
) {
  clearSessionTimer(session);
  const text =
    session.alternates[session.selectedIndex] ??
    session.alternates[0] ??
    session.keyDef.value ??
    '';
  onKeyCommit(session.keyDef, text);
  triggerKeyHaptic();
  setMultiTouchKeyPressed(session.keyId, false);
  hideKeyPreview();
  activeSessions.delete(pointerId);
  notifyPopup(null);
}

type DispatchMultiTouchOptions = {
  onKeyCommit: (keyDef: KeyDefinition, text: string) => void;
  getLayouts: () => KeyBounds[];
  areaOrigin: {pageX: number; pageY: number};
  areaWidth: number;
  keyboardLayout: KeyboardLayout;
  isUppercase: boolean;
  hitSlop?: KeyHitSlop;
};

type TouchLike = {
  identifier: number | string;
  pageX: number;
  pageY: number;
  timestamp?: number;
};

function openAlternatePopup(
  pointerId: number,
  session: MultiTouchSession,
  hit: KeyBounds,
  areaWidth: number,
) {
  session.phase = 'popup';
  session.selectedIndex = 0;
  session.geometry = computeAlternatePopupGeometry(
    hit,
    session.alternates.length,
    POPUP_CELL_SIZE,
    areaWidth,
  );
  hideKeyPreview();
  triggerKeyHaptic();
  notifyPopup(session);
}

export function dispatchMultiTouchStart(
  changedTouches: ReadonlyArray<TouchLike>,
  pointerToKeyId: Map<number, string>,
  options: DispatchMultiTouchOptions,
): void {
  const layouts = options.getLayouts();
  if (layouts.length === 0) {
    return;
  }

  const hitSlop = options.hitSlop ?? DEFAULT_KEY_HIT_SLOP;

  const touches = [...changedTouches].sort(
    (left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0),
  );

  for (const touch of touches) {
    const pid = pointerIdFromTouch(touch);
    if (pointerToKeyId.has(pid) || activeSessions.has(pid)) {
      continue;
    }

    const localX = touch.pageX - options.areaOrigin.pageX;
    const localY = touch.pageY - options.areaOrigin.pageY;
    if (touchHitsPressableOnlyKey(localX, localY, layouts, hitSlop)) {
      continue;
    }
    const hit = hitTestKey(localX, localY, layouts, hitSlop);
    if (!hit || !isMultiTouchTextKey(hit.keyDef)) {
      continue;
    }

    const alternates = getKeyAlternates(
      hit.keyDef,
      options.keyboardLayout,
      options.isUppercase,
    );
    const resolvedAlternates =
      alternates.length > 0
        ? alternates
        : [
            options.isUppercase
              ? (hit.keyDef.value ?? '').toUpperCase()
              : (hit.keyDef.value ?? '').toLowerCase(),
          ];

    pointerToKeyId.set(pid, hit.id);
    setMultiTouchKeyPressed(hit.id, true);

    const session: MultiTouchSession = {
      keyId: hit.id,
      keyDef: hit.keyDef,
      alternates: resolvedAlternates,
      phase: 'holding',
      selectedIndex: 0,
      geometry: null,
      longPressTimer: null,
    };

    if (alternates.length > 1) {
      session.longPressTimer = setTimeout(() => {
        session.longPressTimer = null;
        openAlternatePopup(pid, session, hit, options.areaWidth);
      }, LONG_PRESS_MS);
    }

    activeSessions.set(pid, session);
  }
}

export function dispatchMultiTouchMove(
  touches: ReadonlyArray<TouchLike>,
  options: Pick<DispatchMultiTouchOptions, 'areaOrigin'>,
): void {
  for (const touch of touches) {
    const pid = pointerIdFromTouch(touch);
    const session = activeSessions.get(pid);
    if (!session || session.phase !== 'popup' || !session.geometry) {
      continue;
    }

    const localX = touch.pageX - options.areaOrigin.pageX;
    const localY = touch.pageY - options.areaOrigin.pageY;
    const nextIndex = hitTestAlternateIndex(
      localX,
      localY,
      session.geometry,
      session.alternates.length,
    );
    if (nextIndex !== session.selectedIndex) {
      session.selectedIndex = nextIndex;
      triggerKeyHaptic();
      notifyPopup(session);
    }
  }
}

export function dispatchMultiTouchEnd(
  changedTouches: ReadonlyArray<TouchLike>,
  pointerToKeyId: Map<number, string>,
  options: Pick<DispatchMultiTouchOptions, 'onKeyCommit'>,
): void {
  for (const touch of changedTouches) {
    const pid = pointerIdFromTouch(touch);
    const keyId = pointerToKeyId.get(pid);
    const session = activeSessions.get(pid);

    if (session) {
      finishSession(pid, session, options.onKeyCommit);
    } else if (keyId) {
      setMultiTouchKeyPressed(keyId, false);
      hideKeyPreview();
    }

    pointerToKeyId.delete(pid);
  }
}

type SwipeStartCancelHandler = (pointerId: number) => void;
let swipeStartCancelHandler: SwipeStartCancelHandler | null = null;

export function setSwipeStartCancelHandler(
  handler: SwipeStartCancelHandler | null,
): void {
  swipeStartCancelHandler = handler;
}

export function notifySwipeStarted(pointerId: number): void {
  swipeStartCancelHandler?.(pointerId);
}

export function cancelMultiTouchPointer(
  pointerId: number,
  pointerToKeyId: Map<number, string>,
): void {
  const session = activeSessions.get(pointerId);
  if (session) {
    clearSessionTimer(session);
    setMultiTouchKeyPressed(session.keyId, false);
    hideKeyPreview();
    activeSessions.delete(pointerId);
    notifyPopup(null);
  }
  const keyId = pointerToKeyId.get(pointerId);
  if (keyId) {
    setMultiTouchKeyPressed(keyId, false);
    hideKeyPreview();
    pointerToKeyId.delete(pointerId);
  }
}

export function cancelAllMultiTouchSessions(): void {
  for (const session of activeSessions.values()) {
    clearSessionTimer(session);
    setMultiTouchKeyPressed(session.keyId, false);
  }
  activeSessions.clear();
  hideKeyPreview();
  notifyPopup(null);
}
