import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAiCredits } from '../context/AiCreditsContext';
import { useScrollBottomPadding } from '../context/BottomNavInsetContext';
import { useAppSettingsNav } from '../context/AppSettingsNavContext';
import { useAccountNav } from '../context/AccountNavContext';
import { useClipboardNav } from '../context/ClipboardNavContext';
import { usePremiumContext } from '../context/PremiumContext';
import { usePremiumNav } from '../context/PremiumNavContext';
import { useSnippetsNav } from '../context/SnippetsNavContext';
import { useSidebar } from '../context/SidebarContext';
import { useSidebarPrefs } from '../context/SidebarPrefsContext';
import { useThemeMode } from '../context/ThemeContext';
import { canDrawOverlayPermission } from '../lib/overlayPermission';
import { applyNativeSidebarAppearance, setNativeSidebarServiceEnabled } from '../lib/nativeSidebarOverlay';
import { defaultSidebarPrefs } from '../lib/sidebarPrefsStorage';
import { hapticError, hapticSuccess, hapticTap } from '../lib/haptics';
import { PermissionDisclosureSheet } from './PermissionDisclosureSheet';
import { PillToggle } from './PillToggle';
import { playUiSound } from '../lib/uiSounds';
import { SUBTITLE_LETTER_SPACING } from '../lib/typography';

import AiIcon from '../assets/home/Artificial.svg';
import AccountAccessibilityIcon from '../assets/Account/accessibility_new.svg';
import AccountAccessibilityIconW from '../assets/Account/accessibility_new_w.svg';
import CrownIcon from '../assets/crown.svg';
import GrainIcon from '../assets/grain.svg';
import GrainIconW from '../assets/grain_w.svg';
import OverlayServiceIcon from '../assets/overlay_service.svg';
import OverlayServiceIconW from '../assets/overlay_service_w.svg';
import AssignmentIcon from '../assets/tools/assignment.svg';
import AssignmentIconW from '../assets/tools/assignment-w.svg';
const TimerImg = require('../assets/Timer.png');

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
  redDot: '#e63946',
  yellow: '#FFC700',
} as const;

const CARD_R = 25;
const TITLE_FONT = 'NType82';
const BODY_FONT = 'FragmentMono';
const SUBTITLE_FONT = 'Inter';
const INNER_R = 5;
const HOME_ICON = 22;

async function requestPostNotificationsIfNeeded(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

async function openDisplayOverOtherApps(): Promise<void> {
  const pkg = Application.applicationId;
  if (!pkg) throw new Error('Missing applicationId');
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION,
    { data: `package:${pkg}` },
  );
}

async function requestUnrestrictedBattery(): Promise<void> {
  const pkg = Application.applicationId;
  if (!pkg) throw new Error('Missing applicationId');
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
    { data: `package:${pkg}` },
  );
}

async function runAndroidEnableFlow(): Promise<void> {
  await requestPostNotificationsIfNeeded();
  await openDisplayOverOtherApps();
  try {
    await requestUnrestrictedBattery();
  } catch (e) {
    console.warn('Battery optimization intent:', e);
  }
}

