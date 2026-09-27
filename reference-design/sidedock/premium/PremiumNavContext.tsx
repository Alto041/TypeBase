import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type PremiumNav = {
  premiumOpen: boolean;
  openPremium: () => void;
  closePremium: () => void;
};

const Ctx = createContext<PremiumNav | null>(null);

export function PremiumNavProvider({ children }: { children: ReactNode }) {
  const [premiumOpen, setPremiumOpen] = useState(false);

  const openPremium = useCallback(() => setPremiumOpen(true), []);
  const closePremium = useCallback(() => setPremiumOpen(false), []);

  const value = useMemo(
    () => ({
      premiumOpen,
      openPremium,
      closePremium,
    }),
    [premiumOpen, openPremium, closePremium],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePremiumNav() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePremiumNav requires PremiumNavProvider');
  return v;
}
