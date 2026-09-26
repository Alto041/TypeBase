import {canUseFeature} from './entitlements';

/** Plugin menu tiles available without Premium (full menu still opens). */
export const FREE_PLUGIN_IDS = new Set<string>([
  'essentials',
  'clipboard',
  'autocorrect',
  'calculator',
]);

export function canUsePluginMenuItem(pluginId: string): boolean {
  if (FREE_PLUGIN_IDS.has(pluginId)) {
    return true;
  }
  return canUseFeature('plugins');
}

/** On-device phrase / correction memory (keyboard); settings UI stays premium. */
export function canUsePersonalTypingEngine(): boolean {
  return true;
}

export function canUsePersonalTypingSettings(): boolean {
  return canUseFeature('personal_typing');
}

export const FREE_PERSONAL_PHRASE_HINT_LIMIT = 8;
export const FREE_LEARNED_PHRASE_CAP = 36;
