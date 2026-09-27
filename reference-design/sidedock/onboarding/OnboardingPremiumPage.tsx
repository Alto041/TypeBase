import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PremiumGlowBg } from './PremiumGlowBg';
import { usePremiumContext } from '../context/PremiumContext';
import { hapticTap } from '../lib/haptics';
import { queryProducts, type BillingProduct } from '../lib/nativeBilling';
import { playUiSound } from '../lib/uiSounds';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  heroBg: '#ffffff',
  heroText: '#111111',
  drawerBg: '#111111',
  text: '#ffffff',
  sub: 'rgba(255,255,255,0.62)',
  accent: '#ffc700',
} as const;

const TITLE_FONT = 'NType82';
const BODY_FONT = 'Inter';
const BULLET_ICON = 22;

const BULLETS = [
  { icon: 'diamond-outline' as const, text: 'Every premium tool unlocked from day one.' },
  { icon: 'hardware-chip-outline' as const, text: 'On-device AI, ready whenever you need it.' },
  { icon: 'color-palette-outline' as const, text: 'Deeper personalization for layout, look, and flow.' },
];

const HERO_MINI_FEATURES = ['All tools unlocked', 'On-device AI', 'One-time purchase'] as const;

function formatDaysLeft(daysLeft: number | null): string | null {
  if (daysLeft == null) return null;
  if (daysLeft <= 0) return 'Trial ends today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

type Props = {
  step: number;
  total: number;
  bottomInset: number;
  onFinish: () => void;
  floating?: boolean;
  onLayoutHeight?: (height: number) => void;
};

export function OnboardingPremiumHero() {
  return (
    <View style={styles.heroArea} pointerEvents="none">
      <PremiumGlowBg />
      <View style={styles.heroCopy}>
        <Text style={styles.heroKicker}>SIDE DOCK PRO</Text>
        {HERO_MINI_FEATURES.map((item) => (
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
  const { activate, restore, loading, status, isTrialActive, trialDaysLeft } = usePremiumContext();

  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const products = await queryProducts();
        if (cancelled) return;
        const p =
          products.find((x: BillingProduct) => x.productId === 'side_plus_premium') ?? products[0];
        setPriceLabel(p?.formattedPrice ?? null);
      } catch {
        if (!cancelled) setPriceLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trialLabel = useMemo(() => {
    if (!isTrialActive) return null;
    const d = formatDaysLeft(trialDaysLeft);
    return d ? `Trial · ${d}` : 'Trial active';
  }, [isTrialActive, trialDaysLeft]);

  const finishAfterPurchase = useCallback(() => {
    void playUiSound('buyingPrem');
    onFinish();
  }, [onFinish]);

  const onBuy = useCallback(async () => {
    if (loading) return;
    void hapticTap();
    if (status.isPremium && !isTrialActive) {
      onFinish();
      return;
    }
    try {
      const next = await activate();
      if (next.isPremium) finishAfterPurchase();
    } catch (e) {
      Alert.alert('Side+', e instanceof Error ? e.message : 'Could not start purchase.');
    }
  }, [activate, finishAfterPurchase, isTrialActive, loading, onFinish, status.isPremium]);

  const onRestore = useCallback(async () => {
    if (loading) return;
    void hapticTap();
    try {
      const next = await restore();
      if (next.isPremium) finishAfterPurchase();
    } catch (e) {
      Alert.alert('Side+', e instanceof Error ? e.message : 'Could not restore purchase.');
    }
  }, [finishAfterPurchase, loading, restore]);

  const onSkip = useCallback(() => {
    void hapticTap();
    onFinish();
  }, [onFinish]);

  const buyLabel =
    status.isPremium && !isTrialActive
      ? 'Continue'
      : priceLabel
        ? priceLabel
        : 'Buy';

  return (
    <View
      onLayout={(event) => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.drawer,
        floating ? styles.drawerFloating : null,
        { paddingBottom: Math.max(bottomInset, 14) + 10 },
      ]}
    >
        <View style={styles.copyBlock}>
          <Text style={styles.title}>Side Dock Pro</Text>
          <Text style={styles.body}>
            Unlock everything in one go, and keep it forever on this device.
          </Text>
        </View>

        <View style={styles.bullets}>
          {BULLETS.map((bullet) => (
            <View key={bullet.text} style={styles.bulletRow}>
              <View style={styles.bulletIconSlot}>
                <Ionicons name={bullet.icon} size={17} color={C.text} style={styles.bulletIon} />
              </View>
              <Text style={styles.bulletText}>{bullet.text}</Text>
            </View>
          ))}
        </View>

        {trialLabel ? (
          <View style={styles.trialRow}>
            <View style={styles.trialTrack}>
              <View
                style={[
                  styles.trialFill,
                  { width: `${Math.max(0, Math.min(100, ((trialDaysLeft ?? 0) / 3) * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.trialCaption}>{trialLabel}</Text>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <Pressable
            onPress={onSkip}
            disabled={loading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.skipText}>Not now</Text>
          </Pressable>

          <Text style={styles.stepLabel}>{step + 1} / {total}</Text>

          <View style={styles.footerActions}>
            <Pressable
              onPress={onRestore}
              disabled={loading}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Restore purchase"
              style={({ pressed }) => [styles.restoreBtn, pressed && styles.btnPressed]}
            >
              <Ionicons name="refresh" size={18} color={C.sub} />
            </Pressable>

            <Pressable
              onPress={onBuy}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={`Buy premium ${buyLabel}`}
              style={({ pressed }) => [
                styles.buyBtn,
                loading && styles.btnDisabled,
                pressed && styles.btnPressed,
              ]}
            >
              {loading ? (
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.heroBg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: SCREEN_W * 0.08,
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 8,
    paddingTop: 12,
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
    shadowOffset: { width: 0, height: -6 },
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
  bulletIon: {
    width: BULLET_ICON,
    textAlign: 'center',
  },
  bulletText: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
  },
  trialRow: {
    marginBottom: 14,
    gap: 5,
  },
  trialTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  trialFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  trialCaption: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    color: C.sub,
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
  },
  btnDisabled: { opacity: 0.55 },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
