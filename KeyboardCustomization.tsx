import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import BackIcon from './assets/back.svg';
import ResetIcon from './assets/reset.svg';
import ThemeIcon from './assets/theme.svg';

import {
  ensureLayoutLoaded,
  getKeyboardLayoutSettings,
  setKeyboardLayoutSettings,
  updateKeyboardLayoutSetting,
} from './src/keyboard/settings/layoutStore';
import {
  ensureThemeLoaded,
  getKeyboardColorScheme,
  getKeyboardDesign,
  getKeyboardCustomTheme,
  setKeyboardColorScheme,
  setKeyboardDesign,
  setKeyboardCustomTheme,
} from './src/keyboard/settings/themeStore';
import {DEFAULT_KEYBOARD_LAYOUT_SETTINGS} from './src/keyboard/theme';
import type {KeyboardLayoutSettings} from './src/keyboard/theme';

const C = {
  bg: '#f2f2f4',
  card: '#ffffff',
  text: '#111111',
  sub: '#6b6b6b',
  border: '#e8e8ea',
} as const;

const CARD_R = 25;
const TEXT_KERNING = -0.7;

export function CustomizeScreen({onBack}: {onBack: () => void}) {
  const [layout, setLayout] = useState<KeyboardLayoutSettings>(
    DEFAULT_KEYBOARD_LAYOUT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureLayoutLoaded().then(() => {
      setLayout(getKeyboardLayoutSettings());
      setLoading(false);
    });
  }, []);

  const update = (key: keyof KeyboardLayoutSettings, value: number) => {
    let next = value;
    if (key === 'keyHeight') next = Math.max(40, Math.min(64, value));
    if (key === 'keyGap') next = Math.max(0, Math.min(12, value));
    if (key === 'keyRowMargin') next = Math.max(0, Math.min(20, value));
    if (key === 'keyRadius') next = Math.max(0, Math.min(12, value));
    setLayout(current => ({...current, [key]: next}));
    void updateKeyboardLayoutSetting(key, next);
  };

  const keyHeight = layout.keyHeight;
  const keyGap = layout.keyGap;
  const rowGap = layout.keyRowMargin;
  const keyRadius = layout.keyRadius;

  const handleReset = () => {
    setLayout(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
    void setKeyboardLayoutSettings(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
  };

  // Knob geometry (for Key Height circular control)
  const KNOB_SIZE = 130;   // larger hit area for easier control (finger can land around the visual)
  const TRACK_R = 42;      // gray circle radius (visual size of the gray disk)
  const THUMB_R = 10;      // black knob radius (slightly larger grab target)
  const ORBIT_R = TRACK_R - 20; // much smaller orbit → black sits well inside the gray with clear space to the edge

  // Visual placement of the gray disk *inside* the knobWrap (must match the knobTrack left/top in styles)
  const KNOB_VISUAL_LEFT = 40;
  const KNOB_VISUAL_TOP  = 48;

  // How many pixels of vertical drag to sweep the whole range. Lower = more
  // sensitive, higher = finer control. This is a simple linear drag — no
  // angle math, no center-of-circle dependency — so it tracks your finger
  // 1:1 no matter where on the knob you grab it or how you move.
  const KEY_HEIGHT_MIN = 40;
  const KEY_HEIGHT_MAX = 64;
  const KEY_HEIGHT_RANGE = KEY_HEIGHT_MAX - KEY_HEIGHT_MIN;
  const KEY_HEIGHT_DRAG_PX = 140; // px of drag to cover the full range

  const keyHeightDragRef = useRef({ startValue: KEY_HEIGHT_MIN });

  const knobPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        keyHeightDragRef.current.startValue = keyHeight;
        // No haptic here — only fire when the value actually changes (in onPanResponderMove).
      },
      onPanResponderMove: (evt, gestureState) => {
        // Dragging up increases the value, dragging down decreases it —
        // the natural feel for "more height". dy is negative when moving up.
        const deltaValue =
          (-gestureState.dy / KEY_HEIGHT_DRAG_PX) * KEY_HEIGHT_RANGE;
        let next = Math.round(keyHeightDragRef.current.startValue + deltaValue);
        next = Math.max(KEY_HEIGHT_MIN, Math.min(KEY_HEIGHT_MAX, next));

        if (next !== keyHeight) {
          update('keyHeight', next);
          Haptics.selectionAsync().catch(() => {});
        }
      },
    })
  ).current;

  // Thumb position derived from current keyHeight (source of truth).
  // Still drawn as a dot orbiting the dial face, purely for visual flavor —
  // the underlying gesture is a simple linear drag now, not an angle.
  const knobNorm = (keyHeight - KEY_HEIGHT_MIN) / KEY_HEIGHT_RANGE;
  const knobAngle = -Math.PI / 2 + knobNorm * (2 * Math.PI); // start at top, sweep clockwise
  const kcx = KNOB_VISUAL_LEFT + TRACK_R;
  const kcy = KNOB_VISUAL_TOP + TRACK_R;
  // Use the smaller ORBIT_R so the black knob sits inwards from the gray circle's edge
  const knobThumbLeft = kcx + ORBIT_R * Math.cos(knobAngle) - THUMB_R;
  const knobThumbTop = kcy + ORBIT_R * Math.sin(knobAngle) - THUMB_R;

  // ==================== KEY GAP rotary disk (big grey disk that spins) ====================
  const GAP_MIN = 0;
  const GAP_MAX = 12;
  const GAP_RANGE = GAP_MAX - GAP_MIN;
  const GAP_DRAG_PX = 130; // px of drag to cover the full 0-12 range

  // Rotation of the disk face (full 360° for the 0-12 range) — purely visual,
  // the gesture itself is a simple linear drag (see below).
  const gapRotation = (keyGap / 12) * (2 * Math.PI);

  const gapDragRef = useRef({ startValue: GAP_MIN });
  const rowGapDragRef = useRef({ anchorValue: 0, startDy: 0 });

  const gapDiskPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gapDragRef.current.startValue = keyGap;
        // No haptic here — only fire when the value actually changes (in onPanResponderMove).
      },
      onPanResponderMove: (evt, gestureState) => {
        // Drag up/right to increase, down/left to decrease — combine both
        // axes so it feels natural no matter which direction you drag in.
        const drag = gestureState.dx - gestureState.dy;
        const deltaValue = (drag / GAP_DRAG_PX) * GAP_RANGE;
        let next = Math.round(gapDragRef.current.startValue + deltaValue);
        next = Math.max(GAP_MIN, Math.min(GAP_MAX, next));

        if (next !== keyGap) {
          update('keyGap', next);
          Haptics.selectionAsync().catch(() => {});
        }
      },
    })
  ).current;

  // ==================== ROW GAP vertical slider (right side of the small left card) ====================
  const ROW_GAP_MIN = 0;
  const ROW_GAP_MAX = 20;
  const ROW_GAP_RANGE = ROW_GAP_MAX - ROW_GAP_MIN;
  const ROW_GAP_TRACK_H = 140; // visible track length (just for drawing the knob position)
  const ROW_GAP_KNOB_SIZE = 18;
  // Drag distance needed to cover the full range. Tuned to feel as forgiving
  // as Key Height (~5.8px/unit) and Key Gap (~10.8px/unit) — NOT tied to the
  // visible track length, since that made every pixel of finger jitter swing
  // the value way too fast for a 20-unit range crammed into 122px of travel.
  const ROW_GAP_DRAG_PX = 180; // ~9px of drag per unit — comparable feel to the other knobs

  const rowGapProgress = (rowGap - ROW_GAP_MIN) / ROW_GAP_RANGE;
  // Clamp knob travel so it doesn't overshoot the top/bottom of the visual line.
  const rowGapKnobTop =
    (1 - rowGapProgress) * (ROW_GAP_TRACK_H - ROW_GAP_KNOB_SIZE);

  const rowGapSliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rowGapDragRef.current.anchorValue = rowGap;
        rowGapDragRef.current.startDy = 0; // track how much drag we've "consumed"
      },
      onPanResponderMove: (evt, gestureState) => {
        // Relative drag: compare cumulative dy to what we've already processed.
        // This prevents jumps if the component re-renders mid-drag.
        const rawDy = -gestureState.dy; // up = positive (increase value)
        const consumedDy = rowGapDragRef.current.startDy;
        const deltaDy = rawDy - consumedDy;

        // Convert pixel delta to value delta
        const deltaVal = (deltaDy / ROW_GAP_DRAG_PX) * ROW_GAP_RANGE;
        let next = Math.round(rowGapDragRef.current.anchorValue + deltaVal);
        next = Math.max(ROW_GAP_MIN, Math.min(ROW_GAP_MAX, next));

        if (next !== rowGap) {
          // Value changed: commit it, update anchor, and "consume" the drag distance
          update('keyRowMargin', next);
          Haptics.selectionAsync().catch(() => {});
          rowGapDragRef.current.anchorValue = next;
          rowGapDragRef.current.startDy = rawDy;
        }
      },
    })
  ).current;

  // ==================== KEY RADIUS rotary disk (same face as Key Gap, no white center) ====================
  const KEY_RADIUS_MIN = 0;
  const KEY_RADIUS_MAX = 12;
  const KEY_RADIUS_RANGE = KEY_RADIUS_MAX - KEY_RADIUS_MIN;
  const RADIUS_DRAG_PX = 130;

  const radiusRotation = (keyRadius / KEY_RADIUS_MAX) * (2 * Math.PI);
  const radiusDragRef = useRef({ startValue: KEY_RADIUS_MIN });

  const radiusDiskPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        radiusDragRef.current.startValue = keyRadius;
      },
      onPanResponderMove: (evt, gestureState) => {
        const drag = gestureState.dx - gestureState.dy;
        const deltaValue = (drag / RADIUS_DRAG_PX) * KEY_RADIUS_RANGE;
        let next = Math.round(radiusDragRef.current.startValue + deltaValue);
        next = Math.max(KEY_RADIUS_MIN, Math.min(KEY_RADIUS_MAX, next));

        if (next !== keyRadius) {
          update('keyRadius', next);
          Haptics.selectionAsync().catch(() => {});
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onBack}>
          <BackIcon width={18} height={18} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Customize</Text>

        <View style={styles.customizeSection}>
          {/* First row: bigger left, smaller right */}
          <View style={styles.configRow}>
            <View style={[styles.configCard, styles.configCardBig]}>
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                KEY HEIGHT
              </Text>
              {/* Small value readout, absolutely placed so the large bottom-right knob
                  doesn't cover it. Sits just under the label on the left. */}
              <View style={styles.valueBoxKnob}>
                <TextInput
                  style={styles.valueInput}
                  value={String(keyHeight)}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(n)) update('keyHeight', n);
                  }}
                  keyboardType="number-pad"
                  editable={!loading}
                />
              </View>

              {/* Circular knob anchored bottom-right inside the card.
                  Larger hit area (130px) around the visual for easier control.
                  Gray disk is big; black indicator orbits on a much smaller radius deep inside the gray,
                  with plenty of visible space between the black knob's outer edge and the gray circle's edge. */}
              <View style={styles.knobWrap} {...knobPan.panHandlers}>
                <View style={styles.knobTrack} />
                <View
                  style={[
                    styles.knobThumb,
                    { left: knobThumbLeft, top: knobThumbTop },
                  ]}
                />
              </View>
            </View>

            <View style={[styles.configCard, styles.configCardSmall, styles.gapCard]}>
              {/* Big grey disk that spins to control Key Gap (0-12).
                  Small white circle dead center.
                  Two vertical parallel lines inside the grey (above and below the white center).
                  The whole disk face (grey + white + vertical marks) rotates when you drag. */}
              <View
                style={styles.gapDiskHit}
                {...gapDiskPan.panHandlers}
              >
                <View
                  style={[
                    styles.gapDiskGrey,
                    { transform: [{ rotate: `${gapRotation}rad` }] },
                  ]}
                >
                  {/* Small white circle exactly in the center of the grey disk */}
                  <View style={styles.gapDiskWhiteCenter} />

                  {/* Vertical line above the white center (inside the grey, with clearance) */}
                  <View style={[styles.gapDiskVLine, styles.gapDiskVLineTop]} />

                  {/* Vertical line below the white center (inside the grey, with clearance) */}
                  <View style={[styles.gapDiskVLine, styles.gapDiskVLineBottom]} />
                </View>
              </View>

              {/* Value displayed above the label */}
              <View style={styles.gapValueWrap}>
                <View style={styles.valueBox}>
                  <TextInput
                    style={styles.valueInput}
                    value={String(keyGap)}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      if (!isNaN(n)) update('keyGap', n);
                    }}
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* Label at the very bottom of the card */}
              <Text style={styles.gapBottomLabel}>KEY GAP</Text>
            </View>
          </View>

          {/* Second row: smaller left, bigger right (opposite) */}
          <View style={styles.configRow}>
            <View style={[styles.configCard, styles.configCardSmall, styles.rowGapCard]}>
              {/* Label stays at the top-left */}
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>ROW GAP</Text>

              {/* Vertical line (#F2F2F2) + knob on the right side of the container */}
              <View style={styles.rowGapSliderArea} {...rowGapSliderPan.panHandlers}>
                <View style={styles.rowGapTrack} />
                <View style={[styles.rowGapKnob, { top: rowGapKnobTop }]} />
              </View>

              {/* Value at the bottom-left edge */}
              <View style={{ marginTop: 'auto', alignSelf: 'flex-start', marginBottom: 10 }}>
                <View style={styles.valueBox}>
                  <TextInput
                    style={styles.valueInput}
                    value={String(rowGap)}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      if (!isNaN(n)) update('keyRowMargin', n);
                    }}
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>
              </View>
            </View>

            <View style={[styles.configCard, styles.configCardBig, styles.keyRadiusCard]}>
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                KEY RADIUS
              </Text>

              {/* Grey spinning disk — single vertical line, no white center */}
              <View style={styles.radiusDiskHit} {...radiusDiskPan.panHandlers}>
                <View
                  style={[
                    styles.gapDiskGrey,
                    { transform: [{ rotate: `${radiusRotation}rad` }] },
                  ]}
                >
                  <View style={styles.radiusDiskVLine} />
                </View>
              </View>

              {/* Value at the bottom-right */}
              <View style={styles.keyRadiusValueWrap}>
                <View style={styles.valueBox}>
                  <TextInput
                    style={styles.valueInput}
                    value={String(keyRadius)}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      if (!isNaN(n)) update('keyRadius', n);
                    }}
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Reset all settings row */}
          <Pressable style={styles.resetAllContainer} onPress={handleReset} disabled={loading}>
            <ResetIcon width={20} height={20} color="#D71921" />
            <Text style={styles.resetAllText}>RESET ALL SETTINGS</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ThemesScreen({onBack}: {onBack: () => void}) {
  const [design, setDesign] = useState<'typebase' | 'quivox'>('typebase');
  const [isDark, setIsDark] = useState(false);
  const [loading, setLoading] = useState(true);

  const toggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void ensureThemeLoaded().then(() => {
      const current = getKeyboardDesign();
      const dark = getKeyboardColorScheme() === 'dark';
      setDesign(current === 'quivox' ? 'quivox' : 'typebase');
      setIsDark(dark);
      toggleAnim.setValue(dark ? 1 : 0);
      setLoading(false);
    });
  }, []);

  const select = (which: 'typebase' | 'quivox') => {
    if (loading) return;
    setDesign(which);
    void setKeyboardDesign(which);
  };

  const toggleDark = () => {
    if (loading) return;
    const next = !isDark;
    setIsDark(next);
    void setKeyboardColorScheme(next ? 'dark' : 'light');
    Haptics.selectionAsync().catch(() => {});

    Animated.spring(toggleAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      stiffness: 700,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const isNothing = design === 'typebase';
  const isQuivox = design === 'quivox';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.topRightActions}>
        <Pressable style={styles.topRightSettings} onPress={onBack}>
          <BackIcon width={18} height={18} color={C.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Themes</Text>

        {/* Nothing Theme card */}
        <View style={styles.themeCard}>
          <View style={styles.themeImageWrap}>
            <Image source={require('./assets/nothing.png')} style={styles.themeImage} resizeMode="cover" />
          </View>

          <View style={styles.themeBottomArea}>
            <View style={styles.themeBottomRow}>
              <View style={styles.themeTextCol}>
                <Text style={styles.themeTitle}>Nothing Theme</Text>
                <Text style={styles.themeSubtitle}>
                  Choose Nothing Tech’s Design Style
                </Text>
              </View>

              <Pressable
                style={[styles.themeBtn, isNothing && styles.themeBtnActive]}
                onPress={() => select('typebase')}
                disabled={loading}
              >
                <Text style={styles.themeBtnText}>
                  {isNothing ? 'Selected' : 'Choose'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Quivox Theme card */}
        <View style={styles.themeCard}>
          <View style={styles.themeImageWrap}>
            <Image source={require('./assets/quivox.png')} style={styles.themeImage} resizeMode="cover" />
          </View>

          <View style={styles.themeBottomArea}>
            <View style={styles.themeBottomRow}>
              <View style={styles.themeTextCol}>
                <Text style={styles.themeTitle}>Quivox Theme</Text>
                <Text style={styles.themeSubtitle}>
                  Choose Quivox Design Style
                </Text>
              </View>

              <Pressable
                style={[styles.themeBtn, isQuivox && styles.themeBtnActive]}
                onPress={() => select('quivox')}
                disabled={loading}
              >
                <Text style={styles.themeBtnText}>
                  {isQuivox ? 'Selected' : 'Choose'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Light / Dark theme toggle row (same container style as reset) */}
        <View style={styles.themeToggleContainer}>
          <ThemeIcon width={20} height={20} color={C.text} />
          <Text style={styles.themeToggleLabel}>Light / Dark Theme</Text>
          <View style={{flex: 1}} />
          <Pressable
            onPress={toggleDark}
            style={[styles.toggleTrack, isDark && styles.toggleTrackOn]}
            disabled={loading}
          >
            <Animated.View
              style={[
                styles.toggleThumb,
                {
                  transform: [
                    {
                      translateX: toggleAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 18],
                      }),
                    },
                  ],
                },
              ]}
            />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 110,
    gap: 10,
  },
  pageTitle: {
    fontSize: 40,
    color: C.text,
    marginBottom: 8,
    letterSpacing: TEXT_KERNING,
  },
  topRightActions: {
    position: 'absolute',
    right: 10,
    top: 6,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  topRightSettings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: C.card,
    zIndex: 10,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  cardTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: TEXT_KERNING,
  },
  hint: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: TEXT_KERNING,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: TEXT_KERNING,
  },
  fieldHint: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: TEXT_KERNING,
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 16,
    letterSpacing: TEXT_KERNING,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: TEXT_KERNING,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: C.sub,
    fontSize: 13,
    letterSpacing: TEXT_KERNING,
  },
  themeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  themeToggleText: {
    flex: 1,
    gap: 4,
  },
  themeDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 4,
  },

  // Copied container design from Launchpad (App.tsx) for customize page
  customizeSection: {
    gap: 8,
  },
  configRow: {
    flexDirection: 'row',
    gap: 8,
  },
  configCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    position: 'relative',
  },
  configCardBig: {
    flex: 1.65,
    height: 192,
  },
  configCardSmall: {
    flex: 1,
    height: 192,
  },
  configLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    lineHeight: 18,
  },
  configLabelTopLeft: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  cardInner: {
    paddingTop: 40,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  valueBox: {
    backgroundColor: '#DDDCDC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    minWidth: 52,
  },
  // Absolute variant for the KEY HEIGHT card so the large bottom-right knob
  // doesn't cover the small value readout. Positioned under the label.
  valueBoxKnob: {
    position: 'absolute',
    top: 36,   // a bit higher for clearance above the large bottom-right knob hit area
    left: 14,
    backgroundColor: '#DDDCDC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
  },
  valueInput: {
    fontFamily: 'FragmentMono',
    fontSize: 15,
    color: C.text,
    textAlign: 'center',
    letterSpacing: TEXT_KERNING,
    paddingVertical: 0,
    minWidth: 36,
  },
  resetBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resetText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'FragmentMono',
    letterSpacing: TEXT_KERNING,
  },

  // Knob styles (bottom-right area of the Key Height card)
  knobWrap: {
    position: 'absolute',
    bottom: 12,
    right: 8,
    width: 130,
    height: 130,
  },
  knobTrack: {
    position: 'absolute',
    left: 40,
    top: 48,   // push the visual gray lower in the card (and in the large hit area)
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F2F2F2',
  },
  knobThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000000',
  },

  // ===== Key Gap rotary disk styles (big spinning grey disk in the small right card) =====
  gapCard: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  // The touchable area for the spinning disk — now on the right side of the card
  gapDiskHit: {
    position: 'absolute',
    right: 8,
    top: 12,
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  // The actual big grey disk that rotates as a unit (the "face")
  gapDiskGrey: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F2F2F2',
    position: 'relative',
    overflow: 'visible',
  },
  // Small white circle perfectly centered in the grey disk
  gapDiskWhiteCenter: {
    position: 'absolute',
    top: (96 - 14) / 2,
    left: (96 - 14) / 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
  // Vertical parallel lines inside the grey disk (above and below the white center)
  gapDiskVLine: {
    position: 'absolute',
    width: 2,
    height: 18,
    backgroundColor: '#AEAEAE',
    borderRadius: 1,
    left: (96 - 2) / 2,
    zIndex: 1,
  },
  gapDiskVLineTop: {
    top: 16, // ~7px clearance from the white center circle (not touching)
  },
  gapDiskVLineBottom: {
    top: 62, // ~7px clearance from the white center circle (not touching)
  },
  gapValueWrap: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginTop: 'auto',
    marginBottom: 2,
  },
  gapBottomLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
    alignSelf: 'flex-start',
  },

  // Row Gap card (second row, small left) — positions the vertical slider on the right
  rowGapCard: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  // The right-side hit area containing the vertical track line and draggable knob
  rowGapSliderArea: {
    position: 'absolute',
    right: 8,
    top: 26,
    width: 40,
    height: 140,
    alignItems: 'center',
  },
  // Thin vertical guide line (#F2F2F2) on the right side of the row gap card
  rowGapTrack: {
    position: 'absolute',
    top: 0,
    height: 140,
    width: 4,
    backgroundColor: '#F2F2F2',
    borderRadius: 2,
  },
  // Draggable knob that travels along the vertical line
  rowGapKnob: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111111',
    left: (40 - 18) / 2,
  },

  // Key Radius card (second row, big right) — spinning disk + value bottom-right
  keyRadiusCard: {
    position: 'relative',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  radiusDiskHit: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Single vertical tick inside the grey disk (no white center circle)
  radiusDiskVLine: {
    position: 'absolute',
    width: 5,
    height: 70,          // Increased from 38 to 70
    backgroundColor: '#AEAEAE',
    borderRadius: 1.5,
    left: (96 - 3) / 2,
    top: (96 - 70) / 2,  // Recenter vertically
    zIndex: 1,
  },
  keyRadiusValueWrap: {
    position: 'absolute',
    right: 14,
    bottom: 12,
  },

  // Reset all settings container (white rounded card with red text/icon)
  resetAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 18,
    marginTop: 4,
  },
  resetAllText: {
    fontFamily: 'FragmentMono',
    fontSize: 14,
    fontWeight: '400',
    color: '#D71921',
    letterSpacing: TEXT_KERNING,
  },

  // Theme cards (Themes page)
  themeCard: {
    backgroundColor: C.card,
    borderRadius: CARD_R,
    marginBottom: 8,
    overflow: 'hidden',
    height: 240,
    flexDirection: 'column',
  },
  themeImageWrap: {
    height: 165, // taller image area (top portion of fixed 240px card)
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeImage: {
    width: '100%',
    height: '100%',
  },
  themeBottomArea: {
    height: 75,
    justifyContent: 'flex-start',
    paddingTop: 14, // small gap between image and content
  },
  themeBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  themeTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  themeTitle: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
  themeSubtitle: {
    fontFamily: 'FragmentMono',
    fontSize: 12,
    color: C.sub,
    letterSpacing: TEXT_KERNING,
    marginTop: 2,
  },
  themeBtn: {
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeBtnActive: {
    backgroundColor: '#222222',
  },
  themeBtnText: {
    fontFamily: 'FragmentMono',
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: TEXT_KERNING,
  },

  // Toggle row under theme cards (styled like the reset container)
  themeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 22,
    marginTop: 4,
  },
  themeToggleLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 14,
    color: C.text,
    letterSpacing: TEXT_KERNING,
    marginLeft: 10,
  },

  // Custom toggle matching GesturesPanel FeatureToggle design
  toggleTrack: {
    width: 44,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1D1D6',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#2CC642',
  },
  toggleThumb: {
    width: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbOn: {
    // transform is now driven by Animated.Value for smooth slide
  },
});