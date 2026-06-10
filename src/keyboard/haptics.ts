import {keyboardBridge} from './keyboardBridge';

export function triggerKeyHaptic() {
  keyboardBridge.performKeyHaptic();
}
