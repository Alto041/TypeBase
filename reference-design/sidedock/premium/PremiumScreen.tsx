import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumContext } from '../context/PremiumContext';
import { useThemeMode } from '../context/ThemeContext';
import { hapticTap } from '../lib/haptics';
import { playUiSound } from '../lib/uiSounds';
import { queryProducts, type BillingProduct } from '../lib/nativeBilling';
import { PremiumGlowBg } from './PremiumGlowBg';
import AppsIcon from '../assets/tools/apps.svg';
import AppsIconW from '../assets/tools/apps-w.svg';
import AssignmentIcon from '../assets/tools/assignment.svg';
import AssignmentIconW from '../assets/tools/assignment-w.svg';
import CropIcon from '../assets/tools/crop.svg';
import CropIconW from '../assets/tools/crop-w.svg';
import SpeechToTextIcon from '../assets/tools/speech_to_text.svg';
import SpeechToTextIconW from '../assets/tools/speech_to_text-w.svg';
import ColorPickerIcon from '../assets/colors.svg';
import ColorPickerIconW from '../assets/colors-w.svg';
import CoinIcon from '../assets/coin.svg';
import CoinIconW from '../assets/coin_w.svg';
import CaffeineIcon from '../assets/coffee.svg';
import CaffeineIconW from '../assets/coffee_w.svg';
import PlayerIcon from '../assets/player.svg';
import PlayerIconW from '../assets/player_w.svg';
import BrightnessIcon from '../assets/brightness.svg';
import BrightnessIconW from '../assets/brightness_w.svg';
import AlarmIcon from '../assets/alarm.svg';
import AlarmIconW from '../assets/alarm_w.svg';
import AiIcon from '../assets/home/Artificial.svg';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  accent: '#ffc700',
} as const;

const { height: SCREEN_H } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_H * 0.44);

const TITLE_FONT = 'NType82';
const BODY_FONT = 'Inter';
const PRO_ICON = 22;
const REGULAR_PRICE_USD = '$2.50';

export const PRO_FEATURES = [
  { key: 'ai', name: 'On Device AI', desc: 'Get help without sending anything off your phone.' },
  { key: 'app', name: 'App Shortcut', desc: 'Jump into any app straight from the edge.' },
  { key: 'clipboard', name: 'Clipboard', desc: 'Copy it, find it later, paste it back in seconds.' },
  { key: 'autocrop', name: 'Circle Cut', desc: 'Turn a screenshot into a clean circular cutout.' },
  { key: 'audioflow', name: 'Audio Flow', desc: 'Watch your music and audio come alive on screen.' },
  { key: 'colorpicker', name: 'Color Picker', desc: 'Pick up colors from anything you see.' },
  { key: 'coinflip', name: 'Coin Flip', desc: 'Stuck deciding? Flip a coin and move on.' },
  { key: 'caffeine', name: 'Caffeine', desc: 'Keep your screen awake while you work or read.' },
  { key: 'mediacontroller', name: 'Media Controller', desc: 'Skip, pause, and play without leaving your app.' },
  { key: 'brightness', name: 'Brightness', desc: 'Dim or brighten your screen from the dock.' },
  { key: 'timer', name: 'Timer', desc: 'Set a countdown or alarm without digging through settings.' },
] as const;

