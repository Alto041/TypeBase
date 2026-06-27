import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import type {PlayLicenseStatus} from './playLicense';
import {openPlayStoreListing} from './playLicense';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  accent: '#D71921',
} as const;

type LicenseGateScreenProps = {
  status: Exclude<PlayLicenseStatus, 'licensed'>;
  onRetry?: () => void;
  checking?: boolean;
};

export function LicenseGateScreen({
  status,
  onRetry,
  checking = false,
}: LicenseGateScreenProps) {
  const isUnlicensed = status === 'unlicensed';

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {checking
            ? 'Activating TypeBase…'
            : isUnlicensed
              ? 'Purchase required'
              : 'Connect to activate'}
        </Text>
        <Text style={styles.body}>
          {checking
            ? 'Verifying your Google Play license.'
            : isUnlicensed
              ? 'This copy of TypeBase is not licensed. Get the official app from Google Play to use TypeBase.'
              : 'Connect to the internet once while signed into Google Play to activate TypeBase. After that, it works offline.'}
        </Text>
        {checking ? (
          <ActivityIndicator color={C.accent} style={styles.spinner} />
        ) : (
          <View style={styles.actions}>
            {!isUnlicensed && onRetry ? (
              <Pressable style={styles.secondaryBtn} onPress={onRetry}>
                <Text style={styles.secondaryBtnText}>Try again</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                void openPlayStoreListing();
              }}>
              <Text style={styles.primaryBtnText}>Open Google Play</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: C.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: C.sub,
  },
  spinner: {
    marginTop: 8,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e4',
  },
  secondaryBtnText: {
    color: C.text,
    fontSize: 16,
    fontWeight: '500',
  },
});
