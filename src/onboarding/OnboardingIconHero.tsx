import React, {type ComponentType} from 'react';
import {Dimensions, StyleSheet, Text, View} from 'react-native';

import {PremiumGlowBg} from '../licensing/PremiumGlowBg';

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');

const TITLE_FONT = 'Geist';
const BODY_FONT = 'Inter';

const HERO_ICON = 88;
const HERO_ICON_ROW = 52;

type IconComponent = ComponentType<{width?: number; height?: number; color?: string}>;

export type OnboardingIconHeroConfig =
  | {
      kind: 'icon';
      Icon: IconComponent;
      kicker?: string;
      headline?: string;
      glow?: boolean;
    }
  | {
      kind: 'icons';
      icons: IconComponent[];
      kicker?: string;
      headline?: string;
      glow?: boolean;
    };

type Props = {
  hero: OnboardingIconHeroConfig;
  drawerReserve: number;
};

export function OnboardingIconHero({hero, drawerReserve}: Props) {
  const progressClearance = 28;
  const paddingBottom = drawerReserve + progressClearance;

  return (
    <View
      style={[styles.heroArea, {height: SCREEN_H, paddingBottom}]}
      pointerEvents="none">
      {hero.glow ? <PremiumGlowBg /> : null}
      <View style={styles.heroContent}>
        {hero.kind === 'icon' ? (
          <View style={styles.iconRing}>
            <hero.Icon width={HERO_ICON} height={HERO_ICON} color="#111111" />
          </View>
        ) : (
          <View style={styles.iconRow}>
            {hero.icons.map((Icon, index) => (
              <View key={index} style={styles.iconChip}>
                <Icon width={HERO_ICON_ROW} height={HERO_ICON_ROW} color="#111111" />
              </View>
            ))}
          </View>
        )}
        {hero.kicker ? <Text style={styles.kicker}>{hero.kicker}</Text> : null}
        {hero.headline ? (
          <Text style={styles.headline}>{hero.headline}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroArea: {
    width: SCREEN_W,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  heroContent: {
    alignItems: 'center',
    gap: 14,
    zIndex: 2,
    maxWidth: SCREEN_W - 56,
  },
  iconRing: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: '#f2f2f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconChip: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#f2f2f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    letterSpacing: 1.1,
    color: 'rgba(17,17,17,0.45)',
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: TITLE_FONT,
    fontSize: 26,
    lineHeight: 30,
    color: '#111111',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
});
