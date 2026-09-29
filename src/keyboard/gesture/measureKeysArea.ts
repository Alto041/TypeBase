import {findNodeHandle, UIManager, type View as ViewType} from 'react-native';
import type {AreaBounds} from './KeyLayoutContext';

/** Measure a view in the same root-relative space as touch `pageX` / `pageY`. */
export function measureKeysArea(
  view: ViewType,
  callback: (bounds: AreaBounds) => void,
): void {
  if (!view || typeof callback !== 'function') {
    return;
  }

  const tag = findNodeHandle(view);
  if (tag == null) {
    return;
  }

  const deliver = (
    pageX: number,
    pageY: number,
    width: number,
    height: number,
  ) => {
    if (
      !Number.isFinite(pageX) ||
      !Number.isFinite(pageY) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return;
    }
    callback({pageX, pageY, width, height});
  };

  try {
    UIManager.measure(
      tag,
      (_x, _y, width, height, pageX, pageY) => {
        deliver(pageX, pageY, width, height);
      },
    );
  } catch {
    // Layout not ready — caller should retry on a later frame.
  }
}
