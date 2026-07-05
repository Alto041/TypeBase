export const gestureSwipeActiveRef = {current: false};

/** Live swipe trail geometry — updated on the touch path, rendered at display refresh rate. */
export const swipeTrailPointsRef = {
  current: [] as Array<{x: number; y: number; timestampMs: number}>,
};

/** Latest finger position (updated every move, even between trail samples). */
export const swipeTrailHeadRef = {current: null as {x: number; y: number} | null};

/** Bumped whenever trail geometry changes so the renderer can skip redundant frames. */
export const swipeTrailRevisionRef = {current: 0};

export type SwipePointerSession = {
  rawStartX: number;
  rawStartY: number;
  isSwiping: boolean;
  tapCommitted: boolean;
};

/** Per-finger sessions so a second finger can tap while the first swipes. */
function pointerKey(id: number | string): number {
  return typeof id === 'number' ? id : Number(id);
}

export const swipePointerSessionsRef = {
  current: new Map<number, SwipePointerSession>(),
};

/** Pointer id currently drawing the swipe trail (at most one). */
export const activeSwipePointerIdRef = {current: null as number | null};

export function markSwipeTypingTapCommitted(pointerId: number | string): void {
  const session = swipePointerSessionsRef.current.get(pointerKey(pointerId));
  if (session) {
    session.tapCommitted = true;
  }
}

/** Never block other fingers — each key commits on touch-down independently. */
export function shouldBlockSwipeTypingKeyInput(): boolean {
  return false;
}
