import {Buffer} from 'buffer';
import 'react-native-reanimated';
import {AppRegistry} from 'react-native';

global.Buffer = global.Buffer || Buffer;

if (__DEV__) {
  const metroJsonHint =
    'Metro dev connection failed (non-JSON proxy error). USB: run `adb reverse tcp:8081 tcp:8081` or use `npm run android`.';

  const isMetroJsonParseNoise = (error: unknown): boolean => {
    if (!(error instanceof SyntaxError)) {
      return false;
    }
    const message = error.message ?? '';
    return message.includes('is not valid JSON') && message.includes('upstream');
  };

  const globalWithEvents = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: (event: {reason?: unknown}) => void) => void;
  };
  globalWithEvents.addEventListener?.('unhandledrejection', event => {
    if (isMetroJsonParseNoise(event.reason)) {
      console.warn(`[TypeBase] ${metroJsonHint}`);
    }
  });

  const errorUtils = (globalThis as {ErrorUtils?: {getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void; setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void}}).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    if (isMetroJsonParseNoise(error)) {
      console.warn(`[TypeBase] ${metroJsonHint}`);
      return;
    }
    previousHandler?.(error, isFatal);
  });
}

import {registerRootComponent} from 'expo';

import App from './App';
import KeyboardApp from './src/keyboard/KeyboardApp';

registerRootComponent(App);
AppRegistry.registerComponent('TypeBaseKeyboard', () => KeyboardApp);
