import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useGeneralSettingsNav } from '../context/GeneralSettingsNavContext';
import { useSettingsNav } from '../context/SettingsNavContext';
import { useSideBarToolsNav } from '../context/SideBarToolsNavContext';
import { useThemeMode } from '../context/ThemeContext';
import { useVolumeSliderNav } from '../context/VolumeSliderNavContext';
import { BOTTOM_NAV_BOTTOM_GAP, BOTTOM_NAV_FADE_HEIGHT } from './lib/bottomNavLayout';
import { hapticTap } from './lib/haptics';
import { playUiSound } from './lib/uiSounds';

import HomeIcon from '../assets/home.svg';
import HomeIconW from '../assets/home_w.svg';
import DockIcon from '../assets/dock.svg';
import DockIconW from '../assets/dock_w.svg';
import PaletteIcon from '../assets/palette.svg';
import PaletteIconW from '../assets/palette_w.svg';
import VolumeSliderIcon from '../assets/volumeSlider.svg';
import VolumeSliderIconW from '../assets/volumeSlider_w.svg';
import GeneralSettingsIcon from '../assets/GeneralSettings.svg';
import GeneralSettingsIconW from '../assets/GeneralSettings_w.svg';

type Option = 'home' | 'dock' | 'palette' | 'volume' | 'generalSettings';
const OPTIONS: Option[] = ['home', 'dock', 'palette', 'volume', 'generalSettings'];

const DOCK_WIDTH       = 308;
const PILL_RADIUS      = 22;
const PILL_HEIGHT      = 62;
const PILL_PADDING_H   = 18;
const CHIP_HEIGHT      = 74;
const CHIP_RADIUS      = 14;
const CHIP_WIDTH_INSET = 15;
const CHIP_V_MARGIN    = (PILL_HEIGHT - CHIP_HEIGHT) / 2;
const ICON_SIZE        = 22;
const GRADIENT_LIGHT   = '#F1F1F1';
const GRADIENT_DARK    = '#0f0f10';

const SLIDE_SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.7,
  useNativeDriver: true as const,
};

const SCALE_SPRING = {
  damping: 16,
  stiffness: 220,
  mass: 0.6,
  useNativeDriver: true as const,
};

function getLayoutMetrics(width: number) {
  const slotWidth = (width - PILL_PADDING_H * 2) / OPTIONS.length;
  const chipWidth = slotWidth - CHIP_WIDTH_INSET;
  const chipBaseLeft = PILL_PADDING_H + (slotWidth - chipWidth) / 2;
  return { slotWidth, chipWidth, chipBaseLeft };
}

function getChipTranslateX(option: Option, width: number): number {
  const { slotWidth } = getLayoutMetrics(width);
  return OPTIONS.indexOf(option) * slotWidth;
}

function optionFromNavState({
  generalSettingsOpen,
  settingsOpen,
  volumeSliderOpen,
  sideBarToolsOpen,
}: {
  generalSettingsOpen: boolean;
  settingsOpen: boolean;
  volumeSliderOpen: boolean;
  sideBarToolsOpen: boolean;
}): Option {
  if (generalSettingsOpen) return 'generalSettings';
  if (settingsOpen) return 'palette';
  if (volumeSliderOpen) return 'volume';
  if (sideBarToolsOpen) return 'dock';
  return 'home';
}

