import React, {useState} from 'react';
import {
  Animated,
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import SkipNextIcon from './assets/skip-next.svg';
import {AiConfigScreen} from './AiConfigScreen';
import {useScreenTransition} from './lib/screenTransition';
import {keyboardBridge} from './src/keyboard/keyboardBridge';

const C = {
  bg: '#f2f2f4',
  text: '#111111',
  sub: '#6b6b6b',
  red: '#D71921',
} as const;

const TEXT_KERNING = -0.7;

const ONBOARDING_BACKGROUNDS = [
  require('./assets/bg.png'),
  require('./assets/bg2.png'),
  require('./assets/bg.png'),
] as const;

type OnboardingPage = {
  eyebrow: string;
  title: string;
  cta: string;
  onPress: () => void;
};

type OnboardingScreenProps = {
  onComplete: () => void;
  fontsLoaded?: boolean;
};

function OnboardingBackground({pageIndex}: {pageIndex: number}) {
  const source =
    ONBOARDING_BACKGROUNDS[pageIndex] ?? ONBOARDING_BACKGROUNDS[0];

  return (
    <ImageBackground
      source={source}
      style={styles.background}
      resizeMode="cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function OnboardingScreen({
  onComplete,
  fontsLoaded = false,
}: OnboardingScreenProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const {animatedStyle, transitionTo} = useScreenTransition();
  const titleFont = fontsLoaded ? {fontFamily: 'Geist' as const} : {fontWeight: '600' as const};
  const monoFont = fontsLoaded ? {fontFamily: 'FragmentMono' as const} : undefined;
  const interFont = fontsLoaded ? {fontFamily: 'Inter' as const} : undefined;

  const goToPage = (nextIndex: number) => {
    if (nextIndex === pageIndex) {
      return;
    }
    transitionTo(() => setPageIndex(nextIndex));
  };

  const welcomePage: OnboardingPage = {
    eyebrow: 'Choose Typebase to Continue',
    title: 'Welcome to Typebase',
    cta: 'Continue',
    onPress: () => {
      keyboardBridge.openInputMethodSettings();
      goToPage(1);
    },
  };

  const finishPage: OnboardingPage = {
    eyebrow: '',
    title: 'Lets Launch',
    cta: 'Get Started',
    onPress: () => transitionTo(onComplete),
  };

  const page = pageIndex === 0 ? welcomePage : finishPage;

  const handleSkip = () => {
    transitionTo(onComplete);
  };

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />
      <OnboardingBackground pageIndex={pageIndex} />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.page, animatedStyle]}>
          {pageIndex === 1 ? (
            <AiConfigScreen
              variant="wizard"
              title="AI setup wizard"
              onContinue={() => goToPage(2)}
            />
          ) : (
            <View style={styles.content}>
              <View
                style={[
                  styles.header,
                  pageIndex === 2 ? styles.headerLastPage : null,
                ]}>
                {page.eyebrow ? (
                  <Text style={[styles.eyebrow, interFont]}>{page.eyebrow}</Text>
                ) : null}
                <Text style={[styles.title, titleFont]}>{page.title}</Text>
              </View>

              <View style={styles.bottom}>
                <View style={styles.ctaRow}>
                  <Pressable style={styles.ctaButton} onPress={page.onPress}>
                    <Text style={[styles.ctaLabel, monoFont]}>{page.cta}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.skipButton}
                    onPress={handleSkip}
                    accessibilityLabel="Skip"
                    accessibilityRole="button">
                    <SkipNextIcon width={20} height={20} color="#FFFFFF" />
                  </Pressable>
                </View>
                <Text style={[styles.footerCompany, interFont]}>
                  Quivox Engineering Technologies
                </Text>
                <Text style={[styles.footerRights, interFont]}>
                  All Rights Reserved 2026 ©
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  background: {
    ...StyleSheet.absoluteFill,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  page: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 52,
    alignItems: 'center',
    gap: 2,
  },
  headerLastPage: {
    paddingTop: 120,
    gap: 0,
  },
  eyebrow: {
    fontSize: 14,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    textAlign: 'center',
  },
  title: {
    fontSize: 55,
    color: C.text,
    letterSpacing: TEXT_KERNING,
    lineHeight: 52,
    textAlign: 'center',
  },
  bottom: {
    marginTop: 'auto',
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 10,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  ctaButton: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  footerCompany: {
    marginTop: 6,
    fontSize: 13,
    color: C.text,
    letterSpacing: TEXT_KERNING,
    textAlign: 'center',
  },
  footerRights: {
    fontSize: 11,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    textAlign: 'center',
  },
});