export function renderProIcon(
  key: (typeof PRO_FEATURES)[number]['key'],
  isDark: boolean,
  iconColor: string,
) {
  switch (key) {
    case 'ai':
      return <AiIcon width={PRO_ICON} height={PRO_ICON} fill={iconColor} color={iconColor} />;
    case 'app': {
      const Icon = isDark ? AppsIconW : AppsIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'clipboard': {
      const Icon = isDark ? AssignmentIconW : AssignmentIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'autocrop': {
      const Icon = isDark ? CropIconW : CropIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'audioflow': {
      const Icon = isDark ? SpeechToTextIconW : SpeechToTextIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'colorpicker': {
      const Icon = isDark ? ColorPickerIconW : ColorPickerIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'coinflip': {
      const Icon = isDark ? CoinIconW : CoinIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'caffeine': {
      const Icon = isDark ? CaffeineIconW : CaffeineIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} fill={isDark ? undefined : iconColor} />;
    }
    case 'mediacontroller': {
      const Icon = isDark ? PlayerIconW : PlayerIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'brightness': {
      const Icon = isDark ? BrightnessIconW : BrightnessIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} />;
    }
    case 'timer': {
      const Icon = isDark ? AlarmIconW : AlarmIcon;
      return <Icon width={PRO_ICON} height={PRO_ICON} fill={isDark ? undefined : iconColor} />;
    }
  }
}

function formatDaysLeft(daysLeft: number | null): string | null {
  if (daysLeft == null) return null;
  if (daysLeft <= 0) return 'Trial ends today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

export function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, headingFontFamily, headingTextTransform, headingLetterSpacing } = useThemeMode();
  const { activate, restore, loading, status, hydrated, isTrialActive, trialDaysLeft } =
    usePremiumContext();

  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const products = await queryProducts();
        if (cancelled) return;
        const p = products.find((x: BillingProduct) => x.productId === 'side_plus_premium') ?? products[0];
        setPriceLabel(p?.formattedPrice ?? null);
      } catch {
        if (!cancelled) setPriceLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const surface = isDark ? '#0f0f10' : '#ffffff';

  const t = {
    bg: surface,
    card: isDark ? '#1b1b1f' : C.card,
    text: isDark ? '#f5f5f7' : C.text,
    sub: isDark ? '#b2b2ba' : C.sub,
    border: isDark ? '#2f2f34' : C.border,
    kicker: isDark ? 'rgba(245,245,247,0.45)' : 'rgba(17,17,17,0.5)',
  };

  const trialLabel = useMemo(() => {
    if (!isTrialActive) return null;
    const d = formatDaysLeft(trialDaysLeft);
    return d ? `Your trial · ${d}` : 'Trial is running';
  }, [isTrialActive, trialDaysLeft]);

  const onBuy = useCallback(async () => {
    if (loading) return;
    void hapticTap();
    try {
      const next = await activate();
      if (next.isPremium) void playUiSound('buyingPrem');
    } catch (e) {
      Alert.alert('Side+', e instanceof Error ? e.message : 'Could not start purchase.');
    }
  }, [activate, loading]);

  const onRestore = useCallback(async () => {
    if (loading) return;
    void hapticTap();
    try {
      const next = await restore();
      if (next.isPremium) void playUiSound('buyingPrem');
    } catch (e) {
      Alert.alert('Side+', e instanceof Error ? e.message : 'Could not restore purchase.');
    }
  }, [loading, restore]);

  const isOwned = status.isPremium && !isTrialActive;
  const footerH = 78 + Math.max(insets.bottom, 16) + (trialLabel ? 28 : 0) + (isOwned ? 0 : 18);

  return (
    <View style={[styles.screen, { backgroundColor: surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.heroBand, { height: HERO_HEIGHT, paddingTop: Math.max(insets.top, 16) }]}>
        <PremiumGlowBg />
        <View style={styles.heroInner}>
          <Text style={[styles.kicker, { color: t.kicker }]}>SIDE DOCK PRO</Text>
          <Text
            style={[
              styles.heroTitle,
              {
                color: t.text,
                fontFamily: headingFontFamily ?? TITLE_FONT,
                textTransform: headingTextTransform,
                letterSpacing: headingLetterSpacing,
              },
            ]}
          >
            Everything unlocked.
          </Text>
          <Text
            style={[
              styles.heroTitle,
              styles.heroTitleAccent,
              {
                color: t.text,
                fontFamily: headingFontFamily ?? TITLE_FONT,
                textTransform: headingTextTransform,
                letterSpacing: headingLetterSpacing,
              },
            ]}
          >
            Yours to keep.
          </Text>
          <Text style={[styles.heroBody, { color: t.sub }]}>
          Pay once for this phone. No subscriptions, no renewals. Just the full SideDock, whenever you need it.     </Text>
        </View>
      </View>

      <View
        style={[
          styles.contentSheet,
          { backgroundColor: t.bg, borderTopColor: isDark ? t.border : 'rgba(0,0,0,0.06)' },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: footerH + 28 }]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <Text
            style={[
              styles.sheetTitle,
              {
                color: t.text,
                fontFamily: headingFontFamily ?? TITLE_FONT,
                textTransform: headingTextTransform,
              },
            ]}
          >
            Here&apos;s what you get
          </Text>
          <Text style={[styles.sheetSub, { color: t.sub }]}>
            All {PRO_FEATURES.length} tools, one purchase, on this device.
          </Text>

          <View style={[styles.toolsCard, { borderColor: t.border }]}>
            {PRO_FEATURES.map((feature, i) => (
              <View key={feature.key}>
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: isDark ? '#252529' : '#f7f7f8' }]}>
                    {renderProIcon(feature.key, isDark, t.text)}
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={[styles.featureName, { color: t.text }]}>{feature.name}</Text>
                    <Text style={[styles.featureDesc, { color: t.sub }]}>{feature.desc}</Text>
                  </View>
                </View>
                {i < PRO_FEATURES.length - 1 ? (
                  <View style={[styles.featureDivider, { backgroundColor: t.border }]} />
                ) : null}
              </View>
            ))}
          </View>

          {hydrated ? (
            <Text style={[styles.footNote, { color: t.sub }]}>
              {status.isPremium
                ? "You're all set — Pro is active on this phone."
                : 'Already bought it? Hit restore and you\u2019re back in.'}
            </Text>
          ) : null}
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
        ]}
      >
        {trialLabel ? (
          <View style={styles.trialRow}>
            <View style={[styles.trialTrack, { backgroundColor: t.border }]}>
              <View
                style={[
                  styles.trialFill,
                  {
                    width: `${Math.max(0, Math.min(100, ((trialDaysLeft ?? 0) / 3) * 100))}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.trialCaption, { color: t.sub }]}>{trialLabel}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={onBuy}
            disabled={loading || isOwned}
            accessibilityRole="button"
            accessibilityLabel={
              isOwned
                ? 'Premium unlocked'
                : priceLabel
                  ? `Get Pro for ${priceLabel}, usually ${REGULAR_PRICE_USD}`
                  : 'Get Pro'
            }
            style={[styles.buyBtn, (loading || isOwned) && styles.btnDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#111111" />
            ) : isOwned ? (
              <Text style={styles.buyBtnMain}>You&apos;re in</Text>
            ) : (
              <Text style={styles.buyBtnMain}>
                Get Pro{priceLabel ? ` · ${priceLabel}` : ''}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={onRestore}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Restore purchase"
            style={[styles.restoreBtn, { borderColor: t.border }, loading && styles.btnDisabled]}
          >
            <Ionicons name="refresh" size={22} color={t.text} />
          </Pressable>
        </View>

        {!isOwned && !loading ? (
          <Text style={[styles.priceFootnote, { color: t.sub }]}>
            <Text style={styles.priceFootnoteWas}>{REGULAR_PRICE_USD}</Text>
            {'  '}pay once, keep it forever
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heroBand: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingBottom: 36,
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  sheetTitle: {
    fontFamily: TITLE_FONT,
    fontSize: 22,
    lineHeight: 27,
    marginBottom: 6,
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
  priceFootnote: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: BODY_FONT,
    fontSize: 12,
    lineHeight: 16,
  },
  priceFootnoteWas: {
    textDecorationLine: 'line-through',
  },
  btnDisabled: { opacity: 0.55 },
  trialRow: { marginBottom: 10, gap: 5 },
  trialTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  trialFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  trialCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: BODY_FONT,
  },
});
