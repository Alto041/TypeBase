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
import {clampPoint, compactPointsWithLandmarks, distance, PointBuffer, TimedPointBuffer} from './coordinates';
import {decodeSwipeGesture, previewSwipeGesture} from './gestureDecoder';
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
  hitTestKeyGeometric,
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
const SWIPE_MAX_POINTS = 480;
const SWIPE_COMPACT_TARGET = 240;
const SWIPE_TIMED_MAX_POINTS = 900;
const SWIPE_PREVIEW_TIMED_POINTS = 120;
const SWIPE_PREVIEW_INTERVAL_MS = 280;
const SWIPE_BRIDGE_PREVIEW_POINTS = 64;
const SWIPE_BRIDGE_COMMIT_POINTS = 240;
const TRAIL_MIN_STEP_DP = 1.65;

function samplePointsForBridge(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) {
    return points;
  }
  return compactPointsWithLandmarks(points, maxPoints);
}

function pointsToBridgeJson(points: Point[]): string {
  const flat = new Array<number>(points.length * 2);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    flat[index * 2] = Math.round(point.x * 10) / 10;
    flat[index * 2 + 1] = Math.round(point.y * 10) / 10;
  }
  return JSON.stringify(flat);
}

function timedPointsToBridgeJson(
  points: Array<Point & {t: number}>,
): string {
  const flat = new Array<number>(points.length * 3);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    flat[index * 3] = Math.round(point.x * 10) / 10;
    flat[index * 3 + 1] = Math.round(point.y * 10) / 10;
    flat[index * 3 + 2] = point.t;
  }
  return JSON.stringify(flat);
}

