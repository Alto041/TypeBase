import React, {useState} from 'react';
import {
  Animated,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AiConfigScreen} from './AiConfigScreen';
import {useScreenTransition} from './lib/screenTransition';
import {keyboardBridge} from './src/keyboard/keyboardBridge';

const C = {
  bg: '#f2f2f4',
  text: '#111111',
  sub: '#6b6b6b',
} as const;

const TEXT_KERNING = -0.7;
const BLUR_SHIFT_RIGHT = 28;
const BLUR_BLOB = Image.resolveAssetSource(require('./assets/Group 8.png'));
const BLUR_ASPECT_RATIO =
  BLUR_BLOB.width && BLUR_BLOB.height ? BLUR_BLOB.width / BLUR_BLOB.height : 0.72;

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

type BlurBlobVariant = 'center' | 'top' | 'bottomRight';

function BlurBlobImage({variant = 'center'}: {variant?: BlurBlobVariant}) {
  const {width} = useWindowDimensions();
  const isBottomRight = variant === 'bottomRight';
  const blobScale = isBottomRight ? 1.0 : 1.22;
  const blobWidth = width * blobScale;
  const blobHeight = blobWidth / BLUR_ASPECT_RATIO;
  const isTop = variant === 'top';

  return (
    <View
      pointerEvents="none"
      style={isBottomRight ? styles.blurBlobWrapEdge : styles.blurBlobWrap}>
      <Image
        source={BLUR_BLOB}
        style={[
          styles.blurBlob,
          isTop
            ? styles.blurBlobTop
            : isBottomRight
              ? styles.blurBlobBottomRight
              : styles.blurBlobCenter,
          {
            width: blobWidth,
            height: blobHeight,
            transform: isTop
              ? [
                  {translateX: -blobWidth / 2},
                  {translateY: -blobHeight * 0.38},
                ]
              : isBottomRight
                ? []
                : [
                    {translateX: -blobWidth / 2 + BLUR_SHIFT_RIGHT},
                    {translateY: -blobHeight / 2},
                  ],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

function blurVariantForPage(pageIndex: number): BlurBlobVariant {
  if (pageIndex === 1) {
    return 'top';
  }
  if (pageIndex === 2) {
    return 'bottomRight';
  }
  return 'center';
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <BlurBlobImage variant={blurVariantForPage(pageIndex)} />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={animatedStyle}>
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
                <Pressable style={styles.ctaButton} onPress={page.onPress}>
                  <Text style={[styles.ctaLabel, monoFont]}>{page.cta}</Text>
                </Pressable>
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
    overflow: 'visible',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  blurBlobWrap: {
    position: 'absolute',
    top: -220,
    right: -220,
    bottom: -220,
    left: -220,
    zIndex: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurBlobWrapEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  blurBlob: {
    position: 'absolute',
  },
  blurBlobCenter: {
    top: '50%',
    left: '50%',
  },
  blurBlobTop: {
    top: 0,
    left: '50%',
  },
  blurBlobBottomRight: {
    bottom: -80,
    right: 0,
  },
  content: {
    flex: 1,
    zIndex: 1,
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
  ctaButton: {
    width: '100%',
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingVertical: 16,
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
