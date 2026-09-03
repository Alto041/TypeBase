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

  const line = snapshot.candidate
    ? `${snapshot.typedWord} → ${snapshot.candidate.correction} · ${Math.round(snapshot.candidate.confidence * 100)}%`
    : snapshot.typedWord
      ? snapshot.typedWord
      : null;

  if (!line) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.panel}>
      <Text style={styles.line} numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 2,
    zIndex: 80,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(12, 12, 16, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 149, 0, 0.55)',
  },
  line: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