function sampleTimedPointsForBridge(
  points: Array<Point & {t: number}>,
  maxPoints: number,
): Array<Point & {t: number}> {
  if (points.length <= maxPoints) {
    return points;
  }
  const stride = Math.ceil(points.length / maxPoints);
  const sampled = [points[0]!];
  for (let index = stride; index < points.length - 1; index += stride) {
    sampled.push(points[index]!);
  }
  sampled.push(points[points.length - 1]!);
  return sampled;
}

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
  const hit = hitTestKeyGeometric(localX, localY, layoutContext.getLayouts());
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
  onWordCommitted: (word: string, options?: {textAlreadyInserted?: boolean}) => void;
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
  const spatialBufferRef = useRef(
    new PointBuffer(SWIPE_MAX_POINTS, SWIPE_COMPACT_TARGET),
  );
  const timedBufferRef = useRef(new TimedPointBuffer(SWIPE_TIMED_MAX_POINTS));
  const pagePointsRef = useRef<PagePoint[]>([]);
  const lastTimedSampleTimeRef = useRef(0);
  const lastPreviewUpdateRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const layoutsJsonRef = useRef('');
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    previewInFlightRef.current = false;
    lastPreviewUpdateRef.current = 0;
    if (previewTimeoutRef.current != null) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    keyboardBridge.cancelSwipePreview();
    onSwipePreviewChange?.(null);
  }, [onSwipePreviewChange]);

  const updateSwipePreview = useCallback(() => {
    if (!onSwipePreviewChange) {
      return;
    }

    const points = spatialBufferRef.current.toArray();
    if (
      points.length < 2 ||
      pathDistance(points) < dp(SWIPE_TAP_SLOP_DP)
    ) {
      onSwipePreviewChange(null);
      return;
    }

    const layouts = layoutContext?.getLayouts() ?? [];
    if (layouts.length === 0) {
      return;
    }

    if (previewInFlightRef.current) {
      return;
    }

    const generation = previewGenerationRef.current + 1;
    previewGenerationRef.current = generation;
    const snapshotPoints = samplePointsForBridge(
      spatialBufferRef.current.snapshot(),
      SWIPE_BRIDGE_PREVIEW_POINTS,
    );
    const snapshotTimed = sampleTimedPointsForBridge(
      timedBufferRef.current.snapshot(),
      SWIPE_PREVIEW_TIMED_POINTS,
    );
    const layoutsJson =
      layoutsJsonRef.current || keyLayoutsToJson(layouts);
    layoutsJsonRef.current = layoutsJson;
    const pointsJson = pointsToBridgeJson(snapshotPoints);
    const timedJson = timedPointsToBridgeJson(snapshotTimed);

    if (previewTimeoutRef.current != null) {
      clearTimeout(previewTimeoutRef.current);
    }
    previewTimeoutRef.current = setTimeout(() => {
      previewTimeoutRef.current = null;
      if (generation !== previewGenerationRef.current) {
        return;
      }

      const resolvePreview = (word: string | null) => {
        previewInFlightRef.current = false;
        if (generation !== previewGenerationRef.current) {
          return;
        }
        onSwipePreviewChange(word);
      };

      if (Platform.OS === 'android') {
        previewInFlightRef.current = true;
        void keyboardBridge
          .previewSwipeGesture(
            pointsJson,
            layoutsJson,
            isUppercase,
            timedJson,
          )
          .then(nativeWord => {
            const trimmed = nativeWord?.trim();
            resolvePreview(trimmed || null);
          })
          .catch(() => {
            resolvePreview(null);
          });
        return;
      }

      resolvePreview(
        previewSwipeGesture(snapshotPoints, layouts, isUppercase, snapshotTimed),
      );
    }, 0);
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
    updateSwipePreview();
  }, [onSwipePreviewChange, updateSwipePreview]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    swipePointerSessionsRef.current.clear();
    activeSwipePointerIdRef.current = null;
    gestureSwipeActiveRef.current = false;
    pagePointsRef.current = [];
    spatialBufferRef.current.reset();
    timedBufferRef.current.reset();
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

    // Only the latest page-space point is needed to validate the lift jump.
    pagePointsRef.current = [{pageX, pageY}];
  }, []);

  const appendSwipePoint = useCallback(
    (pageX: number, pageY: number) => {
      const local = pageToTrailLocal(pageX, pageY);
      const points = spatialBufferRef.current.toArray();
      const minDistance = dp(SWIPE_MIN_STEP_DP);
      if (points.length > 0) {
        const last = points[points.length - 1];
        const dx = local.x - last!.x;
        const dy = local.y - last!.y;
        if (dx * dx + dy * dy < minDistance * minDistance) {
          return local;
        }
      }
      appendPagePoint(pageX, pageY);
      spatialBufferRef.current.push(local);

      appendTrailPoint(local);
      if (Platform.OS !== 'android') {
        scheduleSwipePreview();
      }
      return local;
    },
    [appendPagePoint, appendTrailPoint, pageToTrailLocal, scheduleSwipePreview],
  );

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

    timedBufferRef.current.push({x: local.x, y: local.y, t: now});

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
    (
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

      clearSwipePreview();
      onSwipeActiveChange?.(false);

      const commitDecodedWord = (word: string | null) => {
        if (!word?.trim()) {
          return false;
        }
        if (tapCommitted) {
          keyboardBridge.deleteBackward();
        }
        triggerKeyHaptic();
        if (Platform.OS === 'android') {
          keyboardBridge.commitSwipeWord(word);
          onWordCommitted(word, {textAlreadyInserted: true});
        } else {
          onWordCommitted(word);
        }
        return true;
      };

      const runJsDecode = () => {
        try {
          return commitDecodedWord(
            decodeSwipeGesture(
              localPoints,
              layouts,
              isUppercase,
              timedPoints,
            ),
          );
        } catch {
          return false;
        }
      };

      if (Platform.OS === 'android' && layouts.length > 0) {
        const bridgePoints = samplePointsForBridge(
          localPoints,
          SWIPE_BRIDGE_COMMIT_POINTS,
        );
        const bridgeTimed = sampleTimedPointsForBridge(
          timedPoints,
          SWIPE_BRIDGE_COMMIT_POINTS,
        );
        const layoutsJson =
          layoutsJsonRef.current || keyLayoutsToJson(layouts);
        let settled = false;

        const settle = (word: string | null, failed: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          if (!word?.trim()) {
            runJsDecode();
            return;
          }
          commitDecodedWord(word);
        };

        void keyboardBridge
          .decodeSwipeGesture(
            pointsToBridgeJson(bridgePoints),
            layoutsJson,
            isUppercase,
            timedPointsToBridgeJson(bridgeTimed),
          )
          .then(nativeWord => {
            settle(nativeWord?.trim() || null, false);
          })
          .catch(() => {
            settle(null, true);
          });
        return;
      }

      runJsDecode();
    },
    [clearSwipePreview, isUppercase, layoutContext, onSwipeActiveChange, onWordCommitted],
  );

  const beginSwipeTrail = useCallback(
    (session: SwipePointerSession, pageX: number, pageY: number) => {
      hideAllKeyPreviews();
      gestureSwipeActiveRef.current = true;
      onSwipeActiveChange?.(true);
      clearSwipePreview();
      swipeTrailPointsRef.current = [];
      swipeTrailHeadRef.current = null;
      spatialBufferRef.current.reset();
      timedBufferRef.current.reset();
      pagePointsRef.current = [];
      lastTimedSampleTimeRef.current = 0;
      const layouts = layoutContext?.getLayouts() ?? [];
      layoutsJsonRef.current =
        layouts.length > 0 ? keyLayoutsToJson(layouts) : '';
      syncTrailBounds(() => {
        recordTimedSample(session.rawStartX, session.rawStartY);
        appendSwipePoint(session.rawStartX, session.rawStartY);
        recordTimedSample(pageX, pageY);
        appendSwipePoint(pageX, pageY);
      });
    },
    [
      appendSwipePoint,
      clearSwipePreview,
      layoutContext,
      onSwipeActiveChange,
      recordTimedSample,
      syncTrailBounds,
    ],
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
        const localPoints = spatialBufferRef.current.snapshot();
        const timedPoints = timedBufferRef.current.snapshot();
        const tapCommitted = session.tapCommitted;
        pagePointsRef.current = [];
        spatialBufferRef.current.reset();
        timedBufferRef.current.reset();
        lastTimedSampleTimeRef.current = 0;
        layoutsJsonRef.current = '';
        swipeTrailHeadRef.current = null;
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        clearSwipePreview();
        setTrailFading(true);
        decodeAndCommit(localPoints, timedPoints, tapCommitted);
        return;
      }

      if (activeSwipePointerIdRef.current === pointerId) {
        activeSwipePointerIdRef.current = null;
        gestureSwipeActiveRef.current = false;
        pagePointsRef.current = [];
        spatialBufferRef.current.reset();
        timedBufferRef.current.reset();
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
  isNativeTypingCommitActive?: () => boolean;
  onNativeFastPathLetterCommit?: (text: string) => void;
  onNativeFastPathShiftConsumed?: () => void;
  shouldConsumeShiftForCommit?: (text: string) => boolean;
  onSpaceLongPress?: () => void;
};

