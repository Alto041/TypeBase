import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {PixelRatio, View, type GestureResponderEvent} from 'react-native';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {keyboardBridge} from '../keyboardBridge';
import {clampPoint, decimatePoints, distance} from './coordinates';
import {decodeSwipeGesture} from './gestureDecoder';
import {ensureLearnedDictionaryLoaded} from '../suggestions/learnedDictionary';
import {isValidSwipeCommit} from './wordDictionary';
import {
  activeSwipePointerIdRef,
  gestureSwipeActiveRef,
  swipePointerSessionsRef,
  type SwipePointerSession,
} from './gestureState';
import {
  useKeyLayoutContext,
  type KeyLayoutContextValue,
} from './KeyLayoutContext';
import {measureKeysArea} from './measureKeysArea';
import {
  cancelMultiTouchPointer,
  dispatchMultiTouchEnd,
  dispatchMultiTouchMove,
  dispatchMultiTouchStart,
  hitTestKey,
  isPointerInAlternatePopup,
  notifySwipeStarted,
  setAlternatePopupListener,
  setSwipeStartCancelHandler,
  touchHitsPressableOnlyKey,
  type AlternatePopupState,
} from './multiTouchKeys';
import {markSwipeTypingTapCommitted} from './gestureState';
import {KeyAlternatePopup} from '../components/KeyAlternatePopup';
import type {KeyboardLayout} from '../layouts/qwerty';
import {SwipeTrail} from './SwipeTrail';
import type {Point, TrailPoint} from './types';
import type {KeyDefinition} from '../layouts/qwerty';

function pointerId(touch: {identifier: number | string}): number {
  return typeof touch.identifier === 'number'
    ? touch.identifier
    : Number(touch.identifier);
}

/** Finger movement below this is treated as a tap, not a swipe. */
const SWIPE_TAP_SLOP_DP = 10;
const SWIPE_MIN_STEP_DP = 1.5;
const SWIPE_MAX_POINTS = 240;

