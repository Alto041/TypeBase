# Settings inset slider design

The sliders in **Customize Bar** (`components/SettingsScreen.tsx`) use `StandaloneInsetSlider` from `components/InsetSlider.tsx`.

## Design tokens

```ts
const TRACK_RIGHT_GUTTER = 0;
const DIVIDER_INSET = 14;
const FILL_END_RADIUS = 12;
const DIVIDER_WIDTH = 3;
const LABEL_FONT = 'FragmentMono';
const VALUE_FONT = 'NType82';
const H_PADDING = 16;
const LABEL_VALUE_GAP = 10;
```

## Colors (light / dark)

```ts
const trackBg = isDark ? '#3F3F3F' : '#E3E3E3';
const fillBgDefault = isDark ? '#1F1F1F' : '#ffffff';

// Settings passes invertTrackColors — in dark mode track/fill swap
const invertTrack = invertTrackColors && isDark;
const containerBg = invertTrack ? fillBgDefault : trackBg;
const fillBg = invertTrack ? trackBg : fillBgDefault;
const dividerColor = isDark ? '#444450' : '#d0d0d4';
const textColor = isDark ? '#ffffff' : '#111111';
```

## Usage in SettingsScreen

```tsx
import { StandaloneInsetSlider } from './InsetSlider';

<StandaloneInsetSlider
  label="Strip width"
  value={prefs.collapsedWidthDp}
  minimumValue={8}
  maximumValue={26}
  step={1}
  isDark={isDark}
  invertTrackColors
  onChange={(next) => {
    if (next !== lastStripWidthRef.current) {
      lastStripWidthRef.current = next;
      void hapticTap();
    }
    setPrefs({ collapsedWidthDp: next });
  }}
/>

// Percentage formatting example (strip opacity)
<StandaloneInsetSlider
  label="Strip opacity"
  value={prefs.panelAlpha}
  minimumValue={0}
  maximumValue={1}
  step={0.05}
  isDark={isDark}
  invertTrackColors
  formatValue={(v) => `${Math.round(v * 100)}%`}
  onChange={(next) => setPrefs({ panelAlpha: next })}
/>
```

## Slider stack layout (SettingsScreen)

```tsx
function renderSettingsRows(rows: SettingsRow[], cardBg: string) {
  return (
    <View style={styles.sliderStack}>
      {rows.map((row) =>
        row.standalone ? (
          <View key={row.key}>{row.el}</View>
        ) : (
          <View
            key={row.key}
            style={[styles.card, styles.singleCard, { backgroundColor: cardBg, borderRadius: CARD_R }]}
          >
            {row.el}
          </View>
        ),
      )}
    </View>
  );
}

// styles
sliderStack: {
  marginBottom: 14,
  gap: 10,
  paddingTop: 6,
},
```

## Core visual structure (`InsetSlider`)

```tsx
return (
  <View
    style={[styles.container, { backgroundColor: containerBg }, disabled && styles.disabled]}
    {...panResponder.panHandlers}
    accessibilityRole="adjustable"
    accessibilityLabel={label}
    accessibilityValue={{ min: minimumValue, max: maximumValue, now: liveValue }}
  >
    {/* Hidden label measure for collision math */}
    <Text style={styles.labelMeasure}>{label}</Text>

    {/* Fill grows from the left */}
    {layoutWidth > 0 && fillWidth > 0 ? (
      <View
        pointerEvents="none"
        style={[
          styles.fill,
          {
            width: fillWidth,
            backgroundColor: fillBg,
            borderTopRightRadius: FILL_END_RADIUS,
            borderBottomRightRadius: FILL_END_RADIUS,
          },
        ]}
      />
    ) : null}

    {/* Vertical pill divider at fill edge */}
    {layoutWidth > 0 && fillWidth > 0 ? (
      <View
        pointerEvents="none"
        style={[styles.divider, { left: dividerLeft, backgroundColor: dividerColor }]}
      />
    ) : null}

    {/* Label slides right when fill would overlap it */}
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.label,
        { color: textColor, transform: [{ translateX: labelTranslateX }] },
      ]}
      numberOfLines={1}
    >
      {label}
    </Animated.Text>

    {/* Value pinned to the right */}
    <Text pointerEvents="none" style={[styles.valueText, { color: textColor }]}>
      {displayValue}
    </Text>
  </View>
);
```

## Styles

```ts
const styles = StyleSheet.create({
  container: {
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: H_PADDING,
  },
  disabled: {
    opacity: 0.38,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  divider: {
    position: 'absolute',
    top: '22%',
    bottom: '22%',
    width: DIVIDER_WIDTH,
    borderRadius: 999,
  },
  label: {
    position: 'absolute',
    left: H_PADDING,
    top: 0,
    bottom: 0,
    fontFamily: LABEL_FONT,
    fontSize: 13,
    textTransform: 'uppercase',
    zIndex: 2,
    textAlignVertical: 'center',
    lineHeight: 54,
    includeFontPadding: false,
  },
  valueText: {
    position: 'absolute',
    right: H_PADDING,
    top: 0,
    bottom: 0,
    fontFamily: VALUE_FONT,
    fontSize: 13,
    textAlignVertical: 'center',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
    zIndex: 1,
    lineHeight: 54,
    includeFontPadding: false,
  },
});
```

## Standalone wrapper (full-width row in settings)

```tsx
export function StandaloneInsetSlider(props: InsetSliderProps) {
  return (
    <View style={standaloneStyles.shell}>
      <View style={standaloneStyles.bleed}>
        <InsetSlider {...props} />
      </View>
    </View>
  );
}

const standaloneStyles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  bleed: {
    marginHorizontal: -12,
    alignSelf: 'stretch',
  },
});
```

## Behavior notes

- **54dp tall** rounded track (`borderRadius: 14`) with a left-growing fill and rounded right edge (`FILL_END_RADIUS: 12`).
- **Divider** — 3px vertical pill at the fill edge (`top/bottom: 22%`).
- **Label dodge** — when the fill reaches the label, the label springs to the right via `Animated.spring` so it is not covered.
- **Interaction** — horizontal pan to drag; tap jumps to position. Haptics on tap/release, not every drag step.
- **Settings** — always passes `invertTrackColors` so dark mode uses a light fill on a dark track.

## Source files

- `components/InsetSlider.tsx` — component + styles
- `components/SettingsScreen.tsx` — usage in Edge bar / Expanded sections