export function SwipeTypingKeysHost({
  children,
  multiTouchEnabled = false,
  keyboardLayout = 'letters',
  isUppercase = false,
  getIsUppercase,
  getLetterCommitText,
  onMultiTouchKeyCommit,
  isNativeTypingCommitActive,
  onNativeFastPathLetterCommit,
  onNativeFastPathShiftConsumed,
  shouldConsumeShiftForCommit,
  onSpaceLongPress,
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
          layouts,
          onKeyCommit: onMultiTouchKeyCommit,
          getLayouts: layoutContext.getLayouts,
          areaOrigin: origin,
          areaWidth: layoutContext.areaBounds.width,
          keyboardLayout,
          getIsUppercase: getIsUppercase ?? (() => isUppercase),
          getLetterCommitText,
          hitSlop: keyHitSlop,
          isNativeTypingCommitActive,
          pollNativeFastPathCommit: keyboardBridge.pollNativeFastPathCommit,
          rollbackNativeFastPathPointer: keyboardBridge.rollbackNativeFastPathPointer,
          consumeNativeHapticPointer: keyboardBridge.consumeNativeHapticPointer,
          onNativeFastPathLetterCommit,
          onNativeFastPathShiftConsumed,
          shouldConsumeShiftForCommit,
          swipeTypingEnabled: Boolean(ctx?.enabled),
          onSpaceLongPress,
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
      isNativeTypingCommitActive,
      onNativeFastPathLetterCommit,
      onNativeFastPathShiftConsumed,
      shouldConsumeShiftForCommit,
      onSpaceLongPress,
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