export function HomeDockScreen() {
  const scrollBottomPad = useScrollBottomPadding(24);
  const { isDark, headingFontFamily, headingTextTransform, headingLetterSpacing } = useThemeMode();
  const { openAppSettings } = useAppSettingsNav();
  const { openAccount } = useAccountNav();
  const { openClipboardScreen } = useClipboardNav();
  const { openPremium } = usePremiumNav();
  const { openSnippets } = useSnippetsNav();
  const { isTrialActive, trialDaysLeft, isPremium } = usePremiumContext();
  const { hydrated: creditsReady, status } = useAiCredits();
  const { enabled, hydrated: sidebarHydrated, setEnabled, enableClassicDock } = useSidebar();
  const { setPrefs } = useSidebarPrefs();
  const [busy, setBusy] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const consentResolverRef = useRef<((value: boolean) => void) | null>(null);
  const showConsent = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      consentResolverRef.current = resolve;
      setConsentVisible(true);
    });
  }, []);

  const closeConsent = useCallback((value: boolean) => {
    setConsentVisible(false);
    const resolve = consentResolverRef.current;
    consentResolverRef.current = null;
    resolve?.(value);
  }, []);

  useEffect(() => {
    return () => {
      consentResolverRef.current?.(false);
      consentResolverRef.current = null;
    };
  }, []);

  const onToggleDock = useCallback(
    async (next: boolean): Promise<boolean> => {
      void hapticTap();
      if (!next) {
        await setEnabled(false);
        void playUiSound('turnOff');
        void hapticSuccess();
        return true;
      }
      if (Platform.OS === 'ios') {
        Alert.alert('Side Dock', 'This dock mode is only supported on Android.');
        return false;
      }
      if (Platform.OS === 'web') {
        Alert.alert('Side+', 'This feature is not available on web.');
        return false;
      }
      if (Platform.OS !== 'android') {
        await setEnabled(true);
        void playUiSound('turnOn');
        void hapticSuccess();
        return true;
      }
      const ok = await showConsent();
      if (!ok) return false;
      setBusy(true);
      try {
        const hasOverlayPermission = await canDrawOverlayPermission();
        if (!hasOverlayPermission) {
          await runAndroidEnableFlow();
          return false;
        }
        if (!isPremium) {
          const nextPrefs = { ...defaultSidebarPrefs, useOldDock: true };
          await setPrefs(nextPrefs);
          applyNativeSidebarAppearance(nextPrefs);
          setNativeSidebarServiceEnabled(true);
          await enableClassicDock();
          void playUiSound('turnOn');
          void hapticSuccess();
          return true;
        }
        await setEnabled(true);
        void playUiSound('turnOn');
        void hapticSuccess();
        return true;
      } catch (e) {
        console.warn(e);
        void hapticError();
        Alert.alert(
          'Side Dock',
          'Could not finish the permission steps. Check that Side Dock can open system settings, then try again.',
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [enableClassicDock, isPremium, setEnabled, setPrefs, showConsent],
  );

  const creditsSubtitle = !creditsReady
    ? '…'
    : status.enabled
      ? `${Math.max(0, Math.floor(status.remaining))} Credits Left for Today`
      : `${status.used} used today (unlimited)`;
  const showCreditsDot =
    creditsReady && status.enabled && status.remainingFrac < 0.2 && status.remaining > 0;
  const trialBadge = isTrialActive
    ? trialDaysLeft == null
      ? 'TRIAL'
      : trialDaysLeft <= 0
        ? 'ENDS'
        : `${trialDaysLeft} Days Left`
    : null;
  const t = {
    bg: isDark ? '#0f0f10' : C.bg,
    card: isDark ? '#1F1F1F' : C.card,
    text: isDark ? '#f5f5f7' : C.text,
    sub: isDark ? '#b2b2ba' : C.sub,
    border: isDark ? '#2f2f34' : C.border,
    badge: isDark ? '#ff7f8c' : C.redDot,
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <Text style={[styles.pageTitle, { color: t.text, fontFamily: headingFontFamily, textTransform: headingTextTransform, letterSpacing: headingLetterSpacing }]}>
          Homepage
        </Text>

        {/* Toggles */}
        <View style={styles.stack}>
          <View style={[styles.stackItem, styles.stackItemSolo, { backgroundColor: t.card }]}> 
            <View style={styles.toggleRow}>
              {isDark ? (
                <OverlayServiceIconW width={HOME_ICON} height={HOME_ICON} />
              ) : (
                <OverlayServiceIcon
                  width={HOME_ICON}
                  height={HOME_ICON}
                  color={t.text}
                  fill={t.text}
                />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowTitle, { color: t.text }]}>Overlay Service</Text>
              </View>
              {busy || !sidebarHydrated ? (
                <ActivityIndicator color={t.text} />
              ) : (
                <PillToggle
                  value={enabled}
                  onChange={(next) => void onToggleDock(next)}
                  accessibilityLabel="Turn on overlay service"
                  isDark={isDark}
                  disabled={false}
                />
              )}
            </View>
          </View>

        </View>

        {/* Pro + Account */}
        <View style={styles.stack}>
          <Pressable
            style={[
              styles.stackItem,
              styles.stackItemTop,
              styles.linkRow,
              styles.linkRowSingle,
              { backgroundColor: t.card },
            ]}
            onPress={() => {
              void hapticTap();
              if (!isPremium) void playUiSound('noPrem');
              openPremium();
            }}
            accessibilityRole="button"
            accessibilityLabel="Side Dock Pro"
          >
            <CrownIcon width={HOME_ICON} height={HOME_ICON} color={t.text} fill={t.text} />
            <View style={styles.linkTextWrap}>
              <View style={styles.titleWithDot}>
                <Text style={[styles.rowTitle, { color: t.text }]}>Side Dock Pro</Text>
                {trialBadge ? (
                  <View style={[styles.premiumBadge, { backgroundColor: t.badge }]}>
                    <Text style={styles.premiumBadgeText}>{trialBadge}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.stackItem,
              styles.stackItemBottom,
              styles.linkRow,
              styles.linkRowSingle,
              { backgroundColor: t.card },
            ]}
            onPress={() => {
              void hapticTap();
              openAccount();
            }}
            accessibilityRole="button"
            accessibilityLabel="Account"
          >
            {isDark ? (
              <AccountAccessibilityIconW width={HOME_ICON} height={HOME_ICON} />
            ) : (
              <AccountAccessibilityIcon
                width={HOME_ICON}
                height={HOME_ICON}
                color={t.text}
                fill={t.text}
              />
            )}
            <View style={styles.linkTextWrap}>
              <Text style={[styles.rowTitle, { color: t.text }]}>Account</Text>
            </View>
          </Pressable>
        </View>

        {/* AI + Clipboard */}
        <View style={styles.stack}>
          <Pressable
            style={[styles.stackItem, styles.stackItemTop, styles.linkRow, { backgroundColor: t.card }]}
            onPress={() => {
              void hapticTap();
              openAppSettings();
            }}
            accessibilityRole="button"
            accessibilityLabel="AI and credits"
          >
            <AiIcon width={HOME_ICON} height={HOME_ICON} color={t.text} />
            <View style={styles.linkTextWrap}>
              <View style={styles.titleWithDot}>
                <Text style={[styles.rowTitle, { color: t.text }]}>AI And Credits</Text>
                {showCreditsDot ? <View style={styles.redDot} /> : null}
              </View>
              <Text style={[styles.rowSub, { color: t.sub }]}>{creditsSubtitle}</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.stackItem, styles.stackItemMid, styles.linkRow, { backgroundColor: t.card }]}
            onPress={() => {
              void hapticTap();
              openClipboardScreen();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clipboard history"
          >
            {isDark ? (
              <AssignmentIconW width={HOME_ICON} height={HOME_ICON} />
            ) : (
              <AssignmentIcon
                width={HOME_ICON}
                height={HOME_ICON}
                color={t.text}
                fill={t.text}
              />
            )}
            <View style={styles.linkTextWrap}>
              <Text style={[styles.rowTitle, { color: t.text }]}>Clipboard History</Text>
              <Text style={[styles.rowSub, { color: t.sub }]}>Tap to View Options</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.stackItem, styles.stackItemBottom, styles.linkRow, { backgroundColor: t.card }]}
            onPress={() => {
              void hapticTap();
              openSnippets();
            }}
            accessibilityRole="button"
            accessibilityLabel="Essentials"
          >
            {isDark ? (
              <GrainIconW width={HOME_ICON} height={HOME_ICON} />
            ) : (
              <GrainIcon width={HOME_ICON} height={HOME_ICON} color={t.text} fill={t.text} />
            )}
            <View style={styles.linkTextWrap}>
              <Text style={[styles.rowTitle, { color: t.text }]}>Essentials</Text>
              <Text style={[styles.rowSub, { color: t.sub }]}>Text shortcuts</Text>
            </View>
          </Pressable>

        </View>

        {/* News section header */}
        <Text style={[styles.newsSectionLabel, { color: t.text }]}>News</Text>

        {/* Callout container (beneath all cards) */}
        <View style={[styles.timerCallout, { backgroundColor: t.card }]}>
          <View style={styles.timerCalloutLeft}>
            <Text style={[styles.timerCalloutLabel, { color: t.text }]}>TIMER</Text>
            <Text style={[styles.timerCalloutSub, { color: t.sub }]}>Countdown and alerts</Text>
          </View>
          <View style={styles.timerCalloutImgWrap}>
            <Image source={TimerImg} style={styles.timerCalloutImg} resizeMode="contain" />
          </View>
        </View>

        <View style={[styles.timerCallout, { backgroundColor: t.card, marginTop: 10 }]}>
          <View style={styles.timerCalloutLeft}>
            <Text style={[styles.timerCalloutLabel, { color: t.text }]}>Upcoming</Text>
            <Text style={[styles.timerCalloutSub, { color: t.sub }]}>Planned updates soon</Text>
          </View>
          <View style={styles.timerCalloutImgWrap}>
            <Image source={TimerImg} style={styles.timerCalloutImg} resizeMode="contain" />
          </View>
        </View>
      </ScrollView>

      <PermissionDisclosureSheet
        visible={consentVisible}
        title="Allow Side Dock permissions"
        body="To turn on the floating sidebar, Side+ needs to guide you through Android permission screens."
        bullets={[
          'Notifications on Android 13 and newer',
          'Display over other apps',
          'Battery optimization exemption',
        ]}
        note="Side Dock only uses these permissions to keep the sidebar visible on screen. Choose Continue only if you want to proceed."
        acceptLabel="Continue"
        declineLabel="Decline"
        onAccept={() => closeConsent(true)}
        onDecline={() => closeConsent(false)}
        onDismiss={() => closeConsent(false)}
        background="rgba(0,0,0,0.5)"
        cardBackground={t.card}
        textColor={t.text}
        subTextColor={t.sub}
        borderColor={t.border}
        accentColor={C.yellow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: { flex: 1 },
  topRightActions: {
    position: 'absolute',
    right: 10,
    top: 6,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  topRightPremium: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
  },
  premiumBadge: {
    borderRadius: 999,
    backgroundColor: C.redDot,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    lineHeight: 11,
    fontFamily: BODY_FONT,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topRightSettings: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    zIndex: 10,
  },
  freeModeDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 104,
    paddingBottom: 24,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 20,
    fontFamily: TITLE_FONT,
  },
  stack: {
    marginBottom: 12,
  },
  stackItem: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
  },
  stackItemTop: {
    borderTopLeftRadius: CARD_R,
    borderTopRightRadius: CARD_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
    paddingVertical: 4,
  },
  stackItemBottom: {
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: CARD_R,
    borderBottomRightRadius: CARD_R,
    paddingVertical: 4,
  },
  stackItemMid: {
    borderRadius: 0,
    borderTopLeftRadius: INNER_R,
    borderTopRightRadius: INNER_R,
    borderBottomLeftRadius: INNER_R,
    borderBottomRightRadius: INNER_R,
    marginBottom: 2,
    paddingVertical: 4,
  },
  stackItemSolo: {
    borderRadius: CARD_R,
    paddingVertical: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    minHeight: 44,
    gap: 12,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  linkRowSingle: {
    minHeight: 58,
  },
  linkTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.redDot,
  },
  rowTitle: {
    fontSize: 16,
    color: C.text,
    fontFamily: BODY_FONT,
    fontWeight: '200',
    textTransform: 'uppercase',
  },
  rowSub: {
    fontSize: 13,
    color: C.sub,
    marginTop: 1,
    fontFamily: SUBTITLE_FONT,
    letterSpacing: SUBTITLE_LETTER_SPACING,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 34,
  },
  timerCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    marginTop: 12,
    gap: 12,
  },
  newsSectionLabel: {
    fontSize: 16,
    fontFamily: BODY_FONT,
    fontWeight: '600',
    marginTop: 8,
    marginLeft: 0,
    marginBottom: 4,
  },
  timerCalloutLeft: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  timerCalloutLabel: {
    fontSize: 18,
    fontFamily: BODY_FONT,
    fontWeight: '200',
    lineHeight: 22,
  },
  timerCalloutSub: {
    fontSize: 14,
    fontFamily: SUBTITLE_FONT,
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: SUBTITLE_LETTER_SPACING,
  },
  timerCalloutImgWrap: {
    width: 74,
    height: 74,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCalloutImg: {
    width: '100%',
    height: '100%',
  },
});

