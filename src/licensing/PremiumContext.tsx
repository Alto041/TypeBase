import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {Platform} from 'react-native';

import {
  canUseFeature,
  initPremiumListener,
  refreshPremium,
  setPremiumCached,
  type PremiumFeature,
} from './entitlements';
import {
  consumePendingPremiumUpgrade,
  getPremiumProductPrice,
  purchasePremium,
  restorePremiumPurchases,
} from './premium';
import {ensurePlayLicensed} from './playLicense';

type PremiumContextValue = {
  isPremium: boolean;
  loading: boolean;
  price: string | null;
  refresh: () => Promise<boolean>;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  canUse: (feature: PremiumFeature) => boolean;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({children}: {children: ReactNode}) {
  const [isPremium, setIsPremium] = useState(Platform.OS !== 'android');
  const [loading, setLoading] = useState(Platform.OS === 'android');
  const [price, setPrice] = useState<string | null>(null);

  const syncPremium = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setIsPremium(true);
      setPremiumCached(true);
      setLoading(false);
      return true;
    }
    setLoading(true);
    try {
      const entitled = await refreshPremium();
      setIsPremium(entitled);
      setPremiumCached(entitled);
      void ensurePlayLicensed().catch(() => undefined);
      const nextPrice = await getPremiumProductPrice();
      setPrice(nextPrice);
      return entitled;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void syncPremium();
    const unsubscribe = initPremiumListener(next => {
      setIsPremium(next);
      setPremiumCached(next);
    });
    return unsubscribe;
  }, [syncPremium]);

  useEffect(() => {
    const checkPending = async () => {
      const pending = await consumePendingPremiumUpgrade();
      if (pending) {
        // Parent screens listen via onOpenPremium callback prop drilling from App.
      }
    };
    void checkPending();
  }, []);

  const purchase = useCallback(async () => {
    const success = await purchasePremium();
    if (success) {
      const entitled = await syncPremium();
      setIsPremium(entitled);
      setPremiumCached(entitled);
    }
    return success;
  }, [syncPremium]);

  const restore = useCallback(async () => {
    const success = await restorePremiumPurchases();
    if (success) {
      const entitled = await syncPremium();
      setIsPremium(entitled);
      setPremiumCached(entitled);
    }
    return success;
  }, [syncPremium]);

  const value = useMemo(
    () => ({
      isPremium,
      loading,
      price,
      refresh: syncPremium,
      purchase,
      restore,
      canUse: (feature: PremiumFeature) =>
        isPremium ? true : canUseFeature(feature),
    }),
    [isPremium, loading, price, syncPremium, purchase, restore],
  );

  return (
    <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  const context = useContext(PremiumContext);
  if (!context) {
    throw new Error('usePremium must be used within PremiumProvider');
  }
  return context;
}

export function usePremiumOptional(): PremiumContextValue | null {
  return useContext(PremiumContext);
}
