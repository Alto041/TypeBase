import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

/** Play Console one-time in-app product — create before release. */
export const PREMIUM_SKU = 'typebase_premium_unlock';

export const PREMIUM_STATUS_CHANGED_EVENT = 'premiumStatusChanged';

type PremiumModuleType = {
  isPremiumCached: () => Promise<boolean>;
  refreshEntitlement: () => Promise<boolean>;
  getProductPrice: () => Promise<string | null>;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openUpgradeScreen: () => Promise<boolean>;
  consumePendingOpenUpgrade: () => Promise<boolean>;
};

const Premium: PremiumModuleType | undefined = NativeModules.Premium;

export async function isPremiumCached(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Premium?.isPremiumCached) {
    return true;
  }
  return Premium.isPremiumCached();
}

export async function refreshPremiumEntitlement(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Premium?.refreshEntitlement) {
    return true;
  }
  return Premium.refreshEntitlement();
}

export async function getPremiumProductPrice(): Promise<string | null> {
  if (Platform.OS !== 'android' || !Premium?.getProductPrice) {
    return null;
  }
  try {
    return await Premium.getProductPrice();
  } catch {
    return null;
  }
}

export async function purchasePremium(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Premium?.purchasePremium) {
    return true;
  }
  return Premium.purchasePremium();
}

export async function restorePremiumPurchases(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Premium?.restorePurchases) {
    return true;
  }
  return Premium.restorePurchases();
}

export async function openPremiumUpgradeScreen(): Promise<void> {
  if (Platform.OS !== 'android' || !Premium?.openUpgradeScreen) {
    return;
  }
  await Premium.openUpgradeScreen();
}

export async function consumePendingPremiumUpgrade(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Premium?.consumePendingOpenUpgrade) {
    return false;
  }
  try {
    return await Premium.consumePendingOpenUpgrade();
  } catch {
    return false;
  }
}

export function subscribePremiumStatus(
  listener: (isPremium: boolean) => void,
): () => void {
  const subscription = DeviceEventEmitter.addListener(
    PREMIUM_STATUS_CHANGED_EVENT,
    listener,
  );
  return () => subscription.remove();
}
