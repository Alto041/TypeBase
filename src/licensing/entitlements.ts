import {keyboardBridge} from '../keyboard/keyboardBridge';
import {
  isPremiumCached,
  refreshPremiumEntitlement,
  subscribePremiumStatus,
} from './premium';

export type PremiumFeature =
  | 'plugins'
  | 'themes_premium'
  | 'gestures'
  | 'swipe_typing'
  | 'translate'
  | 'rewrite'
  | 'format'
  | 'voice'
  | 'ai_config'
  | 'personal_typing'
  | 'layouts_custom'
  | 'keyboard_customize'
  | 'autocorrect_full'
  | 'number_row'
  | 'extended_characters'
  | 'autocorrect_panel';

const PREMIUM_FEATURES = new Set<PremiumFeature>([
  'plugins',
  'themes_premium',
  'gestures',
  'swipe_typing',
  'translate',
  'rewrite',
  'format',
  'voice',
  'ai_config',
  'personal_typing',
  'layouts_custom',
  'keyboard_customize',
  'autocorrect_full',
  'number_row',
  'extended_characters',
  'autocorrect_panel',
]);

let cachedPremium: boolean | null = null;
let loadPromise: Promise<boolean> | null = null;

export async function ensurePremiumLoaded(): Promise<boolean> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    try {
      if (keyboardBridge.isPremiumCached) {
        cachedPremium = await keyboardBridge.isPremiumCached();
      } else {
        cachedPremium = await isPremiumCached();
      }
    } catch {
      cachedPremium = false;
    }
    return cachedPremium;
  })();
  return loadPromise;
}

export function getPremiumCached(): boolean {
  return cachedPremium ?? true;
}

export function setPremiumCached(isPremium: boolean): void {
  cachedPremium = isPremium;
}

export async function refreshPremium(): Promise<boolean> {
  loadPromise = null;
  try {
    const refreshed = await refreshPremiumEntitlement();
    cachedPremium = refreshed;
    return refreshed;
  } catch {
    cachedPremium = await ensurePremiumLoaded();
    return cachedPremium;
  }
}

export function canUseFeature(feature: PremiumFeature): boolean {
  if (!PREMIUM_FEATURES.has(feature)) {
    return true;
  }
  return getPremiumCached();
}

export function isPremiumDesign(design: string): boolean {
  return design !== 'typebase';
}

export function initPremiumListener(): () => void {
  return subscribePremiumStatus(isPremium => {
    cachedPremium = isPremium;
  });
}

export async function readPremiumFromNative(): Promise<boolean> {
  try {
    if (keyboardBridge.isPremiumCached) {
      cachedPremium = await keyboardBridge.isPremiumCached();
    } else {
      cachedPremium = await isPremiumCached();
    }
  } catch {
    cachedPremium = false;
  }
  return cachedPremium;
}