function BottomNavGradient({
  height,
  bottom,
  color,
  width,
}: {
  height: number;
  bottom: number;
  color: string;
  width: number;
}) {
  return (
    <View style={[styles.gradientShell, { height, bottom }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="bottomNavFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="0.35" stopColor={color} stopOpacity="0.18" />
            <Stop offset="0.65" stopColor={color} stopOpacity="0.42" />
            <Stop offset="1" stopColor={color} stopOpacity="0.62" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#bottomNavFade)" />
      </Svg>
    </View>
  );
}

export function BottomNavigation() {
  const { generalSettingsOpen, openGeneralSettings, closeGeneralSettings } = useGeneralSettingsNav();
  const { settingsOpen, openSettings, closeSettings } = useSettingsNav();
  const { sideBarToolsOpen, openSideBarTools, closeSideBarTools } = useSideBarToolsNav();
  const { volumeSliderOpen, openVolumeSlider, closeVolumeSlider } = useVolumeSliderNav();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { isDark } = useThemeMode();
  const navBottom = Math.max(insets.bottom + BOTTOM_NAV_BOTTOM_GAP, BOTTOM_NAV_BOTTOM_GAP);
  const gradientBottom = navBottom + PILL_HEIGHT + 8;
  const gradientColor = isDark ? GRADIENT_DARK : GRADIENT_LIGHT;
  const pillBg = isDark ? '#1F1F1F' : '#E3E3E3';
  const chipBg = isDark ? '#1b1b1f' : '#ffffff';

  const [selectedOption, setSelectedOption] = useState<Option>('home');
  const [pillWidth, setPillWidth] = useState(0);

  const chipTranslateX = useRef(new Animated.Value(0)).current;
  const chipScale = useRef(new Animated.Value(1)).current;

  const pillWidthRef  = useRef(0);
  const selectedRef   = useRef<Option>('home');
  selectedRef.current = selectedOption;

  const chipLayout = pillWidth > 0 ? getLayoutMetrics(pillWidth) : null;

  const animateChip = useCallback((option: Option, width: number) => {
    Animated.parallel([
      Animated.spring(chipTranslateX, {
        ...SLIDE_SPRING,
        toValue: getChipTranslateX(option, width),
      }),
      Animated.sequence([
        Animated.spring(chipScale, { ...SCALE_SPRING, toValue: 0.94 }),
        Animated.spring(chipScale, { ...SCALE_SPRING, toValue: 1 }),
      ]),
    ]).start();
  }, [chipScale, chipTranslateX]);

  const closeAllNavScreens = useCallback(() => {
    closeSettings();
    closeGeneralSettings();
    closeSideBarTools();
    closeVolumeSlider();
  }, [closeGeneralSettings, closeSettings, closeSideBarTools, closeVolumeSlider]);

  useEffect(() => {
    const option = optionFromNavState({
      generalSettingsOpen,
      settingsOpen,
      volumeSliderOpen,
      sideBarToolsOpen,
    });
    if (option === selectedRef.current) return;
    setSelectedOption(option);
    if (pillWidthRef.current > 0) {
      chipTranslateX.setValue(getChipTranslateX(option, pillWidthRef.current));
    }
  }, [
    generalSettingsOpen,
    settingsOpen,
    volumeSliderOpen,
    sideBarToolsOpen,
    chipTranslateX,
  ]);

  const handlePillLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w === pillWidthRef.current) return;
    pillWidthRef.current = w;
    setPillWidth(w);
    chipTranslateX.setValue(getChipTranslateX(selectedRef.current, w));
  };

  const handleSelect = (option: Option) => {
    void hapticTap();
    if (option !== selectedRef.current) void playUiSound('navigation');
    setSelectedOption(option);
    if (pillWidthRef.current > 0) animateChip(option, pillWidthRef.current);

    closeAllNavScreens();

    switch (option) {
      case 'home':
        break;
      case 'dock':
        openSideBarTools();
        break;
      case 'palette':
        openSettings();
        break;
      case 'volume':
        openVolumeSlider();
        break;
      case 'generalSettings':
        openGeneralSettings();
        break;
    }
  };

  const getIcon = (option: Option) => {
    switch (option) {
      case 'home':
        return isDark ? <HomeIconW width={ICON_SIZE} height={ICON_SIZE} /> : <HomeIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'dock':
        return isDark ? <DockIconW width={ICON_SIZE} height={ICON_SIZE} /> : <DockIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'palette':
        return isDark ? <PaletteIconW width={ICON_SIZE} height={ICON_SIZE} /> : <PaletteIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'volume':
        return isDark ? <VolumeSliderIconW width={ICON_SIZE} height={ICON_SIZE} /> : <VolumeSliderIcon width={ICON_SIZE} height={ICON_SIZE} />;
      case 'generalSettings':
        return isDark ? <GeneralSettingsIconW width={ICON_SIZE} height={ICON_SIZE} /> : <GeneralSettingsIcon width={ICON_SIZE} height={ICON_SIZE} />;
    }
  };

  return (
    <View style={styles.chromeRoot} pointerEvents="box-none">
      <BottomNavGradient
        height={BOTTOM_NAV_FADE_HEIGHT}
        bottom={gradientBottom}
        color={gradientColor}
        width={windowWidth}
      />
      <View style={[styles.container, { bottom: navBottom }]}>
      <View style={[styles.pill, { backgroundColor: pillBg }]} onLayout={handlePillLayout}>
        {chipLayout && (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.chip,
                {
                  left: chipLayout.chipBaseLeft,
                  width: chipLayout.chipWidth,
                  backgroundColor: chipBg,
                  transform: [
                    { translateX: chipTranslateX },
                    { scale: chipScale },
                  ],
                },
              ]}
            />

            {OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.slot}
                onPress={() => handleSelect(option)}
                activeOpacity={0.65}
                testID={`bottom-nav-${option}`}
              >
                {getIcon(option)}
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chromeRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  gradientShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  container: {
    position: 'absolute',
    left: '50%',
    marginLeft: -DOCK_WIDTH / 2,
    width: DOCK_WIDTH,
    alignItems: 'center',
    zIndex: 1,
  },
  pill: {
    width: '100%',
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING_H,
    overflow: 'visible',
  },
  chip: {
    position: 'absolute',
    top: CHIP_V_MARGIN,
    height: CHIP_HEIGHT,
    borderRadius: CHIP_RADIUS,
    zIndex: 0,
  },
  slot: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
