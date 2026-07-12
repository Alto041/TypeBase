import React, {memo} from 'react';
import {View, type ViewStyle} from 'react-native';
import {useKeyboardThemeOrNull} from '../KeyboardThemeContext';

const LIGHT_TOP_BEVEL = 'rgba(255, 255, 255, 0.5)';
const LIGHT_BOTTOM_BEVEL = 'rgba(108, 104, 94, 0.5)';
const LIGHT_PRESSED_TOP = 'rgba(92, 88, 80, 0.4)';
const LIGHT_PRESSED_BOTTOM = 'rgba(255, 255, 255, 0.28)';

const DARK_TOP_BEVEL = 'rgba(255, 255, 255, 0.22)';
const DARK_BOTTOM_BEVEL = 'rgba(0, 0, 0, 0.45)';
const DARK_PRESSED_TOP = 'rgba(0, 0, 0, 0.4)';
const DARK_PRESSED_BOTTOM = 'rgba(255, 255, 255, 0.14)';

type TopCorner = 'topLeft' | 'topRight';

type TopCornerBevelProps = {
  corner: TopCorner;
  color: string;
  length: number;
  thickness: number;
};

/** Small L-shaped top corner bits with rounded free ends. */
function TopCornerBevel({corner, color, length, thickness}: TopCornerBevelProps) {
  const tip = thickness / 2;
  const isLeft = corner === 'topLeft';

  const horizontal: ViewStyle = {
    position: 'absolute',
    top: 0,
    width: length,
    height: thickness,
    backgroundColor: color,
    zIndex: 2,
    ...(isLeft
      ? {
          left: 0,
          borderTopRightRadius: tip,
          borderBottomRightRadius: tip,
        }
      : {
          right: 0,
          borderTopLeftRadius: tip,
          borderBottomLeftRadius: tip,
        }),
  };

  const vertical: ViewStyle = {
    position: 'absolute',
    top: 0,
    width: thickness,
    height: length,
    backgroundColor: color,
    zIndex: 2,
    borderBottomLeftRadius: tip,
    borderBottomRightRadius: tip,
    ...(isLeft ? {left: 0} : {right: 0}),
  };

  return (
    <>
      <View pointerEvents="none" style={horizontal} />
      <View pointerEvents="none" style={vertical} />
    </>
  );
}

type BottomBevelProps = {
  color: string;
  /** Full bottom coverage thickness. */
  thickness: number;
  /** How far the side arms curl up. */
  curlHeight: number;
  /** Side-arm thickness (matches bottom for an even join). */
  sideThickness: number;
};

/**
 * Full-width bottom bevel with left/right arms that curl up.
 * Side arms include the bottom corners so nothing overlaps
 * (avoids double-alpha making edges look darker than the base).
 */
function BottomBevel({
  color,
  thickness,
  curlHeight,
  sideThickness,
}: BottomBevelProps) {
  const tip = sideThickness / 2;

  return (
    <>
      {/* Bottom middle coverage only — sides own the corners */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: sideThickness,
          right: sideThickness,
          bottom: 0,
          height: thickness,
          backgroundColor: color,
          zIndex: 1,
        }}
      />
      {/* Left arm curling up (includes bottom-left corner) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: sideThickness,
          height: curlHeight,
          backgroundColor: color,
          borderTopLeftRadius: tip,
          borderTopRightRadius: tip,
          zIndex: 1,
        }}
      />
      {/* Right arm curling up (includes bottom-right corner) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: sideThickness,
          height: curlHeight,
          backgroundColor: color,
          borderTopLeftRadius: tip,
          borderTopRightRadius: tip,
          zIndex: 1,
        }}
      />
    </>
  );
}

type PillBevelsProps = {
  topColor: string;
  bottomColor: string;
  topThickness: number;
  bottomThickness: number;
  sideThickness: number;
  /** How far side highlights run into the flat mid-section of the pill. */
  sideInset: number;
};

/**
 * Pill / fully-rounded keys (enter): full top+bottom bands follow the clip
 * curve, and side highlights sit on the flat mid edges so they aren't clipped away.
 */
function PillBevels({
  topColor,
  bottomColor,
  topThickness,
  bottomThickness,
  sideThickness,
  sideInset,
}: PillBevelsProps) {
  const tip = sideThickness / 2;

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: topThickness,
          backgroundColor: topColor,
          zIndex: 2,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: bottomThickness,
          backgroundColor: bottomColor,
          zIndex: 1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: sideInset,
          bottom: sideInset,
          width: sideThickness,
          backgroundColor: bottomColor,
          borderTopRightRadius: tip,
          borderBottomRightRadius: tip,
          zIndex: 1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: sideInset,
          bottom: sideInset,
          width: sideThickness,
          backgroundColor: bottomColor,
          borderTopLeftRadius: tip,
          borderBottomLeftRadius: tip,
          zIndex: 1,
        }}
      />
    </>
  );
}

