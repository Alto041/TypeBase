import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {getContextCorrectionDebugState} from './contextCorrectionEngine';

type ContextCorrectionDebugOverlayProps = {
  visible: boolean;
  revision?: number;
};

export function ContextCorrectionDebugOverlay({
  visible,
  revision = 0,
}: ContextCorrectionDebugOverlayProps) {
  const snapshot = useMemo(() => {
    if (!visible) {
      return null;
    }
    return getContextCorrectionDebugState();
  }, [visible, revision]);

  if (!visible || !snapshot) {
    return null;
  }

  const topRunner = snapshot.runners[0];
  const candidateLine = snapshot.candidate
    ? `${snapshot.typedWord} → ${snapshot.candidate.correction} (${Math.round(snapshot.candidate.confidence * 100)}%, ${snapshot.candidate.source})`
    : snapshot.skippedReason
      ? `skip: ${snapshot.skippedReason}`
      : 'no pick';

  return (
    <View pointerEvents="none" style={styles.panel}>
      <Text style={styles.title}>Context correction</Text>
      <Text style={styles.line} numberOfLines={1}>
        after: {snapshot.previousWord || '—'}
        {snapshot.trailingWords.length > 1
          ? ` · trail: ${snapshot.trailingWords.slice(-3).join(' ')}`
          : ''}
      </Text>
      <Text style={styles.pick} numberOfLines={1}>
        {candidateLine}
      </Text>
      {topRunner ? (
        <Text style={styles.runner} numberOfLines={1}>
          top: {topRunner.word} · bg {topRunner.bigram} · score{' '}
          {Math.round(topRunner.rawScore)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 4,
    zIndex: 80,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(12,12,16,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.75)',
  },
  title: {
    color: 'rgba(255,149,0,0.95)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  line: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
  },
  pick: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  runner: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 9,
    marginTop: 1,
  },
});
