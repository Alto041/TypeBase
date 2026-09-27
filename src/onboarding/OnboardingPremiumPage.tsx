import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import CheckIcon from '../../assets/check.svg';
import {PremiumGlowBg} from '../licensing/PremiumGlowBg';
import {usePremium} from '../licensing/PremiumContext';

const C = {
  heroBg: '#ffffff',
  heroText: '#111111',
  drawerBg: '#111111',
  text: '#ffffff',
  sub: 'rgba(255,255,255,0.62)',
  accent: '#ffc700',
} as const;

const TITLE_FONT = 'Geist';
const BODY_FONT = 'Inter';
const BULLET_ICON = 22;

const BULLETS = [
  {text: 'Every paid extra is yours from day one. All of it, not one piece at a time.'},
  {text: 'Use AI on your phone when you\u2019d rather not send words to the cloud.'},
  {text: 'Themes, plugins, gestures, stickers, typing sounds. The fun stuff.'},
];

const HERO_MINI_FEATURES = [
  'The full keyboard',
  'AI on your phone, if you want it',
  'Pay once. No subscription.',
] as const;

type Props = {
  step: number;
  total: number;
  bottomInset: number;
  onFinish: () => void;
  floating?: boolean;
  onLayoutHeight?: (height: number) => void;
};

export function OnboardingPremiumHero({drawerReserve = 320}: {drawerReserve?: number}) {
  return (
    <View
      style={[
        styles.heroArea,
        {paddingBottom: drawerReserve + 28},
      ]}
      pointerEvents="none">
      <PremiumGlowBg />
      <View style={styles.heroCopy}>
        <Text style={styles.heroKicker}>Premium</Text>
        {HERO_MINI_FEATURES.map(item => (
          <Text key={item} style={styles.heroFeature}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function OnboardingPremiumDrawer({
  step,
  total,
  bottomInset,
  onFinish,
  floating = true,
  onLayoutHeight,
}: Props) {
  const {isPremium, loading, price, purchase, restore} = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  const finishAfterPurchase = useCallback(() => {
    onFinish();
  }, [onFinish]);

  const onBuy = useCallback(async () => {
    if (loading || busy) {
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
    if (isPremium) {
      onFinish();
      return;
    }
    setBusy('purchase');
    try {
      const success = await purchase();
      if (success) {
        finishAfterPurchase();
      }
    } catch (e) {
      Alert.alert(
        'TypeBase',
        e instanceof Error ? e.message : 'Something went wrong starting checkout. Try again?',
      );
    } finally {
      setBusy(null);
    }
  }, [busy, finishAfterPurchase, isPremium, loading, onFinish, purchase]);

  const onRestore = useCallback(async () => {
    if (loading || busy) {
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
    setBusy('restore');
    try {
      const success = await restore();
      if (success) {
        finishAfterPurchase();
      } else {
        Alert.alert(
          'TypeBase',
          'We couldn\u2019t find a purchase for this Google account. Already bought it on another account?',
        );
      }
    } catch (e) {
      Alert.alert(
        'TypeBase',
        e instanceof Error ? e.message : 'Restore didn\u2019t work this time. Try again in a moment.',
      );
    } finally {
      setBusy(null);
    }
  }, [busy, finishAfterPurchase, loading, restore]);

  const onSkip = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    onFinish();
  }, [onFinish]);

  const buyLabel = isPremium ? 'Continue' : price ? `Unlock \u00b7 ${price}` : 'Unlock';
  const actionBusy = loading || busy !== null;

  return (
    <View
      onLayout={event => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.drawer,
        floating ? styles.drawerFloating : null,
        {paddingBottom: Math.max(bottomInset, 14) + 10},
      ]}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>Want the full keyboard?</Text>
        <Text style={styles.body}>
          One payment on this phone. Keep every premium piece. No monthly bill.
        </Text>
      </View>

      <View style={styles.bullets}>
        {BULLETS.map(bullet => (
          <View key={bullet.text} style={styles.bulletRow}>
            <View style={styles.bulletIconSlot}>
              <CheckIcon width={14} height={14} color={C.accent} />
            </View>
            <Text style={styles.bulletText}>{bullet.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footerRow}>
        <Pressable
          onPress={onSkip}
          disabled={actionBusy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip for now">
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>

        <Text style={styles.stepLabel}>
          {step + 1} / {total}
        </Text>

        <View style={styles.footerActions}>
          <Pressable
            onPress={() => void onRestore()}
            disabled={actionBusy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Restore purchase"
            style={({pressed}) => [styles.restoreBtn, pressed && styles.btnPressed]}>
            <Text style={styles.restoreGlyph}>↻</Text>
          </Pressable>

          <Pressable
            onPress={() => void onBuy()}
            disabled={actionBusy}
            accessibilityRole="button"
            accessibilityLabel={`Unlock premium${price ? ` for ${price}` : ''}`}
            style={({pressed}) => [
              styles.buyBtn,
              actionBusy && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}>
            {busy === 'purchase' ? (
              <ActivityIndicator color="#111111" size="small" />
            ) : (
              <Text style={styles.buyBtnText}>{buyLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroArea: {
    flex: 1,
    width: '100%',
    backgroundColor: C.heroBg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 56,
  },
  heroCopy: {
    width: '100%',
    gap: 6,
    zIndex: 2,
  },
  heroKicker: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    letterSpacing: 1.2,
    color: 'rgba(17,17,17,0.5)',
  },
  heroFeature: {
    fontFamily: TITLE_FONT,
    fontSize: 24,
    lineHeight: 28,
    color: C.heroText,
    letterSpacing: -0.8,
  },
  drawer: {
    backgroundColor: C.drawerBg,
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
  drawerFloating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    marginBottom: 16,
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
  skipText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    color: C.sub,
    minWidth: 56,
  },
  stepLabel: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    color: C.sub,
    letterSpacing: 0.3,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 56,
    justifyContent: 'flex-end',
  },
  restoreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreGlyph: {
    fontSize: 22,
    color: C.sub,
  },
  buyBtn: {
    minWidth: 88,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    color: '#111111',
    fontWeight: '600',
  },
  btnDisabled: {opacity: 0.55},
  btnPressed: {
    opacity: 0.9,
    transform: [{scale: 0.96}],
  },
});
