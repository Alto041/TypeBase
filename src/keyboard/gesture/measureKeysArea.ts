import type {View as ViewType} from 'react-native';
import type {AreaBounds} from './KeyLayoutContext';

/** Measure a view in the same root-relative space as touch `pageX` / `pageY`. */
export function measureKeysArea(
  view: ViewType,
  callback: (bounds: AreaBounds) => void,
): void {
  view.measure((_x, _y, width, height, pageX, pageY) => {
    callback({pageX, pageY, width, height});
  });
}
