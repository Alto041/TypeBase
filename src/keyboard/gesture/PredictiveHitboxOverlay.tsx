import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {useKeyLayoutContext} from './KeyLayoutContext';
import {
  expandedKeyBounds,
  getPredictiveHitboxState,
} from './predictiveHitboxes';
import type {KeyBounds} from './types';

type PredictiveHitboxOverlayProps = {
  visible: boolean;
  revision?: number;
};

function isLetterKey(layout: KeyBounds): boolean {
  const value = layout.keyDef.value ?? layout.letter ?? '';
  return value.length === 1 && /[a-z]/i.test(value);
}

export function PredictiveHitboxOverlay({
  visible,
  revision = 0,
}: PredictiveHitboxOverlayProps) {
  const layoutContext = useKeyLayoutContext();
  const hitboxState = getPredictiveHitboxState();

  const overlays = useMemo(() => {
    if (!visible || !layoutContext) {
      return [];
    }
    return layoutContext
      .getLayouts()
      .filter(isLetterKey)
      .map(layout => {
        const bounds = expandedKeyBounds(layout);
        const letter = (layout.keyDef.value ?? layout.letter ?? '').toLowerCase();
        const probability = hitboxState.probabilities.get(letter) ?? 0;
        const isTop = layout.id === hitboxState.topExpansionKeyId;
        return {
          id: layout.id,
          left: bounds.left,
          top: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
          probability,
          isTop,
        };
      });
  }, [visible, layoutContext, hitboxState, revision]);

  if (!visible || overlays.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {overlays.map(overlay => (
        <View
          key={overlay.id}
          style={[
            styles.hitRegion,
            {
              left: overlay.left,
              top: overlay.top,
              width: overlay.width,
              height: overlay.height,
              borderColor: overlay.isTop ? 'rgba(44,198,66,0.95)' : 'rgba(0,122,255,0.7)',
              backgroundColor: overlay.isTop
                ? `rgba(44,198,66,${0.08 + overlay.probability * 0.18})`
                : `rgba(0,122,255,${0.04 + overlay.probability * 0.12})`,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hitRegion: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 4,
  },
});
