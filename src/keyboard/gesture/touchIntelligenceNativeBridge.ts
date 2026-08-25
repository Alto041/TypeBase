import {DeviceEventEmitter, Platform} from 'react-native';

import {recordNativeTouchIntelligenceHit} from './touchIntelligenceTelemetry';

export function installTouchIntelligenceNativeTelemetry(): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }

  const subscription = DeviceEventEmitter.addListener(
    'touchIntelligenceHit',
    payload => {
      recordNativeTouchIntelligenceHit(payload ?? {});
    },
  );

  return () => subscription.remove();
}
