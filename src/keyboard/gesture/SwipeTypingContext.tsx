import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {PixelRatio, Platform, View, type GestureResponderEvent} from 'react-native';
import {triggerKeyHaptic} from '../haptics';
import {useKeyboardTheme} from '../KeyboardThemeContext';
import {keyboardBridge} from '../keyboardBridge';
import {hideAllKeyPreviews} from '../KeyPreview';
import {clampPoint, decimatePoints, distance} from './coordinates';
import {decodeSwipeGesture} from './gestureDecoder';
import {ensureLearnedDictionaryLoaded} from '../suggestions/learnedDictionary';
import {
  activeSwipePointerIdRef,
  gestureSwipeActiveRef,
  swipePointerSessionsRef,
  swipeTrailHeadRef,
  swipeTrailPointsRef,
  swipeTrailRevisionRef,
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
import type {KeyBounds, Point} from './types';
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
const SWIPE_PREVIEW_INTERVAL_MS = 160;
const TRAIL_MIN_STEP_DP = 1.15;

function keyLayoutsToJson(layouts: KeyBounds[]): string {
  return JSON.stringify(
    layouts.map(layout => ({
      letter: layout.letter ?? '',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      centerX: layout.centerX,
      centerY: layout.centerY,
    })),
  );
}

type PagePoint = {pageX: number; pageY: number};

type SwipeTypingContextValue = {
  enabled: boolean;
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

function pathDistance(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (!from || !to) {
      continue;
    }
    total += distance(from, to);
  }
  return total;
}

type SwipeTypingProviderProps = {
  enabled: boolean;
  isUppercase: boolean;
  onWordCommitted: (word: string) => void;
  onSwipePreviewChange?: (word: string | null) => void;
  onSwipeActiveChange?: (active: boolean) => void;
  children: React.ReactNode;
};

export function SwipeTypingProvider({
  enabled,
  isUppercase,
  onWordCommitted,
  onSwipePreviewChange,
  onSwipeActiveChange,
  children,
}: SwipeTypingProviderProps) {
  const layoutContext = useKeyLayoutContext();
  const pagePointsRef = useRef<PagePoint[]>([]);
  const localPointsRef = useRef<Point[]>([]);
  /** High-fidelity timed samples (position + timestamp) recorded on a time basis.
   * Used exclusively for Gboard-style pause/anchor detection. Not spatially filtered
   * so dwells produce many samples at nearly the same location but increasing t.
   */
  const timedPointsRef = useRef<Array<Point & {t: number}>>([]);
  const lastTimedSampleTimeRef = useRef(0);
  const lastPreviewUpdateRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const layoutsJsonRef = useRef('');
  const previewRafRef = useRef<number | null>(null);
  const trailOriginRef = useRef({pageX: 0, pageY: 0});
  const trailSizeRef = useRef({width: 0, height: 0});
  const [trailFading, setTrailFading] = useState(false);

  const clearTrail = useCallback(() => {
    swipeTrailPointsRef.current = [];
    swipeTrailHeadRef.current = null;
    swipeTrailRevisionRef.current += 1;
    setTrailFading(false);
  }, []);

  const appendTrailPoint = useCallback((local: Point) => {
    const trail = swipeTrailPointsRef.current;
    const minDistance = dp(TRAIL_MIN_STEP_DP);
    if (trail.length > 0) {
      const last = trail[trail.length - 1];
      const dx = local.x - last.x;
      const dy = local.y - last.y;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        return;
      }
    }

    trail.push({x: local.x, y: local.y, timestampMs: Date.now()});
    if (trail.length > SWIPE_MAX_POINTS) {
      trail.splice(0, trail.length - SWIPE_MAX_POINTS);
    }
    swipeTrailRevisionRef.current += 1;
  }, []);

  const clearSwipePreview = useCallback(() => {
    previewGenerationRef.current += 1;
    lastPreviewUpdateRef.current = 0;
    if (previewRafRef.current != null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    keyboardBridge.cancelSwipePreview();
    onSwipePreviewChange?.(null);
  }, [onSwipePreviewChange]);

  const updateSwipePreview = useCallback(() => {
    if (!onSwipePreviewChange) {
      return;
    }

    const points = localPointsRef.current;
    if (
      points.length < 2 ||
      pathDistance(points) < dp(SWIPE_TAP_SLOP_DP)
    ) {
      onSwipePreviewChange(null);
      return;
    }

    const layoutsJson = layoutsJsonRef.current;
    if (!layoutsJson) {
      return;
    }

    const generation = previewGenerationRef.current + 1;
    previewGenerationRef.current = generation;
    const pointsJson = JSON.stringify(points);
    const timedJson = JSON.stringify(timedPointsRef.current);

    if (Platform.OS === 'android') {
      void keyboardBridge
        .previewSwipeGesture(pointsJson, layoutsJson, isUppercase, timedJson)
        .then(word => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          onSwipePreviewChange(word || null);
        })
        .catch(() => {});
      return;
    }

    const layouts = layoutContext?.getLayouts() ?? [];
    const word = decodeSwipeGesture(
      points,
      layouts,
      isUppercase,
      [...timedPointsRef.current],
    );
    onSwipePreviewChange(word);
  }, [isUppercase, layoutContext, onSwipePreviewChange]);

  const scheduleSwipePreview = useCallback(() => {
    if (!onSwipePreviewChange) {
      return;
    }

    const now = Date.now();
    if (now - lastPreviewUpdateRef.current < SWIPE_PREVIEW_INTERVAL_MS) {
      return;
    }
    lastPreviewUpdateRef.current = now;

    if (previewRafRef.current != null) {
      cancelAnimationFrame(previewRafRef.current);
    }
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      updateSwipePreview();
    });
  }, [onSwipePreviewChange, updateSwipePreview]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    swipePointerSessionsRef.current.clear();
    activeSwipePointerIdRef.current = null;
    gestureSwipeActiveRef.current = false;
    pagePointsRef.current = [];
    localPointsRef.current = [];
    timedPointsRef.current = [];
    lastTimedSampleTimeRef.current = 0;
    clearSwipePreview();
    clearTrail();
  }, [clearSwipePreview, clearTrail, enabled]);

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

      appendTrailPoint(local);
      scheduleSwipePreview();
      return local;
    },
    [appendPagePoint, appendTrailPoint, pageToTrailLocal, scheduleSwipePreview],
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

  /** Record current position for pause detection on a *time* basis (not space).
   * This is what allows detecting dwells/pauses: even when finger moves <1dp,
   * we keep adding samples with later timestamps at (nearly) same location.
   */
  const recordTimedSample = useCallback((pageX: number, pageY: number) => {
    const local = pageToTrailLocal(pageX, pageY);
    const now = Date.now();
    // Time throttle: ~ every 12-16ms while finger is down and swiping.
    if (now - lastTimedSampleTimeRef.current < 12) {
      return;
    }
    lastTimedSampleTimeRef.current = now;

    const buf = timedPointsRef.current;
    buf.push({ x: local.x, y: local.y, t: now });
    if (buf.length > 450) {
      buf.splice(0, buf.length - 450);
    }

    if (gestureSwipeActiveRef.current) {
      appendTrailPoint(local);
    }
  }, [appendTrailPoint, pageToTrailLocal]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void ensureLearnedDictionaryLoaded();
    void keyboardBridge.preloadSwipeWordDictionary();
  }, [enabled]);

  const decodeAndCommit = useCallback(
    async (
      localPoints: Point[],
      timedPoints: Array<Point & {t: number}>,
      tapCommitted: boolean,
    ) => {
      const layouts = layoutContext?.getLayouts() ?? [];
      const letterKeyCount = layouts.filter(layout => layout.letter).length;

      if (letterKeyCount < 20) {
        layoutContext?.refreshAreaBounds();
      }

      if (
        localPoints.length < 2 ||
        pathDistance(localPoints) < dp(SWIPE_TAP_SLOP_DP)
      ) {
        return;
      }

      let word: string | null = null;

      try {
        if (Platform.OS === 'android') {
          try {
            const pointsJson = JSON.stringify(localPoints);
            const layoutsJson =
              layoutsJsonRef.current ||
              (layouts.length > 0 ? keyLayoutsToJson(layouts) : '');
            if (!layoutsJson) {
              throw new Error('missing swipe layouts');
            }
            const timedJson = JSON.stringify(timedPoints);
            const nativeWord = await keyboardBridge.decodeSwipeGesture(
              pointsJson,
              layoutsJson,
              isUppercase,
              timedJson,
            );
            if (nativeWord) {
              word = nativeWord;
            }
          } catch {
            // Fall through to JS decoder.
          }
        }

        if (!word) {
          word = decodeSwipeGesture(
            localPoints,
            layouts,
            isUppercase,
            timedPoints,
          );
        }
      } catch {
        word = null;
      } finally {
        clearSwipePreview();
        onSwipeActiveChange?.(false);
      }

      if (word) {
        if (tapCommitted) {
          keyboardBridge.deleteBackward();
        }
        triggerKeyHaptic();
        onWordCommitted(word);
      }
    },
    [clearSwipePreview, isUppercase, layoutContext, onSwipeActiveChange, onWordCommitted],
  );

  const beginSwipeTrail = useCallback(
    (session: SwipePointerSession, pageX: number, pageY: number) => {
      hideAllKeyPreviews();
      gestureSwipeActiveRef.current = true;
      onSwipeActiveChange?.(true);
      syncTrailBounds(() => {
        const layouts = layoutContext?.getLayouts() ?? [];
        layoutsJsonRef.current =
          layouts.length > 0 ? keyLayoutsToJson(layouts) : '';
        swipeTrailPointsRef.current = [];
        swipeTrailHeadRef.current = null;
        localPointsRef.current = [];
        pagePointsRef.current = [];
        timedPointsRef.current = [];
        lastTimedSampleTimeRef.current = 0;
        // Record start position for timed analysis
        recordTimedSample(session.rawStartX, session.rawStartY);
        appendSwipePoint(session.rawStartX, session.rawStartY);
        // Immediately record the first move point in time buffer
        recordTimedSample(pageX, pageY);
        appendSwipePoint(pageX, pageY);
      });
    },
    [appendSwipePoint, layoutContext, onSwipeActiveChange, recordTimedSample, syncTrailBounds],
  );

  const finishPointerSession = useCallback(
    (
      pointerId: number,
      session: SwipePointerSession,
      endPageX: number,
      endPageY: number,
    ) => {
      if (session.isSwiping && activeSwipePointerIdRef.current === pointerId) {
        // Capture the lift position in timed buffer for accurate end anchor + any final dwell
        recordTimedSample(endPageX, endPageY);

        const lastPage = pagePointsRef.current[pagePointsRef.current.length - 1];
        const endJump = lastPage
          ? Math.hypot(endPageX - lastPage.pageX, endPageY - lastPage.pageY)
          : 0;
        if (!lastPage || endJump < dp(48)) {
          appendSwipePoint(endPageX, endPageY);
        }
        const localPoints = [...localPointsRef.current];
        const timedPoints = [...timedPointsRef.current];
        const tapCommitted = session.tapCommitted;
        pagePointsRef.current = [];
        localPointsRef.current = [];
        timedPointsRef.current = [];
        lastTimedSampleTimeRef.current = 0;
        layoutsJsonRef.current = '';
        swipeTrailHeadRef.current = null;
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        setTrailFading(true);
        decodeAndCommit(localPoints, timedPoints, tapCommitted);
        return;
      }

      if (activeSwipePointerIdRef.current === pointerId) {
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        pagePointsRef.current = [];
        localPointsRef.current = [];
        timedPointsRef.current = [];
        lastTimedSampleTimeRef.current = 0;
        clearSwipePreview();
        onSwipeActiveChange?.(false);
        clearTrail();
      }
    },
    [appendSwipePoint, clearSwipePreview, clearTrail, decodeAndCommit, onSwipeActiveChange, recordTimedSample],
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
            swipeTrailHeadRef.current = pageToTrailLocal(
              touch.pageX,
              touch.pageY,
            );
            // Always time-sample for pause detection, even on tiny movements.
            recordTimedSample(touch.pageX, touch.pageY);
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
    [appendSwipePoint, beginSwipeTrail, enabled, pageToTrailLocal, recordTimedSample],
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
  getLetterCommitText?: (keyValue: string) => string;
  onMultiTouchKeyCommit?: (keyDef: KeyDefinition, text: string) => void;
};

export function SwipeTypingKeysHost({
  children,
  multiTouchEnabled = false,
  keyboardLayout = 'letters',
  isUppercase = false,
  getIsUppercase,
  getLetterCommitText,
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
          getLetterCommitText,
          hitSlop: keyHitSlop,
          consumeNativeFastPathPointer: keyboardBridge.consumeNativeFastPathPointer,
          consumeNativeHapticPointer: keyboardBridge.consumeNativeHapticPointer,
          swipeTypingEnabled: Boolean(ctx?.enabled),
        });
      }
    },
    [
      ctx,
      getIsUppercase,
      getLetterCommitText,
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
          width={ctx.trailWidth}
          height={ctx.trailHeight}
          fading={ctx.trailFading}
          onFadeComplete={ctx.onTrailFadeComplete}
        />
      ) : null}
    </View>
  );
}
