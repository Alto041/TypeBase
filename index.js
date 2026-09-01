import {Buffer} from 'buffer';
import 'react-native-reanimated';
import {AppRegistry} from 'react-native';

global.Buffer = global.Buffer || Buffer;

if (__DEV__) {
  const metroJsonHint =
    'Metro dev connection failed (non-JSON proxy error). USB: run `adb reverse tcp:8081 tcp:8081` or use `npm run android`.';

  const isMetroJsonParseNoise = error => {
    if (!(error instanceof SyntaxError)) {
      return false;
    }
    const message = error.message ?? '';
    return message.includes('is not valid JSON') && message.includes('upstream');
  };

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('unhandledrejection', event => {
      if (isMetroJsonParseNoise(event.reason)) {
        console.warn(`[TypeBase] ${metroJsonHint}`);
      }
    });
  }

  const errorUtils = globalThis.ErrorUtils;
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
