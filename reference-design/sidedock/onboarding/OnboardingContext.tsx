import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type OnboardingContextType = {
  hasCompletedOnboarding: boolean;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  isHydrated: boolean;
};

const Ctx = createContext<OnboardingContextType | null>(null);

const ONBOARDING_KEY = '@sidedock_onboarding_completed';

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const initOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        setHasCompletedOnboarding(completed === 'true');
      } catch (err) {
        console.error('Failed to load onboarding status:', err);
      } finally {
        setIsHydrated(true);
      }
    };
    initOnboarding();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      setHasCompletedOnboarding(true);
    } catch (err) {
      console.error('Failed to save onboarding status:', err);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
      setHasCompletedOnboarding(false);
      setCurrentStep(0);
    } catch (err) {
      console.error('Failed to reset onboarding:', err);
    }
  }, []);

  const value = useMemo(
    () => ({
      hasCompletedOnboarding,
      currentStep,
      setCurrentStep,
      completeOnboarding,
      resetOnboarding,
      isHydrated,
    }),
    [hasCompletedOnboarding, currentStep, completeOnboarding, resetOnboarding, isHydrated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding requires OnboardingProvider');
  return v;
}
