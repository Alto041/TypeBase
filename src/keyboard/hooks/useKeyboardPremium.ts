import {useCallback, useEffect, useState} from 'react';

import {
  canUseFeature,
  initPremiumListener,
  readPremiumFromNative,
  type PremiumFeature,
} from '../licensing/entitlements';
import {applyFreeTierDefaults} from '../licensing/freeTierDefaults';

export function useKeyboardPremium() {
  const [showUpsell, setShowUpsell] = useState(false);
  const [premiumReady, setPremiumReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      await readPremiumFromNative();
      await applyFreeTierDefaults();
      if (active) {
        setPremiumReady(true);
      }
    })();
    const unsubscribe = initPremiumListener(() => {
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

  const isPluginPremium = canUseFeature('plugins');

  return {
    premiumReady,
    showUpsell,
    setShowUpsell,
    requireFeature,
    isPluginPremium,
  };
}
