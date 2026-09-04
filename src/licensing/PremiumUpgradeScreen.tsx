import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import BackIcon from '../../assets/back.svg';
import {usePremium} from './PremiumContext';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  accent: '#D71921',
  border: '#e8e8ea',
} as const;

const BENEFITS = [
  'All keyboard plugins — Format, Clipboard, Calculator, and more',
  'Premium themes and custom styling',
  'Gestures and swipe typing',
  'Auto-correct on space, personal learning, and TypeLift AI',
  'Translate, Rewrite, Voice, and AI configuration',
] as const;

type PremiumUpgradeScreenProps = {
  onBack?: () => void;
};

export function PremiumUpgradeScreen({onBack}: PremiumUpgradeScreenProps) {
  const {isPremium, loading, price, purchase, restore} = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
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
    <SafeAreaView style={styles.root}>
      {onBack ? (
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
          <BackIcon width={20} height={20} color={C.text} />
        </Pressable>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {isPremium ? 'TypeBase Premium' : 'Unlock TypeBase'}
        </Text>
        <Text style={styles.subtitle}>
          {isPremium
            ? 'You have full access to every feature.'
            : 'One-time purchase. No subscription.'}
        </Text>

        <View style={styles.card}>
          {BENEFITS.map(item => (
            <Text key={item} style={styles.benefit}>
              • {item}
            </Text>
          ))}
        </View>

        {!isPremium ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, busy !== null && styles.btnDisabled]}
              disabled={busy !== null || loading}
              onPress={() => void handlePurchase()}>
              {busy === 'purchase' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {price ? `Unlock for ${price}` : 'Unlock TypeBase'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              disabled={busy !== null || loading}
              onPress={() => void handleRestore()}>
              {busy === 'restore' ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Text style={styles.secondaryBtnText}>Restore purchase</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.8,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    color: C.sub,
    marginTop: 8,
    marginBottom: 20,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  benefit: {
    fontSize: 14,
    lineHeight: 20,
    color: C.text,
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  secondaryBtnText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  error: {
    marginTop: 16,
    color: C.accent,
    fontSize: 14,
    textAlign: 'center',
  },
});