type PagePoint = {pageX: number; pageY: number};

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
  const hit = hitTestKey(localX, localY, layoutContext.getLayouts());
  return Boolean(hit?.letter);
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
  const trailOriginRef = useRef({pageX: 0, pageY: 0});
  const trailSizeRef = useRef({width: 0, height: 0});
  const [trailPoints, setTrailPoints] = useState<TrailPoint[]>([]);
  const [trailFading, setTrailFading] = useState(false);

  const clearTrail = useCallback(() => {
    setTrailPoints([]);
    setTrailFading(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      return;
    }
    swipePointerSessionsRef.current.clear();
    activeSwipePointerIdRef.current = null;
    gestureSwipeActiveRef.current = false;
    pagePointsRef.current = [];
    localPointsRef.current = [];
    clearTrail();
  }, [clearTrail, enabled]);

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
    (localPoints: Point[], tapCommitted: boolean) => {
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
          return;
        }

        const word = decodeSwipeGesture(localPoints, layouts, isUppercase);
        if (word && isValidSwipeCommit(word)) {
          if (tapCommitted) {
            keyboardBridge.deleteBackward();
          }
          triggerKeyHaptic();
          onWordCommitted(word);
        }
      };

      void ensureLearnedDictionaryLoaded().then(() => {
        attemptDecode(3);
      });
    },
    [isUppercase, layoutContext, onWordCommitted],
  );

  const beginSwipeTrail = useCallback(
    (session: SwipePointerSession, pageX: number, pageY: number) => {
      gestureSwipeActiveRef.current = true;
      syncTrailBounds(() => {
        localPointsRef.current = [];
        pagePointsRef.current = [];
        appendSwipePoint(session.rawStartX, session.rawStartY);
        appendSwipePoint(pageX, pageY);
      });
    },
    [appendSwipePoint, syncTrailBounds],
  );

  const finishPointerSession = useCallback(
    (
      pointerId: number,
      session: SwipePointerSession,
      endPageX: number,
      endPageY: number,
    ) => {
      if (session.isSwiping && activeSwipePointerIdRef.current === pointerId) {
        const lastPage = pagePointsRef.current[pagePointsRef.current.length - 1];
        const endJump = lastPage
          ? Math.hypot(endPageX - lastPage.pageX, endPageY - lastPage.pageY)
          : 0;
        if (!lastPage || endJump < dp(48)) {
          appendSwipePoint(endPageX, endPageY);
        }
        const localPoints = [...localPointsRef.current];
        const tapCommitted = session.tapCommitted;
        pagePointsRef.current = [];
        localPointsRef.current = [];
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        setTrailFading(true);
        decodeAndCommit(localPoints, tapCommitted);
        return;
      }

      if (activeSwipePointerIdRef.current === pointerId) {
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        pagePointsRef.current = [];
        localPointsRef.current = [];
        clearTrail();
      }
    },
    [appendSwipePoint, clearTrail, decodeAndCommit],
  );

  const onTouchStartCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }

      const layouts = layoutContext?.getLayouts() ?? [];
      const origin = layoutContext?.areaOriginRef.current ?? {pageX: 0, pageY: 0};

      for (const touch of event.nativeEvent.changedTouches) {
        const localX = touch.pageX - origin.pageX;
        const localY = touch.pageY - origin.pageY;
        if (touchHitsPressableOnlyKey(localX, localY, layouts)) {
          continue;
        }
        if (!touchIsOnLetterKey(touch.pageX, touch.pageY, layoutContext)) {
          continue;
        }
        swipePointerSessionsRef.current.set(pointerId(touch), {
          rawStartX: touch.pageX,
          rawStartY: touch.pageY,
          isSwiping: false,
          tapCommitted: false,
        });
      }
    },
    [enabled, layoutContext],
  );

  const onTouchMoveCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }

      for (const touch of event.nativeEvent.touches) {
        const id = pointerId(touch);
        const session = swipePointerSessionsRef.current.get(id);
        if (!session) {
          continue;
        }

        if (session.isSwiping) {
          if (activeSwipePointerIdRef.current === id) {
            appendSwipePoint(touch.pageX, touch.pageY);
          }
          continue;
        }

        if (isPointerInAlternatePopup(id)) {
          continue;
        }

        const dx = touch.pageX - session.rawStartX;
        const dy = touch.pageY - session.rawStartY;
        if (Math.hypot(dx, dy) < dp(SWIPE_TAP_SLOP_DP)) {
          continue;
        }

        session.isSwiping = true;
        activeSwipePointerIdRef.current = id;
        notifySwipeStarted(id);
        beginSwipeTrail(session, touch.pageX, touch.pageY);
      }
    },
    [appendSwipePoint, beginSwipeTrail, enabled],
  );

  const onTouchEndCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!enabled) {
        return;
      }

      for (const touch of event.nativeEvent.changedTouches) {
        const id = pointerId(touch);
        const session = swipePointerSessionsRef.current.get(id);
        if (!session) {
          continue;
        }
        finishPointerSession(id, session, touch.pageX, touch.pageY);
        swipePointerSessionsRef.current.delete(id);
      }
    },
    [enabled, finishPointerSession],
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

type SwipeTypingKeysHostProps = {
  children: React.ReactNode;
  multiTouchEnabled?: boolean;
  keyboardLayout?: KeyboardLayout;
  isUppercase?: boolean;
  getIsUppercase?: () => boolean;
  onMultiTouchKeyCommit?: (keyDef: KeyDefinition, text: string) => void;
};