export type MacintoshKeyBevelShape = 'rect' | 'pill';

type MacintoshKeyBevelsProps = {
  pressed?: boolean;
  /** Override color scheme (e.g. theme picker preview outside the IME provider). */
  scheme?: 'light' | 'dark';
  /**
   * `pill` = enter/search capsule — full top/bottom bands that survive rounded clip.
   * `rect` = normal keys with corner L bevels.
   */
  shape?: MacintoshKeyBevelShape;
  /** Length of each top-corner arm (rect only). */
  cornerSize?: number;
  /** Soft white top-corner bevel thickness. */
  topBevelThickness?: number;
  /** Full bottom bevel thickness. */
  bottomBevelThickness?: number;
  /** How far bottom side arms curl up (rect only). */
  bottomCurlHeight?: number;
};

/**
 * Macintosh 3D face bevels inside the key outline.
 */
function MacintoshKeyBevelsComponent({
  pressed = false,
  scheme: schemeProp,
  shape = 'rect',
  cornerSize = 8,
  topBevelThickness = 2,
  bottomBevelThickness = 5,
  bottomCurlHeight = 10,
}: MacintoshKeyBevelsProps) {
  const theme = useKeyboardThemeOrNull();
  const isDark = (schemeProp ?? theme?.scheme ?? 'light') === 'dark';

  const topColor = pressed
    ? isDark
      ? DARK_PRESSED_TOP
      : LIGHT_PRESSED_TOP
    : isDark
      ? DARK_TOP_BEVEL
      : LIGHT_TOP_BEVEL;
  const bottomColor = pressed
    ? isDark
      ? DARK_PRESSED_BOTTOM
      : LIGHT_PRESSED_BOTTOM
    : isDark
      ? DARK_BOTTOM_BEVEL
      : LIGHT_BOTTOM_BEVEL;

  const bottomThickness = pressed
    ? Math.max(3, bottomBevelThickness - 1)
    : bottomBevelThickness;
  const topThickness = pressed
    ? Math.max(2, topBevelThickness)
    : Math.max(topBevelThickness, shape === 'pill' ? 3 : topBevelThickness);
  const curlHeight = pressed
    ? Math.max(cornerSize, bottomCurlHeight - 2)
    : bottomCurlHeight;

  if (shape === 'pill') {
    return (
      <PillBevels
        topColor={topColor}
        bottomColor={bottomColor}
        topThickness={topThickness}
        bottomThickness={Math.max(bottomThickness, 6)}
        sideThickness={bottomThickness}
        sideInset={Math.max(12, curlHeight)}
      />
    );
  }

  return (
    <>
      <TopCornerBevel
        corner="topLeft"
        color={topColor}
        length={cornerSize}
        thickness={topBevelThickness}
      />
      <TopCornerBevel
        corner="topRight"
        color={topColor}
        length={cornerSize}
        thickness={topBevelThickness}
      />
      <BottomBevel
        color={bottomColor}
        thickness={bottomThickness}
        curlHeight={curlHeight}
        sideThickness={bottomThickness}
      />
    </>
  );
}

export const MacintoshKeyBevels = memo(MacintoshKeyBevelsComponent);
