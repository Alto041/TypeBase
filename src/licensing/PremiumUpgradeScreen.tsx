import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AiConfigBlackIcon from '../../assets/Artificial.svg';
import CheckIcon from '../../assets/check.svg';
import GestureIcon from '../../assets/gesture.svg';
import ItemsIcon from '../../assets/items.svg';
import NextLineIcon from '../../assets/next_line.svg';
import PersonalIcon from '../../assets/personal.svg';
import ThemesIcon from '../../assets/themes.svg';
import {usePremium} from './PremiumContext';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  red: '#D71921',
  green: '#2CC642',
  muted: '#b0b0b5',
} as const;

const CARD_R = 14;
const ROW_ICON = 20;
const ACTION_BTN_SIZE = 52;
const TEXT_KERNING = -0.7;

const BENEFITS = [
  {
    icon: ItemsIcon,
    title: 'Keyboard plugins',
    hint: 'Format, clipboard, calculator',
  },
  {
    icon: ThemesIcon,
    title: 'Themes & styling',
    hint: 'Themes and customization',
  },
  {
    icon: GestureIcon,
    title: 'Gestures & swipe',
    hint: 'Swipe typing',
  },
  {
    icon: PersonalIcon,
    title: 'Smart autocorrect',
    hint: 'Learning and auto-apply',
  },
  {
    icon: AiConfigBlackIcon,
    title: 'AI toolkit',
    hint: 'Translate, rewrite, voice',
  },
] as const;

type PremiumUpgradeScreenProps = {
  onBack?: () => void;
};

export function PremiumUpgradeScreen({onBack}: PremiumUpgradeScreenProps) {
  const {isPremium, loading, price, purchase, restore} = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Premium</Text>

        {!isPremium ? (
          <View style={styles.priceCard}>
            {loading && !price ? (
              <ActivityIndicator color={C.sub} size="small" />
            ) : (
              <>
                <Text style={styles.priceEyebrow}>One-time</Text>
                <Text style={styles.priceAmount}>{price ?? '...'}</Text>
                <Text style={styles.priceCaption}>Pay once, keep forever</Text>
              </>
            )}
          </View>
        ) : (
          <View style={styles.priceCard}>
            <View style={styles.activeRow}>
              <View style={styles.activeDot} />
              <Text style={styles.activeLabel}>Active</Text>
            </View>
            <Text style={styles.priceCaption}>Full access unlocked</Text>
          </View>
        )}

        <View style={styles.benefitStack}>
          {BENEFITS.map((benefit, index) => {
            const positionStyle =
              index === 0
                ? styles.firstBenefitCard
                : index === BENEFITS.length - 1
                  ? styles.lastBenefitCard
                  : styles.middleBenefitCard;
            const Icon = benefit.icon;

            return (
              <View key={benefit.title} style={[styles.benefitCard, positionStyle]}>
                <View style={styles.benefitInner}>
                  <Icon width={ROW_ICON} height={ROW_ICON} color={C.text} />
                  <View style={styles.benefitTextCol}>
                    <Text style={styles.benefitTitle}>{benefit.title}</Text>
                    <Text style={styles.benefitHint}>{benefit.hint}</Text>
                  </View>
                  {isPremium ? (
                    <CheckIcon width={16} height={16} color={C.green} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {!isPremium ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.unlockBtn, busy !== null && styles.btnDisabled]}
              disabled={busy !== null || loading}
              onPress={() => void handlePurchase()}>
              {busy === 'purchase' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.unlockBtnText}>
                  {price ? `Unlock for ${price}` : 'Unlock TypeBase'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.restoreBtn, busy !== null && styles.btnDisabled]}
              disabled={busy !== null || loading}
              onPress={() => void handleRestore()}
              accessibilityLabel="Restore purchase">
              {busy === 'restore' ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <NextLineIcon width={20} height={20} color="#ffffff" />
              )}
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.footerNote}>
          {isPremium
            ? 'Premium is linked to your Google account on this device.'
            : 'A Quivox Engineering product'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 110,
    gap: 10,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    letterSpacing: -2.5,
    fontFamily: 'FragmentMono',
    marginBottom: 4,
  },
  priceCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 4,
    marginBottom: 4,
    minHeight: 88,
    justifyContent: 'center',
  },
  priceEyebrow: {
    fontSize: 11,
    color: C.sub,
    fontFamily: 'FragmentMono',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  priceAmount: {
    fontSize: 32,
    lineHeight: 36,
    color: C.text,
    fontFamily: 'Geist',
    fontWeight: '400',
    letterSpacing: -1.5,
  },
  priceCaption: {
    fontSize: 13,
    color: C.sub,
    fontFamily: 'Inter',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },
  activeLabel: {
    fontSize: 16,
    color: C.text,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  benefitStack: {
    gap: 4,
  },
  benefitCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  firstBenefitCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  middleBenefitCard: {
    borderRadius: 10,
  },
  lastBenefitCard: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  benefitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
  },
  benefitTextCol: {
    flex: 1,
    gap: 2,
  },
  benefitTitle: {
    color: C.text,
    fontSize: 14,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  benefitHint: {
    color: C.sub,
    fontSize: 12,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  unlockBtn: {
    flex: 1,
    backgroundColor: C.text,
    borderRadius: CARD_R,
    height: ACTION_BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  unlockBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
    textTransform: 'uppercase',
  },
  restoreBtn: {
    width: ACTION_BTN_SIZE,
    height: ACTION_BTN_SIZE,
    borderRadius: CARD_R,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.red,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  error: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: C.muted,
    letterSpacing: TEXT_KERNING,
    fontFamily: 'FragmentMono',
    marginTop: 4,
    paddingHorizontal: 8,
  },
});
