import React, {useEffect, useRef, useState} from 'react';
import {
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

/** Wrap angle delta to (-π, π] so small drags don't jump across the circle. */
function normalizeAngleDelta(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function KeyboardThemeCard() {
  const [isDark, setIsDark] = useState(false);
  const [isQuivox, setIsQuivox] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customThemeJson, setCustomThemeJson] = useState(
    `{
  "container": "#000000",
  "pluginCard": "#07070D",
  "pluginCardSecondary": "#0D0D16",
  "borderSubtle": "#1A1A26",
  "suggestionDivider": "#2A2A3A",

  "letterKey": "#1A1A22",
  "letterKeyPressed": "#252533",
  "modifierKey": "#00C2A8",
  "modifierKeyPressed": "#009A86",
  "spaceKey": "#FFB020",
  "spaceKeyPressed": "#E79A0E",
  "enter": "#FF2D55",
  "enterPressed": "#C81F41",

  "label": "#E9EEF6",
  "spaceLabel": "#111827",
  "icon": "#E9EEF6",
  "iconMuted": "#A9B4C2",
  "iconOnEnter": "#FFFFFF",

  "essentialsAccent": "#FFB020",
  "swipeTrail": "#FFB020",
  "launcherKey": "#00C2A8",

  "chipSelectedBackground": "#00C2A8",
  "chipSelectedText": "#FFFFFF",

  "keyRipple": "rgba(255, 255, 255, 0.18)"
}`,
  );

  useEffect(() => {
    void ensureThemeLoaded().then(() => {
      setIsDark(getKeyboardColorScheme() === 'dark');
      setIsQuivox(getKeyboardDesign() === 'quivox');
      setIsCustom(getKeyboardDesign() === 'custom');
      setCustomThemeJson(getKeyboardCustomTheme());
      setLoading(false);
    });
  }, []);

  const handleDarkToggle = (enabled: boolean) => {
    setIsDark(enabled);
    void setKeyboardColorScheme(enabled ? 'dark' : 'light');
  };

  const handleQuivoxToggle = (enabled: boolean) => {
    setIsQuivox(enabled);
    if (enabled) {
      setIsCustom(false);
      void setKeyboardDesign('quivox');
      return;
    }
    if (isCustom) {
      // If custom is enabled, turning Quivox off should not change it.
      return;
    }
    void setKeyboardDesign('typebase');
  };

  const handleCustomToggle = (enabled: boolean) => {
    setIsCustom(enabled);
    if (enabled) {
      setIsQuivox(false);
      void setKeyboardDesign('custom');
    } else {
      void setKeyboardDesign('typebase');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Dark keyboard</Text>
          <Text style={styles.hint}>
            Switch the TypeBase keyboard between light and dark.
          </Text>
        </View>
        <Switch
          value={isDark}
          onValueChange={handleDarkToggle}
          disabled={loading}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      <View style={styles.themeDivider} />

      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Quivox Design</Text>
          <Text style={styles.hint}>
            Use the Quivox keyboard look — lilac keys, blue modifiers, gold space.
          </Text>
        </View>
        <Switch
          value={isQuivox}
          onValueChange={handleQuivoxToggle}
          disabled={loading || isCustom}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      <View style={styles.themeDivider} />

      <View style={styles.themeToggleRow}>
        <View style={styles.themeToggleText}>
          <Text style={styles.cardTitle}>Custom Theme JSON</Text>
          <Text style={styles.hint}>
            Paste a theme palette JSON (colors + keys) and apply it.
          </Text>
        </View>
        <Switch
          value={isCustom}
          onValueChange={handleCustomToggle}
          disabled={loading}
          trackColor={{false: '#334155', true: '#2563EB'}}
          thumbColor="#F8FAFC"
        />
      </View>

      {isCustom ? (
        <View style={{gap: 8}}>
          <Text style={styles.fieldLabel}>Theme JSON</Text>
          <TextInput
            style={styles.input}
            value={customThemeJson}
            onChangeText={setCustomThemeJson}
            multiline
            editable={!loading}
          />
          <Pressable
            style={[
              styles.primaryButton,
              {backgroundColor: '#2563EB', marginTop: 0},
            ]}
            onPress={() => {
              try {
                // Ensure it's valid JSON before sending to native.
                JSON.parse(customThemeJson);
                void setKeyboardCustomTheme(customThemeJson);
                void setKeyboardDesign('custom');
              } catch {
                // No native-side error UI right now; we rely on this local guard.
              }
            }}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>Apply custom theme</Text>
          </Pressable>
          <Pressable
            style={[styles.linkButton, {paddingVertical: 0}]}
            onPress={() => {
              setCustomThemeJson(`{
  "container": "#000000",
  "pluginCard": "#07070D",
  "pluginCardSecondary": "#0D0D16",
  "borderSubtle": "#1A1A26",
  "suggestionDivider": "#2A2A3A",
  "letterKey": "#1A1A22",
  "letterKeyPressed": "#252533",
  "modifierKey": "#00C2A8",
  "modifierKeyPressed": "#009A86",
  "spaceKey": "#FFB020",
  "spaceKeyPressed": "#E79A0E",
  "enter": "#FF2D55",
  "enterPressed": "#C81F41",
  "label": "#E9EEF6",
  "spaceLabel": "#111827",
  "icon": "#E9EEF6",
  "iconMuted": "#A9B4C2",
  "iconOnEnter": "#FFFFFF",
  "essentialsAccent": "#FFB020",
  "swipeTrail": "#FFB020",
  "launcherKey": "#00C2A8",
  "chipSelectedBackground": "#00C2A8",
  "chipSelectedText": "#FFFFFF",
  "keyRipple": "rgba(255, 255, 255, 0.18)"
}`);
            }}
          >
            <Text style={{color: '#64748B', fontSize: 13}}>
              Reset template
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

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
    setLayout(current => ({...current, [key]: next}));
    void updateKeyboardLayoutSetting(key, next);
  };

  const handleReset = () => {
    setLayout(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
    void setKeyboardLayoutSettings(DEFAULT_KEYBOARD_LAYOUT_SETTINGS);
  };

  const keyHeight = layout.keyHeight;
  const keyGap = layout.keyGap;
  const rowGap = layout.keyRowMargin;

  // Knob geometry (for Key Height circular control)
  const KNOB_SIZE = 130;   // larger hit area for easier control (finger can land around the visual)
  const TRACK_R = 42;      // gray circle radius (visual size of the gray disk)
  const THUMB_R = 10;      // black knob radius (slightly larger grab target)
  const ORBIT_R = TRACK_R - 20; // much smaller orbit → black sits well inside the gray with clear space to the edge

  // Visual placement of the gray disk *inside* the knobWrap (must match the knobTrack left/top in styles)
  const KNOB_VISUAL_LEFT = 40;
  const KNOB_VISUAL_TOP  = 48;
  const GRAY_CENTER_X = KNOB_VISUAL_LEFT + TRACK_R;
  const GRAY_CENTER_Y = KNOB_VISUAL_TOP  + TRACK_R;

  // How many full rotations to sweep the whole range (higher = less sensitive / easier to control)
  const KEY_HEIGHT_MIN = 40;
  const KEY_HEIGHT_MAX = 64;
  const KEY_HEIGHT_RANGE = KEY_HEIGHT_MAX - KEY_HEIGHT_MIN;
  const KEY_HEIGHT_TURNS = 1.5;

  const keyHeightDragRef = useRef({ startAngle: 0, startValue: KEY_HEIGHT_MIN });

  const knobPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        keyHeightDragRef.current.startAngle = Math.atan2(
          locationY - GRAY_CENTER_Y,
          locationX - GRAY_CENTER_X,
        );
        keyHeightDragRef.current.startValue = keyHeight;
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const curAngle = Math.atan2(
          locationY - GRAY_CENTER_Y,
          locationX - GRAY_CENTER_X,
        );
        const delta = normalizeAngleDelta(
          curAngle - keyHeightDragRef.current.startAngle,
        );
        const deltaTurns = delta / (2 * Math.PI);
        let next = Math.round(
          keyHeightDragRef.current.startValue +
            (deltaTurns * KEY_HEIGHT_RANGE) / KEY_HEIGHT_TURNS,
        );
        next = Math.max(KEY_HEIGHT_MIN, Math.min(KEY_HEIGHT_MAX, next));

        if (next !== keyHeight) {
          update('keyHeight', next);
          Haptics.selectionAsync().catch(() => {});
          keyHeightDragRef.current.startValue = next;
          keyHeightDragRef.current.startAngle = curAngle;
        }
      },
    })
  ).current;

  // Thumb position derived from current keyHeight (source of truth)
  const knobNorm = (keyHeight - 40) / 24;
  const knobAngle = knobNorm * (2 * Math.PI);
  // Position the black knob relative to the visual gray center (not the hit-area box center)
  const kcx = GRAY_CENTER_X;
  const kcy = GRAY_CENTER_Y;
  // Use the smaller ORBIT_R so the black knob sits inwards from the gray circle's edge
  const knobThumbLeft = kcx + ORBIT_R * Math.cos(knobAngle) - THUMB_R;
  const knobThumbTop = kcy + ORBIT_R * Math.sin(knobAngle) - THUMB_R;

  // ==================== KEY GAP rotary disk (big grey disk that spins) ====================
  const GAP_HIT_SIZE = 110; // touch area (grey disk is centered inside this)
  const GAP_HIT_CENTER = GAP_HIT_SIZE / 2;
  const GAP_TURNS = 2; // need ~2 full spins to go 0→12 (less sensitive, easier to control)

  // Rotation of the disk face (full 360° for the 0-12 range)
  const gapRotation = (keyGap / 12) * (2 * Math.PI);

  const gapDragRef = useRef({ startAngle: 0, startValue: 0 });

  const gapDiskPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        gapDragRef.current.startAngle = Math.atan2(
          locationY - GAP_HIT_CENTER,
          locationX - GAP_HIT_CENTER,
        );
        gapDragRef.current.startValue = keyGap;
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const curAngle = Math.atan2(
          locationY - GAP_HIT_CENTER,
          locationX - GAP_HIT_CENTER,
        );
        const delta = normalizeAngleDelta(
          curAngle - gapDragRef.current.startAngle,
        );
        const deltaTurns = delta / (2 * Math.PI);
        let next = Math.round(
          gapDragRef.current.startValue + (deltaTurns * 12) / GAP_TURNS,
        );
        next = Math.max(0, Math.min(12, next));

        if (next !== keyGap) {
          update('keyGap', next);
          Haptics.selectionAsync().catch(() => {});
          gapDragRef.current.startValue = next;
          gapDragRef.current.startAngle = curAngle;
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

                  {/* Vertical line above the center (inside the grey) */}
                  <View style={[styles.gapDiskVLine, styles.gapDiskVLineTop]} />

                  {/* Vertical line below the center (inside the grey) */}
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
            <View style={[styles.configCard, styles.configCardSmall]}>
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                ROW GAP
              </Text>
              <View style={styles.cardInner}>
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

            <View style={[styles.configCard, styles.configCardBig]}>
              <Text style={[styles.configLabel, styles.configLabelTopLeft]}>
                DEFAULTS
              </Text>
              <View style={styles.cardInner}>
                <Pressable style={styles.resetBtn} onPress={handleReset} disabled={loading}>
                  <Text style={styles.resetText}>Reset</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ThemesScreen({onBack}: {onBack: () => void}) {
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

        <KeyboardThemeCard />
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
  },
  hint: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  fieldHint: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 18,
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
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: C.sub,
    fontSize: 13,
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 10,
  },
  // The touchable area for the spinning disk (slightly larger than the visual grey for easy control)
  gapDiskHit: {
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
    width: 3,
    height: 20,
    backgroundColor: '#111111',
    left: (96 - 3) / 2,
    zIndex: 1,
  },
  gapDiskVLineTop: {
    top: (96 / 2) - 20 - 5, // a little space above the white center
  },
  gapDiskVLineBottom: {
    top: (96 / 2) + 5, // a little space below the white center
  },
  gapValueWrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  gapBottomLabel: {
    fontFamily: 'FragmentMono',
    fontSize: 16,
    fontWeight: '400',
    color: C.text,
    letterSpacing: TEXT_KERNING,
  },
});
