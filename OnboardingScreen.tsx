import React, {useEffect, useRef, useState, type ComponentType} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import ArtificialIcon from './assets/Artificial.svg';
import BackIcon from './assets/back.svg';
import ArrowForwardIcon from './assets/onboarding/arrow-forward.svg';
import CheckIcon from './assets/check.svg';
import FormatPaintIcon from './assets/onboarding/format-paint.svg';
import FlagCheckeredIcon from './assets/onboarding/flag-checkered.svg';
import DownasaurIcon from './assets/onboarding/google-downasaur.svg';
import LiquidSpotIcon from './assets/onboarding/liquid-spot.svg';
import PackageVariantIcon from './assets/onboarding/package-variant.svg';
import {keyboardBridge} from './src/keyboard/keyboardBridge';
import {
  OnboardingPremiumDrawer,
  OnboardingPremiumHero,
} from './src/onboarding/OnboardingPremiumPage';
import {hapticTap} from './lib/haptics';
import {applyOnboardingAiDefaults} from './src/onboarding/applyOnboardingAiDefaults';

const OnboardingImage1 = require('./assets/onboarding/onboarding1.png');
const OnboardingImage2 = require('./assets/onboarding/onboarding2.png');
const OnboardingImage3 = require('./assets/onboarding/onboarding3.png');

const {width: SCREEN_W} = Dimensions.get('window');
const ONBOARDING3_ASPECT = 4096 / 2663;

const C = {
  bg: '#f2f2f4',
  drawer: '#111111',
  text: '#ffffff',
  sub: 'rgba(255,255,255,0.62)',
  accent: '#ffc700',
} as const;

const TITLE_FONT = 'Geist';
const BODY_FONT = 'Inter';
const BULLET_ICON = 22;
const PAGE_PROGRESS_SHORT = 34;
const PAGE_PROGRESS_LONG = 78;

type PlayfulIcon = ComponentType<{width?: number; height?: number; color?: string}>;

type Bullet = {
  PlayfulIcon?: PlayfulIcon;
  text: string;
};

type HeroMode = 'feature' | 'backdrop';
type PageVariant = 'default' | 'premium';

type OnboardingPage = {
  id: string;
  variant?: PageVariant;
  image?: ImageSourcePropType;
  heroMode?: HeroMode;
  heroAspect?: number;
  title: string;
  body: string;
  bullets?: Bullet[];
  isLast?: boolean;
  openKeyboardSettingsOnNext?: boolean;
};

const ONBOARDING_PAGES: OnboardingPage[] = [
  {
    id: 'intro',
    image: OnboardingImage1,
    heroMode: 'feature',
    title: 'Welcome to TypeBase',
    body:
      'Your everyday keyboard, with extra tools when you want them. No clutter when you don\u2019t.',
    bullets: [
      {
        PlayfulIcon: FlagCheckeredIcon,
        text: 'Tap Next and we\u2019ll open settings so you can switch to TypeBase.',
      },
      {
        PlayfulIcon: DownasaurIcon,
        text: 'Autocorrect, clipboard, and little helpers stay on the keyboard.',
      },
      {
        PlayfulIcon: FormatPaintIcon,
        text: 'Themes and layout options are there when you feel like tuning things.',
      },
    ],
    openKeyboardSettingsOnNext: true,
  },
  {
    id: 'ai',
    image: OnboardingImage2,
    heroMode: 'feature',
    title: 'Help while you write',
    body:
      'Translate, tidy up a sentence, or talk instead of type. You choose what runs on your phone or online.',
    bullets: [
      {
        PlayfulIcon: ArtificialIcon,
        text: 'On-device AI keeps more of what you type on your phone.',
      },
      {
        PlayfulIcon: LiquidSpotIcon,
        text: 'The keyboard remembers phrases you actually use.',
      },
      {
        PlayfulIcon: PackageVariantIcon,
        text: 'Set it up later in Settings \u2192 AI Config. No rush.',
      },
    ],
  },
  {
    id: 'tools',
    image: OnboardingImage3,
    heroMode: 'backdrop',
    heroAspect: ONBOARDING3_ASPECT,
    title: 'Your keyboard, your mix',
    body:
      'Stickers, sounds, shortcuts, plugins. Turn on what you love and leave the rest off.',
  },
  {
    id: 'premium',
    variant: 'premium',
    title: 'TypeBase Premium',
    body: '',
    isLast: true,
  },
];

function BulletGlyph({bullet}: {bullet: Bullet}) {
  if (bullet.PlayfulIcon) {
    const Icon = bullet.PlayfulIcon;
    return <Icon width={BULLET_ICON} height={BULLET_ICON} color={C.text} />;
  }
  return null;
}

type DrawerProps = {
  page: OnboardingPage;
  step: number;
  total: number;
  bottomInset: number;
  onNext: () => void;
  onLayoutHeight?: (height: number) => void;
};

