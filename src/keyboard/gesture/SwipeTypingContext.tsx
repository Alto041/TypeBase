import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {PixelRatio, View, type GestureResponderEvent} from 'react-native';
import {triggerKeyHaptic} from '../haptics';
import {keyboardBridge} from '../keyboardBridge';
import {clampPoint, decimatePoints, distance} from './coordinates';
import {decodeSwipeGesture} from './gestureDecoder';
import {ensureLearnedDictionaryLoaded} from '../suggestions/learnedDictionary';
import {isValidSwipeCommit} from './wordDictionary';
import {
  gestureSwipeActiveRef,
  swipeTypingSessionRef,
} from './gestureState';
import {
  useKeyLayoutContext,
  type KeyLayoutContextValue,
} from './KeyLayoutContext';
import {measureKeysArea} from './measureKeysArea';
import {SwipeTrail} from './SwipeTrail';
import type {Point, TrailPoint} from './types';

/** Finger movement below this is treated as a tap, not a swipe. */
const SWIPE_TAP_SLOP_DP = 10;
const SWIPE_MIN_STEP_DP = 1.5;
const SWIPE_MAX_POINTS = 240;

type PagePoint = {pageX: number; pageY: number};

type SwipeSession = {
  rawStartX: number;
  rawStartY: number;
  isSwiping: boolean;
};

type SwipeTypingContextValue = {
  enabled: boolean;
  trailPoints: TrailPoint[];
  trailFading: boolean;
  trailWidth: number;
  trailHeight: number;
  onTrailFadeComplete: () => void;
  onTouchStartCapture: (event: GestureResponderEvent) => void;
  onTouchMoveCapture: (event: GestureResponderEvent) => void;
  onTouchEndCapture: (event: GestureResponderEvent) => void;
};

const SwipeTypingContext = createContext<SwipeTypingContextValue | null>(null);

function dp(value: number): number {
  return value * PixelRatio.get();
}

function touchIsOnLetterKey(
  pageX: number,
  pageY: number,
  layoutContext: KeyLayoutContextValue | null,
): boolean {
  if (!layoutContext) {
    return false;
  }

  const origin = layoutContext.areaOriginRef.current;
  const localX = pageX - origin.pageX;
  const localY = pageY - origin.pageY;

  for (const layout of layoutContext.getLayouts()) {
    if (!layout.letter) {
      continue;
    }
    if (
      localX >= layout.x &&
      localX <= layout.x + layout.width &&
      localY >= layout.y &&
      localY <= layout.y + layout.height
    ) {
      return true;
    }
  }

  return false;
}

function decimateTrailPoints(
  points: TrailPoint[],
  maxCount: number,
): TrailPoint[] {
  if (points.length <= maxCount) {
    return points;
  }

  const simplified = decimatePoints(
    points.map(point => ({x: point.x, y: point.y})),
    maxCount,
  );
  return simplified.map(point => {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < points.length; index++) {
      const dx = points[index].x - point.x;
      const dy = points[index].y - point.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = index;
      }
    }
    return points[bestIndex];
  });
}

