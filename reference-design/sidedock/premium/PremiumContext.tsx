import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { activatePremium, bootstrapPremiumStatus, checkPremiumStatus, restorePremium, clearPremiumCache, startFreeTrial, type PremiumState } from '../lib/premiumService';

type Ctx = {
  hydrated: boolean;
  loading: boolean;
  status: PremiumState;
  trialEndsAt: number | null;
  trialDaysLeft: number | null;
  isTrialActive: boolean;
  /** Premium or trial; stays true while a refresh is in flight if user was already entitled. */
  hasPremiumAccess: boolean;
  refresh: (forceRefresh?: boolean) => Promise<void>;
  activate: () => Promise<PremiumState>;
  restore: () => Promise<PremiumState>;
  startTrial: () => Promise<PremiumState>;
  clearCache: () => Promise<void>;
  isPremium: boolean;
};

const PremiumCtx = createContext<Ctx | null>(null);

const defaultStatus: PremiumState = {
  isPremium: false,
  flagged: false,
  appId: 'com.sidedock.app',
  deviceFingerprint: '',
  cachedAt: 0,
  token: '',
  source: 'none',
};

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PremiumState>(defaultStatus);
  const statusRef = useRef<PremiumState>(defaultStatus);
  const wasPremiumRef = useRef(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const trialEndsAt = status.source === 'trial' && typeof status.trialEndsAt === 'number' ? status.trialEndsAt : null;
  const trialDaysLeft =
    trialEndsAt != null ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000))) : null;
  const isTrialActive = status.source === 'trial' && status.isPremium && !!trialEndsAt && trialEndsAt > Date.now();
  const hasPremiumAccess =
    status.isPremium ||
    isTrialActive ||
    (loading && wasPremiumRef.current);

  useEffect(() => {
    if (status.isPremium || isTrialActive) {
      wasPremiumRef.current = true;
    } else if (hydrated && !loading) {
      wasPremiumRef.current = false;
    }
  }, [status.isPremium, isTrialActive, hydrated, loading]);

  useEffect(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (!hydrated || !trialEndsAt || !isTrialActive) return;

    const delay = Math.max(1000, trialEndsAt - Date.now() + 1000);
    expiryTimerRef.current = setTimeout(() => {
      void refresh(true);
    }, delay);

    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [hydrated, isTrialActive, refresh, trialEndsAt]);

  const refresh = useCallback(async (forceRefresh: boolean = true, silent: boolean = false) => {
    console.log('[PremiumContext] refresh() called - forceRefresh:', forceRefresh, 'silent:', silent);
    if (!silent) setLoading(true);
    try {
      const next = await checkPremiumStatus(forceRefresh).catch((err) => {
        console.error('[PremiumContext] checkPremiumStatus failed:', err);
        return statusRef.current;
      });
      console.log('[PremiumContext] checkPremiumStatus returned - isPremium:', next.isPremium);
      setStatus(next);
      return next;
    } finally {
      setHydrated(true);
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bootstrap = await bootstrapPremiumStatus().catch(() => null);
      if (!cancelled && bootstrap?.isPremium) {
        setStatus(bootstrap);
        wasPremiumRef.current = true;
        setHydrated(true);
      }
      try {
        const next = await checkPremiumStatus(false);
        if (!cancelled) {
          if (next.isPremium || !bootstrap?.isPremium) {
            setStatus(next);
          }
          setHydrated(true);
        }
      } catch (err) {
        console.error('[PremiumContext] initial checkPremiumStatus failed:', err);
        if (!cancelled) setHydrated(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) {
        void checkPremiumStatus(true)
          .then((confirmed) => {
            if (!cancelled) setStatus(confirmed);
          })
          .catch((err) => {
            console.error('[PremiumContext] background premium refresh failed:', err);
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    console.log('[PremiumContext] Setting up AppState listener');
    const sub = AppState.addEventListener('change', (s) => {
      console.log('[PremiumContext] AppState changed to:', s);
      if (s === 'active') void refresh(true, true);
    });
    return () => sub.remove();
  }, [refresh]);

  const activate = useCallback(async () => {
    setLoading(true);
    try {
      const next = await activatePremium();
      setStatus(next);
      setHydrated(true);
      return next;
    } catch (e) {
      console.warn('activatePremium failed', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const next = await restorePremium();
      setStatus(next);
      setHydrated(true);
      return next;
    } catch (e) {
      console.warn('restorePremium failed', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const startTrial = useCallback(async () => {
    setLoading(true);
    try {
      const next = await startFreeTrial();
      setStatus(next);
      setHydrated(true);
      return next;
    } catch (e) {
      console.warn('startFreeTrial failed', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    await clearPremiumCache();
    await refresh(true);
  }, [refresh]);

  const value = useMemo(
    () => ({
      hydrated,
      loading,
      status,
      trialEndsAt,
      trialDaysLeft,
      isTrialActive,
      hasPremiumAccess,
      refresh,
      activate,
      restore,
      startTrial,
      clearCache: clear,
      isPremium: status.isPremium,
    }),
    [hydrated, loading, status, trialEndsAt, trialDaysLeft, isTrialActive, hasPremiumAccess, refresh, activate, restore, startTrial, clear],
  );

  return <PremiumCtx.Provider value={value}>{children}</PremiumCtx.Provider>;
}

export function usePremiumContext() {
  const v = useContext(PremiumCtx);
  if (!v) throw new Error('usePremiumContext requires PremiumProvider');
  return v;
}