function OnboardingDrawer({
  page,
  step,
  total,
  bottomInset,
  onNext,
  onLayoutHeight,
}: DrawerProps) {
  const handleNext = () => {
    if (page.openKeyboardSettingsOnNext) {
      keyboardBridge.openInputMethodSettings();
    }
    onNext();
  };

  return (
    <View
      onLayout={event => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        drawerStyles.drawer,
        drawerStyles.drawerInline,
        {paddingBottom: Math.max(bottomInset, 14) + 10},
      ]}>
      <View style={drawerStyles.copyBlock}>
        <Text style={drawerStyles.title}>{page.title}</Text>
        <Text style={drawerStyles.body}>{page.body}</Text>
      </View>

      {page.bullets && page.bullets.length > 0 ? (
        <View style={drawerStyles.bullets}>
          {page.bullets.map(bullet => (
            <View key={bullet.text} style={drawerStyles.bulletRow}>
              <View style={drawerStyles.bulletIconSlot}>
                <BulletGlyph bullet={bullet} />
              </View>
              <Text style={drawerStyles.bulletText}>{bullet.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={[
          drawerStyles.footerRow,
          !page.bullets?.length && drawerStyles.footerRowFlush,
        ]}>
        <Text style={drawerStyles.stepLabel}>
          {step + 1} / {total}
        </Text>
        <Pressable
          onPress={handleNext}
          style={({pressed}) => [
            drawerStyles.nextButton,
            pressed && drawerStyles.nextButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={page.isLast ? 'Finish and open TypeBase' : 'Next step'}>
          {page.isLast ? (
            <CheckIcon width={20} height={20} color="#111111" />
          ) : (
            <ArrowForwardIcon width={22} height={22} color="#111111" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

type PageProps = {
  page: OnboardingPage;
  drawerReserve?: number;
};

function OnboardingPageBackground({page, drawerReserve = 0}: PageProps) {
  if (page.variant === 'premium') {
    return (
      <View style={pageStyles.pagePremium}>
        <OnboardingPremiumHero drawerReserve={drawerReserve} />
      </View>
    );
  }

  const heroMode = page.heroMode ?? 'backdrop';

  if (heroMode === 'backdrop' && page.image) {
    return (
      <View style={pageStyles.pageBackdrop}>
        <View style={pageStyles.heroBand} pointerEvents="none">
          <Image
            source={page.image}
            style={[
              pageStyles.heroImageFitHeight,
              {aspectRatio: page.heroAspect ?? ONBOARDING3_ASPECT},
            ]}
            resizeMode="cover"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={pageStyles.page}>
      <View style={[pageStyles.heroArea, pageStyles.heroAreaFeature]} pointerEvents="none">
        {page.image ? (
          <Image source={page.image} style={pageStyles.heroImageFeature} resizeMode="contain" />
        ) : (
          <View style={pageStyles.heroPlaceholder} />
        )}
      </View>
    </View>
  );
}

function OnboardingPageProgress({
  total,
  animatedStep,
  inactiveColor,
}: {
  total: number;
  animatedStep: Animated.Value;
  inactiveColor: string;
}) {
  return (
    <View style={styles.progressRow} pointerEvents="none">
      {Array.from({length: total}).map((_, index) => {
        const emphasis = animatedStep.interpolate({
          inputRange: [index - 1, index, index + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        const width = emphasis.interpolate({
          inputRange: [0, 1],
          outputRange: [PAGE_PROGRESS_SHORT, PAGE_PROGRESS_LONG],
        });
        const backgroundColor = emphasis.interpolate({
          inputRange: [0, 1],
          outputRange: [inactiveColor, C.accent],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.progressLine,
              {
                width,
                backgroundColor,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

type OnboardingScreenProps = {
  onComplete: () => void;
  fontsLoaded?: boolean;
};

export function OnboardingScreen({onComplete}: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingPage>>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const transitioningRef = useRef(false);
  const drawerHeightAnim = useRef(new Animated.Value(1)).current;
  const drawerHeightRef = useRef(0);
  const hasMeasuredDrawerRef = useRef(false);
  const pageStepAnim = useRef(new Animated.Value(currentStep)).current;
  const [isDrawerMeasured, setIsDrawerMeasured] = useState(false);
  const [drawerReserve, setDrawerReserve] = useState(320);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleFinish = () => {
    void applyOnboardingAiDefaults()
      .catch(() => undefined)
      .finally(() => {
        onComplete();
      });
  };

  const goToStep = (nextStep: number) => {
    if (nextStep < 0 || nextStep >= ONBOARDING_PAGES.length) {
      return;
    }
    transitioningRef.current = true;
    flatListRef.current?.scrollToIndex({index: nextStep, animated: true});
  };

  const handleNext = () => {
    if (transitioningRef.current) {
      return;
    }
    hapticTap();
    const nextStep = currentStep + 1;
    if (nextStep >= ONBOARDING_PAGES.length) {
      return;
    }
    goToStep(nextStep);
  };

  const handlePrev = () => {
    if (transitioningRef.current) {
      return;
    }
    hapticTap();
    if (currentStep <= 0) {
      return;
    }
    goToStep(currentStep - 1);
  };

  const handleDrawerLayoutHeight = (height: number) => {
    if (Math.abs(height - drawerHeightRef.current) < 1) {
      return;
    }
    drawerHeightRef.current = height;
    setDrawerReserve(height);
    if (!hasMeasuredDrawerRef.current) {
      hasMeasuredDrawerRef.current = true;
      setIsDrawerMeasured(true);
      drawerHeightAnim.setValue(height);
      return;
    }
    Animated.spring(drawerHeightAnim, {
      toValue: height,
      useNativeDriver: false,
      damping: 24,
      stiffness: 260,
      mass: 0.7,
    }).start();
  };

  const activePage = ONBOARDING_PAGES[currentStep];
  const usesLightProgress =
    activePage?.id === 'intro' ||
    activePage?.id === 'ai' ||
    activePage?.id === 'premium';
  const progressInactiveColor = usesLightProgress
    ? 'rgba(17,17,17,0.28)'
    : 'rgba(255,255,255,0.85)';

  return (
    <Animated.View style={[styles.screen, {opacity: fadeAnim}]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {currentStep > 0 ? (
        <Pressable
          onPress={handlePrev}
          style={[styles.backButton, {top: Math.max(insets.top, 16)}]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Previous">
          <BackIcon width={22} height={22} color="#111111" />
        </Pressable>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={ONBOARDING_PAGES}
        renderItem={({item}) => (
          <OnboardingPageBackground
            page={item}
            drawerReserve={item.variant === 'premium' ? drawerReserve : 0}
          />
        )}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        onMomentumScrollEnd={event => {
          const nextStep = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
          setCurrentStep(nextStep);
          transitioningRef.current = false;
        }}
        onScroll={event => {
          pageStepAnim.setValue(event.nativeEvent.contentOffset.x / SCREEN_W);
        }}
        scrollEventThrottle={16}
        style={styles.list}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.progressShell,
          {
            opacity: isDrawerMeasured ? 1 : 0,
            transform: [{translateY: Animated.multiply(drawerHeightAnim, -1)}],
          },
        ]}>
        <OnboardingPageProgress
          total={ONBOARDING_PAGES.length}
          animatedStep={pageStepAnim}
          inactiveColor={progressInactiveColor}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawerShell,
          {
            height: drawerHeightAnim,
            backgroundColor:
              activePage?.variant === 'premium' ? C.drawer : 'transparent',
          },
        ]}>
        {activePage?.variant === 'premium' ? (
          <OnboardingPremiumDrawer
            step={currentStep}
            total={ONBOARDING_PAGES.length}
            bottomInset={insets.bottom}
            onFinish={handleFinish}
            floating={false}
            onLayoutHeight={handleDrawerLayoutHeight}
          />
        ) : activePage ? (
          <OnboardingDrawer
            page={activePage}
            step={currentStep}
            total={ONBOARDING_PAGES.length}
            bottomInset={insets.bottom}
            onNext={handleNext}
            onLayoutHeight={handleDrawerLayoutHeight}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  list: {
    flex: 1,
  },
  progressShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
    zIndex: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressLine: {
    height: 4,
    borderRadius: 999,
  },
  drawerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const pageStyles = StyleSheet.create({
  page: {
    width: SCREEN_W,
    flex: 1,
    backgroundColor: '#ffffff',
  },
  pageBackdrop: {
    width: SCREEN_W,
    flex: 1,
    backgroundColor: '#0d1218',
  },
  pagePremium: {
    width: SCREEN_W,
    flex: 1,
    backgroundColor: '#ffffff',
  },
  heroBand: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImageFitHeight: {
    height: '100%',
  },
  heroArea: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  heroAreaFeature: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroImageFeature: {
    width: SCREEN_W * 2.08,
    height: '118%',
    transform: [{translateY: -88}],
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.bg,
  },
});

const drawerStyles = StyleSheet.create({
  drawer: {
    backgroundColor: C.drawer,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 20,
    paddingHorizontal: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: -6},
    elevation: 12,
  },
  drawerInline: {
    width: '100%',
  },
  copyBlock: {
    marginBottom: 16,
    gap: 6,
  },
  title: {
    fontFamily: TITLE_FONT,
    fontSize: 25,
    lineHeight: 31,
    color: C.text,
    letterSpacing: -0.6,
  },
  body: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 22,
    color: C.sub,
  },
  bullets: {
    gap: 13,
    marginBottom: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletIconSlot: {
    width: BULLET_ICON,
    height: BULLET_ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footerRowFlush: {
    marginTop: 18,
  },
  stepLabel: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    color: C.sub,
    letterSpacing: 0.3,
  },
  nextButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonPressed: {
    opacity: 0.9,
    transform: [{scale: 0.96}],
  },
});
