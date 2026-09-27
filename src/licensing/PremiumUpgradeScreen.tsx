import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import BackIcon from '../../assets/back.svg';
import {PremiumGlowBg} from './PremiumGlowBg';
import {
  renderTypebaseProIcon,
  TYPEBASE_PRO_FEATURES,
} from './typebaseProFeatures';
import {usePremium} from './PremiumContext';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  accent: '#ffc700',
  red: '#D71921',
} as const;

const {height: SCREEN_H} = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_H * 0.44);

const TITLE_FONT = 'Geist';
const BODY_FONT = 'Inter';

type PremiumUpgradeScreenProps = {
  onBack?: () => void;
};

export function PremiumUpgradeScreen({onBack}: PremiumUpgradeScreenProps) {
  const insets = useSafeAreaInsets();
  const {isPremium, loading, price, purchase, restore} = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = {
    bg: C.card,
    text: C.text,
    sub: C.sub,
    border: C.border,
    kicker: 'rgba(17,17,17,0.5)',
  };

  useEffect(() => {
    if (!onBack) {
      return;
    }
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => backHandler.remove();
  }, [onBack]);

  const handlePurchase = async () => {
    void Haptics.selectionAsync().catch(() => {});
    setError(null);
    setBusy('purchase');
    try {
      const success = await purchase();
      if (!success) {
        setError('Purchase was cancelled or could not be completed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    void Haptics.selectionAsync().catch(() => {});
    setError(null);
    setBusy('restore');
    try {
      const restored = await restore();
      if (!restored) {
        setError('No previous purchase found for this Google account.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setBusy(null);
    }
  };

  const actionLoading = busy !== null || loading;
  const footerH = 78 + Math.max(insets.bottom, 16) + (error ? 24 : 0);

  const onBackPress = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    onBack?.();
  }, [onBack]);

  return (
    <View style={[styles.screen, {backgroundColor: t.bg}]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />

      <View
        style={[
          styles.heroBand,
          {height: HERO_HEIGHT, paddingTop: Math.max(insets.top, 16)},
        ]}>
        <PremiumGlowBg />
        {onBack ? (
          <Pressable
            onPress={onBackPress}
            style={[styles.backBtn, {top: Math.max(insets.top, 12)}]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <BackIcon width={22} height={22} color={C.text} />
          </Pressable>
        ) : null}
        <View style={styles.heroInner}>
          <Text style={[styles.kicker, {color: t.kicker}]}>TYPEBASE PREMIUM</Text>
          <Text style={[styles.heroTitle, {color: t.text}]}>Everything unlocked.</Text>
          <Text style={[styles.heroTitle, styles.heroTitleAccent, {color: t.text}]}>
            Yours to keep.
          </Text>
          <Text style={[styles.heroBody, {color: t.sub}]}>
            Pay once for this phone. No subscriptions — full keyboard power whenever you type.
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.contentSheet,
          {backgroundColor: t.bg, borderTopColor: 'rgba(0,0,0,0.06)'},
        ]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, {paddingBottom: footerH + 28}]}
          showsVerticalScrollIndicator={false}
          bounces>
          <Text style={[styles.sheetTitle, {color: t.text}]}>Here&apos;s what you get</Text>
          <Text style={[styles.sheetSub, {color: t.sub}]}>
            All {TYPEBASE_PRO_FEATURES.length} areas, one purchase, on this device.
          </Text>

          <View style={[styles.toolsCard, {borderColor: t.border}]}>
            {TYPEBASE_PRO_FEATURES.map((feature, i) => (
              <View key={feature.key}>
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, {backgroundColor: '#f7f7f8'}]}>
                    {renderTypebaseProIcon(feature.key, t.text)}
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={[styles.featureName, {color: t.text}]}>{feature.name}</Text>
                    <Text style={[styles.featureDesc, {color: t.sub}]}>{feature.desc}</Text>
                  </View>
                </View>
                {i < TYPEBASE_PRO_FEATURES.length - 1 ? (
                  <View style={[styles.featureDivider, {backgroundColor: t.border}]} />
                ) : null}
              </View>
            ))}
          </View>

          <Text style={[styles.footNote, {color: t.sub}]}>
            {isPremium
              ? "You're all set — Premium is active on this phone."
              : 'Already bought it? Tap restore and you\u2019re back in.'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>

      <View
        style={[
          styles.stickyFooter,
          {
            backgroundColor: t.bg,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopColor: t.border,
          },
        ]}>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => void handlePurchase()}
            disabled={actionLoading || isPremium}
            accessibilityRole="button"
            accessibilityLabel={
              isPremium
                ? 'Premium unlocked'
                : price
                  ? `Get Premium for ${price}`
                  : 'Get Premium'
            }
            style={[styles.buyBtn, (actionLoading || isPremium) && styles.btnDisabled]}>
            {busy === 'purchase' ? (
              <ActivityIndicator color="#111111" />
            ) : isPremium ? (
              <Text style={styles.buyBtnMain}>You&apos;re in</Text>
            ) : (
              <Text style={styles.buyBtnMain}>
                Get Premium{price ? ` · ${price}` : ''}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => void handleRestore()}
            disabled={actionLoading || isPremium}
            accessibilityRole="button"
            accessibilityLabel="Restore purchase"
            style={[
              styles.restoreBtn,
              {borderColor: t.border},
              actionLoading && styles.btnDisabled,
            ]}>
            {busy === 'restore' ? (
              <ActivityIndicator color={t.text} size="small" />
            ) : (
              <Text style={[styles.restoreGlyph, {color: t.text}]}>↻</Text>
            )}
          </Pressable>
        </View>

        {!isPremium && !actionLoading ? (
          <Text style={[styles.priceFootnote, {color: t.sub}]}>
            pay once, keep it forever · Quivox Engineering
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  heroBand: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingBottom: 36,
  },
  backBtn: {
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
  heroInner: {
    gap: 10,
    zIndex: 2,
  },
  kicker: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: TITLE_FONT,
    letterSpacing: -1.5,
  },
  heroTitleAccent: {
    marginTop: -4,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: BODY_FONT,
    maxWidth: 320,
    marginTop: 4,
  },
  contentSheet: {
    flex: 1,
    marginTop: -26,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  sheetTitle: {
    fontFamily: TITLE_FONT,
    fontSize: 22,
    lineHeight: 27,
    marginBottom: 6,
    letterSpacing: -0.8,
  },
  sheetSub: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  toolsCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    gap: 3,
    paddingTop: 1,
  },
  featureName: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '500',
  },
  featureDesc: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  featureDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
  },
  footNote: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: BODY_FONT,
    marginTop: 4,
  },
  error: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
    fontFamily: BODY_FONT,
    marginTop: 8,
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buyBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buyBtnMain: {
    color: '#111111',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  restoreBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreGlyph: {
    fontSize: 26,
    lineHeight: 28,
  },
  priceFootnote: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: BODY_FONT,
    fontSize: 12,
    lineHeight: 16,
  },
  btnDisabled: {opacity: 0.55},
});
