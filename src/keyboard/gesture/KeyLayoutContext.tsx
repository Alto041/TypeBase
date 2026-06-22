import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {LayoutChangeEvent, View as ViewType} from 'react-native';
import type {KeyboardLayoutSettings} from '../theme';
import {measureKeysArea} from './measureKeysArea';
import type {KeyBounds, Point} from './types';

function layoutGeometrySignature(layout: KeyboardLayoutSettings): string {
  return [
    layout.keyHeight,
    layout.keyGap,
    layout.keyRowMargin,
    layout.keyRadius,
    layout.letterLayoutId,
  ].join('|');
}

export type AreaBounds = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export type KeyLayoutContextValue = {
  keysAreaRef: RefObject<ViewType | null>;
  areaBounds: AreaBounds;
  areaOriginRef: RefObject<{pageX: number; pageY: number}>;
  /** Bumps when key bounds should be re-measured (layout settings, IME resize, …). */
  layoutEpoch: number;
  onKeysAreaLayout: (event: LayoutChangeEvent) => void;
  refreshAreaBounds: () => void;
  requestRemeasure: () => void;
  pageToLocalPoint: (
    pageX: number,
    pageY: number,
    callback: (point: Point) => void,
  ) => void;
  registerKey: (layout: KeyBounds) => void;
  unregisterKey: (id: string) => void;
  getLayouts: () => KeyBounds[];
};

const KeyLayoutContext = createContext<KeyLayoutContextValue | null>(null);

const EMPTY_BOUNDS: AreaBounds = {pageX: 0, pageY: 0, width: 0, height: 0};

type KeyLayoutProviderProps = {
  children: React.ReactNode;
  layoutSettings: KeyboardLayoutSettings;
};

export function KeyLayoutProvider({
  children,
  layoutSettings,
}: KeyLayoutProviderProps) {
  const keysAreaRef = useRef<ViewType>(null);
  const layoutsRef = useRef<Map<string, KeyBounds>>(new Map());
  const areaOriginRef = useRef({pageX: 0, pageY: 0});
  const [areaBounds, setAreaBounds] = useState<AreaBounds>(EMPTY_BOUNDS);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const layoutGeometry = layoutGeometrySignature(layoutSettings);

  const applyAreaBounds = useCallback((bounds: AreaBounds) => {
    areaOriginRef.current = {pageX: bounds.pageX, pageY: bounds.pageY};
    setAreaBounds(current => {
      if (
        current.pageX === bounds.pageX &&
        current.pageY === bounds.pageY &&
        current.width === bounds.width &&
        current.height === bounds.height
      ) {
        return current;
      }
      return bounds;
    });
  }, []);

  const refreshAreaBounds = useCallback(() => {
    const keysArea = keysAreaRef.current;
    if (!keysArea) {
      return;
    }

    measureKeysArea(keysArea, applyAreaBounds);
  }, [applyAreaBounds]);

  const requestRemeasure = useCallback(() => {
    refreshAreaBounds();
    setLayoutEpoch(epoch => epoch + 1);
  }, [refreshAreaBounds]);

  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      if (cancelled) {
        return;
      }
      requestRemeasure();
    };

    const raf = requestAnimationFrame(() => {
      schedule();
      requestAnimationFrame(schedule);
    });
    const timer = setTimeout(schedule, 120);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [layoutGeometry, requestRemeasure]);

  const pageToLocalPoint = useCallback(
    (pageX: number, pageY: number, callback: (point: Point) => void) => {
      const keysArea = keysAreaRef.current;
      if (!keysArea) {
        callback({x: pageX, y: pageY});
        return;
      }

      measureKeysArea(keysArea, bounds => {
        applyAreaBounds(bounds);
        callback({
          x: pageX - bounds.pageX,
          y: pageY - bounds.pageY,
        });
      });
    },
    [applyAreaBounds],
  );

  const onKeysAreaLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const {width, height} = event.nativeEvent.layout;
      setAreaBounds(current => ({...current, width, height}));
      requestAnimationFrame(refreshAreaBounds);
    },
    [refreshAreaBounds],
  );

  const registerKey = useCallback((layout: KeyBounds) => {
    layoutsRef.current.set(layout.id, layout);
  }, []);

  const unregisterKey = useCallback((id: string) => {
    layoutsRef.current.delete(id);
  }, []);

  const getLayouts = useCallback(
    () => Array.from(layoutsRef.current.values()),
    [],
  );

  const value = useMemo(
    () => ({
      keysAreaRef,
      areaBounds,
      areaOriginRef,
      layoutEpoch,
      onKeysAreaLayout,
      refreshAreaBounds,
      requestRemeasure,
      pageToLocalPoint,
      registerKey,
      unregisterKey,
      getLayouts,
    }),
    [
      areaBounds,
      getLayouts,
      layoutEpoch,
      onKeysAreaLayout,
      pageToLocalPoint,
      refreshAreaBounds,
      registerKey,
      requestRemeasure,
      unregisterKey,
    ],
  );

  return (
    <KeyLayoutContext.Provider value={value}>
      {children}
    </KeyLayoutContext.Provider>
  );
}

export function useKeyLayoutContext() {
  return useContext(KeyLayoutContext);
}
