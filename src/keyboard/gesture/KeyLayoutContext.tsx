import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {LayoutChangeEvent, View as ViewType} from 'react-native';
import {measureKeysArea} from './measureKeysArea';
import type {KeyBounds, Point} from './types';

export type AreaBounds = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

type KeyLayoutContextValue = {
  keysAreaRef: RefObject<ViewType | null>;
  areaBounds: AreaBounds;
  areaOriginRef: RefObject<{pageX: number; pageY: number}>;
  onKeysAreaLayout: (event: LayoutChangeEvent) => void;
  refreshAreaBounds: () => void;
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

export function KeyLayoutProvider({children}: {children: React.ReactNode}) {
  const keysAreaRef = useRef<ViewType>(null);
  const layoutsRef = useRef<Map<string, KeyBounds>>(new Map());
  const areaOriginRef = useRef({pageX: 0, pageY: 0});
  const [areaBounds, setAreaBounds] = useState<AreaBounds>(EMPTY_BOUNDS);

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
      onKeysAreaLayout,
      refreshAreaBounds,
      pageToLocalPoint,
      registerKey,
      unregisterKey,
      getLayouts,
    }),
    [
      areaBounds,
      getLayouts,
      onKeysAreaLayout,
      pageToLocalPoint,
      refreshAreaBounds,
      registerKey,
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