function pathDistance(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

function releaseSwipeKeyBlock(onReleased?: () => void) {
  gestureSwipeActiveRef.current = true;
  swipeTypingSessionRef.blockKeyPress = true;
  setTimeout(() => {
    gestureSwipeActiveRef.current = false;
    swipeTypingSessionRef.blockKeyPress = false;
    swipeTypingSessionRef.touchActive = false;
    swipeTypingSessionRef.isSwiping = false;
    onReleased?.();
  }, 45);
}

type SwipeTypingProviderProps = {
  enabled: boolean;
  isUppercase: boolean;
  onWordCommitted: (word: string) => void;
  children: React.ReactNode;
};

export function SwipeTypingProvider({
  enabled,
  isUppercase,
  onWordCommitted,
  children,
}: SwipeTypingProviderProps) {
  const layoutContext = useKeyLayoutContext();
  const pagePointsRef = useRef<PagePoint[]>([]);
  const localPointsRef = useRef<Point[]>([]);
  const sessionRef = useRef<SwipeSession | null>(null);
  const trailOriginRef = useRef({pageX: 0, pageY: 0});
  const trailSizeRef = useRef({width: 0, height: 0});
  const [trailPoints, setTrailPoints] = useState<TrailPoint[]>([]);
  const [trailFading, setTrailFading] = useState(false);

  const clearTrail = useCallback(() => {
    setTrailPoints([]);
    setTrailFading(false);
  }, []);

  const onTrailFadeComplete = useCallback(() => {
    clearTrail();
  }, [clearTrail]);

  const syncTrailBounds = useCallback(
    (callback?: () => void) => {
      const keysArea = layoutContext?.keysAreaRef.current;
      if (!keysArea) {
        callback?.();
        return;
      }

      measureKeysArea(keysArea, bounds => {
        trailOriginRef.current = {pageX: bounds.pageX, pageY: bounds.pageY};
        trailSizeRef.current = {width: bounds.width, height: bounds.height};
        if (layoutContext?.areaOriginRef) {
          layoutContext.areaOriginRef.current = {
            pageX: bounds.pageX,
            pageY: bounds.pageY,
          };
        }
        callback?.();
      });
    },
    [layoutContext],
  );

  const pageToTrailLocal = useCallback(
    (pageX: number, pageY: number): Point => {
      const origin = layoutContext?.areaOriginRef.current ?? trailOriginRef.current;
      const width =
        layoutContext?.areaBounds.width ?? trailSizeRef.current.width;
      const height =
        layoutContext?.areaBounds.height ?? trailSizeRef.current.height;
      return clampPoint(
        {x: pageX - origin.pageX, y: pageY - origin.pageY},
        width,
        height,
      );
    },
    [layoutContext],
  );

  const appendSwipePoint = useCallback(
    (pageX: number, pageY: number) => {
      const local = pageToTrailLocal(pageX, pageY);
      const points = localPointsRef.current;
      const minDistance = dp(SWIPE_MIN_STEP_DP);
      if (points.length > 0) {
        const last = points[points.length - 1];
        const dx = local.x - last.x;
        const dy = local.y - last.y;
        if (dx * dx + dy * dy < minDistance * minDistance) {
          return local;
        }
      }
      appendPagePoint(pageX, pageY);
      const nextPoints = decimatePoints([...points, local], SWIPE_MAX_POINTS);
      localPointsRef.current = nextPoints;
      const timestampMs = Date.now();
      setTrailPoints(current =>
        decimateTrailPoints([...current, {...local, timestampMs}], SWIPE_MAX_POINTS),
      );
      return local;
    },
    [appendPagePoint, pageToTrailLocal],
  );

  const appendPagePoint = useCallback((pageX: number, pageY: number) => {
    const points = pagePointsRef.current;
    const minDistance = dp(SWIPE_MIN_STEP_DP);

    if (points.length > 0) {
      const last = points[points.length - 1];
      const dx = pageX - last.pageX;
      const dy = pageY - last.pageY;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        return;
      }
    }

    pagePointsRef.current = decimatePoints([...points, {pageX, pageY}], SWIPE_MAX_POINTS);
  }, []);

  const decodeAndCommit = useCallback(
    (localPoints: Point[]) => {
      const attemptDecode = (retriesLeft: number) => {
        const layouts = layoutContext?.getLayouts() ?? [];
        const letterKeyCount = layouts.filter(layout => layout.letter).length;

        if (letterKeyCount < 20 && retriesLeft > 0) {
          layoutContext?.refreshAreaBounds();
          requestAnimationFrame(() => attemptDecode(retriesLeft - 1));
          return;
        }

        if (
          localPoints.length < 2 ||
          pathDistance(localPoints) < dp(SWIPE_TAP_SLOP_DP)
        ) {
          releaseSwipeKeyBlock();
          return;
        }

        const word = decodeSwipeGesture(localPoints, layouts, isUppercase);
        if (word && isValidSwipeCommit(word)) {
          if (swipeTypingSessionRef.tapCommitted) {
            keyboardBridge.deleteBackward();
            swipeTypingSessionRef.tapCommitted = false;
          }
          triggerKeyHaptic();
          onWordCommitted(word);
        }
        releaseSwipeKeyBlock();
      };

      void ensureLearnedDictionaryLoaded().then(() => {
        attemptDecode(3);
      });
    },
    [isUppercase, layoutContext, onWordCommitted],
  );

  const finishSwipe = useCallback(
    (wasSwiping: boolean, endPageX?: number, endPageY?: number) => {
      if (wasSwiping) {
        swipeTypingSessionRef.blockKeyPress = true;
        if (endPageX != null && endPageY != null) {
          const lastPage = pagePointsRef.current[pagePointsRef.current.length - 1];
          const endJump = lastPage
            ? Math.hypot(endPageX - lastPage.pageX, endPageY - lastPage.pageY)
            : 0;
          if (!lastPage || endJump < dp(48)) {
            appendSwipePoint(endPageX, endPageY);
          }
        }
        const localPoints = [...localPointsRef.current];
        pagePointsRef.current = [];
        localPointsRef.current = [];
        sessionRef.current = null;
        swipeTypingSessionRef.isSwiping = false;
        setTrailFading(true);
        decodeAndCommit(localPoints);
        return;
      }

      gestureSwipeActiveRef.current = false;
      swipeTypingSessionRef.touchActive = false;
      swipeTypingSessionRef.isSwiping = false;
      swipeTypingSessionRef.blockKeyPress = false;
      swipeTypingSessionRef.tapCommitted = false;
      sessionRef.current = null;
      pagePointsRef.current = [];
      localPointsRef.current = [];
      clearTrail();
    },
    [appendSwipePoint, clearTrail, decodeAndCommit],
  );

  const onTouchStartCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }
      const {pageX, pageY} = event.nativeEvent;
      if (!touchIsOnLetterKey(pageX, pageY, layoutContext)) {
        sessionRef.current = null;
        swipeTypingSessionRef.touchActive = false;
        swipeTypingSessionRef.isSwiping = false;
        swipeTypingSessionRef.blockKeyPress = false;
        swipeTypingSessionRef.tapCommitted = false;
        return;
      }

      layoutContext?.refreshAreaBounds();
      sessionRef.current = {
        rawStartX: pageX,
        rawStartY: pageY,
        isSwiping: false,
      };
      pagePointsRef.current = [];
      localPointsRef.current = [];
      clearTrail();
      syncTrailBounds();
      swipeTypingSessionRef.touchActive = true;
      swipeTypingSessionRef.isSwiping = false;
      swipeTypingSessionRef.blockKeyPress = false;
      swipeTypingSessionRef.tapCommitted = false;
      gestureSwipeActiveRef.current = false;
    },
    [clearTrail, enabled, layoutContext, syncTrailBounds],
  );

  const onTouchMoveCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      const touch = event.nativeEvent.touches[0];
      if (!touch) {
        return;
      }

      if (!session.isSwiping) {
        const dx = touch.pageX - session.rawStartX;
        const dy = touch.pageY - session.rawStartY;
        if (Math.hypot(dx, dy) < dp(SWIPE_TAP_SLOP_DP)) {
          return;
        }
        session.isSwiping = true;
        swipeTypingSessionRef.isSwiping = true;
        swipeTypingSessionRef.blockKeyPress = true;
        if (swipeTypingSessionRef.tapCommitted) {
          keyboardBridge.deleteBackward();
          swipeTypingSessionRef.tapCommitted = false;
        }
        gestureSwipeActiveRef.current = true;
        syncTrailBounds(() => {
          localPointsRef.current = [];
          pagePointsRef.current = [];
          appendSwipePoint(session.rawStartX, session.rawStartY);
          appendSwipePoint(touch.pageX, touch.pageY);
        });
        return;
      }

      appendSwipePoint(touch.pageX, touch.pageY);
    },
    [appendSwipePoint, enabled, syncTrailBounds],
  );

  const onTouchEndCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const wasSwiping = session.isSwiping;
      const {pageX, pageY} = event.nativeEvent;
      finishSwipe(wasSwiping, pageX, pageY);
    },
    [enabled, finishSwipe],
  );

  const trailWidth = layoutContext?.areaBounds.width ?? trailSizeRef.current.width;
  const trailHeight =
    layoutContext?.areaBounds.height ?? trailSizeRef.current.height;

  const value = useMemo(
    () => ({
      enabled,
      trailPoints,
      trailFading,
      trailWidth,
      trailHeight,
      onTrailFadeComplete,
      onTouchStartCapture,
      onTouchMoveCapture,
      onTouchEndCapture,
    }),
    [
      enabled,
      onTrailFadeComplete,
      onTouchEndCapture,
      onTouchMoveCapture,
      onTouchStartCapture,
      trailFading,
      trailHeight,
      trailPoints,
      trailWidth,
    ],
  );

  return (
    <SwipeTypingContext.Provider value={value}>
      {children}
    </SwipeTypingContext.Provider>
  );
}

export function useSwipeTypingContext() {
  return useContext(SwipeTypingContext);
}

export function SwipeTypingKeysHost({children}: {children: React.ReactNode}) {
  const ctx = useContext(SwipeTypingContext);
  const layoutContext = useKeyLayoutContext();

  return (
    <View
      ref={layoutContext?.keysAreaRef}
      onLayout={layoutContext?.onKeysAreaLayout}
      onTouchStartCapture={ctx?.enabled ? ctx.onTouchStartCapture : undefined}
      onTouchMoveCapture={ctx?.enabled ? ctx.onTouchMoveCapture : undefined}
      onTouchEndCapture={ctx?.enabled ? ctx.onTouchEndCapture : undefined}
      onTouchCancelCapture={ctx?.enabled ? ctx.onTouchEndCapture : undefined}
      collapsable={false}>
      {children}
      {ctx?.enabled && ctx.trailWidth > 0 && ctx.trailHeight > 0 ? (
        <SwipeTrail
          points={ctx.trailPoints}
          width={ctx.trailWidth}
          height={ctx.trailHeight}
          fading={ctx.trailFading}
          onFadeComplete={ctx.onTrailFadeComplete}
        />
      ) : null}
    </View>
  );
}
