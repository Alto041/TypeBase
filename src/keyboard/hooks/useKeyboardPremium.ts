import {useCallback, useEffect, useState} from 'react';

import {
  canUseFeature,
  getPremiumCached,
  initPremiumListener,
  readPremiumFromNative,
  setPremiumCached,
  type PremiumFeature,
} from '../../licensing/entitlements';
import {applyFreeTierDefaults} from '../../licensing/freeTierDefaults';

export function useKeyboardPremium() {
  const [showUpsell, setShowUpsell] = useState(false);
  const [premiumReady, setPremiumReady] = useState(false);
  const [isPremium, setIsPremium] = useState(getPremiumCached);

  useEffect(() => {
    let active = true;
    void (async () => {
      const entitled = await readPremiumFromNative();
      await applyFreeTierDefaults();
      if (active) {
        setIsPremium(entitled);
        setPremiumReady(true);
      }
    })();
    const unsubscribe = initPremiumListener(next => {
      setPremiumCached(next);
      setIsPremium(next);
      void applyFreeTierDefaults();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const requireFeature = useCallback(
    (feature: PremiumFeature, action: () => void) => {
      if (canUseFeature(feature)) {
        action();
      } else {
        setShowUpsell(true);
      }
    },
    [],
  );

  const isPluginPremium = isPremium || canUseFeature('plugins');

  return {
    premiumReady,
    isPremium,
    showUpsell,
    setShowUpsell,
    requireFeature,
    isPluginPremium,
  };
}