export function SwipeTypingKeysHost({
  children,
  multiTouchEnabled = false,
  keyboardLayout = 'letters',
  isUppercase = false,
  getIsUppercase,
  onMultiTouchKeyCommit,
}: SwipeTypingKeysHostProps) {
  const ctx = useContext(SwipeTypingContext);
  const layoutContext = useKeyLayoutContext();
  const theme = useKeyboardTheme();
  const pointerToKeyRef = useRef(new Map<number, string>());
  const keyHitSlop = theme.keyHitSlop;
  const [alternatePopup, setAlternatePopup] = useState<AlternatePopupState | null>(
    null,
  );

  useEffect(() => {
    if (!multiTouchEnabled) {
      setAlternatePopupListener(null);
      setSwipeStartCancelHandler(null);
      setAlternatePopup(null);
      return;
    }
    setAlternatePopupListener(setAlternatePopup);
    setSwipeStartCancelHandler(pointerId => {
      cancelMultiTouchPointer(pointerId, pointerToKeyRef.current);
    });
    return () => {
      setAlternatePopupListener(null);
      setSwipeStartCancelHandler(null);
      setAlternatePopup(null);
    };
  }, [multiTouchEnabled]);

  const handleTouchStartCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (!layoutContext) {
        ctx?.onTouchStartCapture?.(event);
        return;
      }

      const layouts = layoutContext.getLayouts();
      const origin = layoutContext.areaOriginRef.current;
      const passThroughTouches = event.nativeEvent.changedTouches.filter(
        touch => {
          const localX = touch.pageX - origin.pageX;
          const localY = touch.pageY - origin.pageY;
          return !touchHitsPressableOnlyKey(localX, localY, layouts, keyHitSlop);
        },
      );

      if (passThroughTouches.length > 0) {
        ctx?.onTouchStartCapture?.(event);
      }

      if (
        multiTouchEnabled &&
        onMultiTouchKeyCommit &&
        passThroughTouches.length > 0
      ) {
        dispatchMultiTouchStart(passThroughTouches, pointerToKeyRef.current, {
          onKeyCommit: onMultiTouchKeyCommit,
          getLayouts: layoutContext.getLayouts,
          areaOrigin: origin,
          areaWidth: layoutContext.areaBounds.width,
          keyboardLayout,
          getIsUppercase: getIsUppercase ?? (() => isUppercase),
          hitSlop: keyHitSlop,
        });
      }
    },
    [
      ctx,
      getIsUppercase,
      isUppercase,
      keyHitSlop,
      keyboardLayout,
      layoutContext,
      multiTouchEnabled,
      onMultiTouchKeyCommit,
    ],
  );

  const handleTouchMoveCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (multiTouchEnabled && layoutContext) {
        dispatchMultiTouchMove(event.nativeEvent.touches, {
          areaOrigin: layoutContext.areaOriginRef.current,
        });
      }
      ctx?.onTouchMoveCapture?.(event);
    },
    [ctx, layoutContext, multiTouchEnabled],
  );

  const handleTouchEndCapture = useCallback(
    (event: GestureResponderEvent) => {
      if (multiTouchEnabled && onMultiTouchKeyCommit) {
        dispatchMultiTouchEnd(
          event.nativeEvent.changedTouches,
          pointerToKeyRef.current,
          {onKeyCommit: onMultiTouchKeyCommit},
        );
      }
      ctx?.onTouchEndCapture?.(event);
    },
    [ctx, multiTouchEnabled, onMultiTouchKeyCommit],
  );

  const usesTouchCapture = multiTouchEnabled || Boolean(ctx?.enabled);

  return (
    <View
      ref={layoutContext?.keysAreaRef}
      onLayout={layoutContext?.onKeysAreaLayout}
      onStartShouldSetResponderCapture={() => false}
      onMoveShouldSetResponderCapture={() => false}
      onTouchStartCapture={usesTouchCapture ? handleTouchStartCapture : undefined}
      onTouchMoveCapture={usesTouchCapture ? handleTouchMoveCapture : undefined}
      onTouchEndCapture={usesTouchCapture ? handleTouchEndCapture : undefined}
      onTouchCancelCapture={usesTouchCapture ? handleTouchEndCapture : undefined}
      collapsable={false}>
      {children}
      <KeyAlternatePopup popup={alternatePopup} />
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
