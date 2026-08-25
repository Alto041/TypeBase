# VoiceFlow Feature Redesign

## Overview
The voiceflow feature has been completely redesigned to provide a more engaging and interactive experience. When voice input is triggered, the suggestion bar now transforms into a beautiful visualization that responds to your voice in real-time.

## Key Features

### 1. **Wide Circular Pill Design**
- The entire suggestion bar becomes a large, rounded pill shape during voice input
- Clean, modern appearance with smooth borders and subtle glow
- Responsive to voice activity with pulsing animations

### 2. **Dynamic Yellow Gradient Fill (from bottom)**
- The pill features an animated fill gradient that starts from the bottom and rises based on audio level
- **Color progression**:
  - 0-40% audio level: Light yellow (#FFE082)
  - 40-70% audio level: Amber (#FFC107)
  - 70-100% audio level: Deep orange (#FFA726)
- Responds in real-time to voice input volume
- Smooth decay animation when not speaking

### 3. **Live Transcript Display**
- Shows the partial transcript of what's being recognized
- Positioned in the center of the pill
- Falls back to status text ("Listening..." or "Speaking...") when no transcript available
- Scrolls gracefully within the container

### 4. **Stop Button (Circular, Right Side)**
- Large circular button on the right side of the pill
- Easily accessible stop icon
- Animated press feedback with haptic response
- Allows users to end voice input anytime

### 5. **Enhanced Animations**
- Smooth entrance animation when voice is triggered (spring-based)
- Pulsing glow effect that responds to listening state
- Real-time audio level visualization
- Graceful exit animation when closing voice input

## Technical Implementation

### New Components

#### `VoiceFlowVisualization.tsx`
Located at: `src/keyboard/components/VoiceFlowVisualization.tsx`

Main component that handles the entire voice visualization. Features:
- Real-time audio level animation
- Color-coded gradient fill (yellow → amber → orange)
- Transcript display with fallback status text
- Circular stop button with haptic feedback
- Spring-based entrance/exit animations
- Pulsing glow background

**Props:**
```typescript
type VoiceFlowVisualizationProps = {
  visible: boolean;           // Control visibility
  listening: boolean;         // Whether actively listening
  speaking: boolean;          // Whether user is speaking
  audioLevel: number;         // 0-1 audio level
  transcript: string;         // Partial or final transcript
  onStop: () => void;        // Stop button callback
};
```

### Updates to Existing Components

#### `useVoiceInput.ts` Hook
Added audio level tracking:
- `audioLevel`: State that tracks current audio level (0-1)
- `audioLevelDecayRef`: Reference for decay interval
- Automatic decay when not listening (50ms intervals, 0.05 per interval)
- Cleanup on component unmount

#### `SuggestionBar.tsx`
Updated to use the new visualization:
- Added `voiceAudioLevel` prop to pass audio level from parent
- Replaced `VoiceSpeechPill` with `VoiceFlowVisualization` during active voice sessions
- Maintains backward compatibility with other suggestion bar modes

#### `KeyboardApp.tsx`
Connected the voice system:
- Destructures `audioLevel` from `useVoiceInput` hook
- Passes `voiceAudioLevel` to `SuggestionBar` component

## Visual Hierarchy

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │                                          │   │
│  │   [Glow Background - Pulsing]           │   │
│  │   ┌──────────────────────────────────┐   │   │
│  │   │                                  │   │   │
│  │   │  Your transcript appears here... │ ⊚  │   │
│  │   │  [████████░░░░░] ← Audio fill    │ S  │   │
│  │   │                                  │ T  │   │
│  │   └──────────────────────────────────┘ O  │   │
│  │                                          │ P  │
│  └──────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘

Legend:
- Glow = Pulsing background indicating active listening
- [████] = Audio level fill (yellow → orange)
- Text = Live transcript or status
- ⊚ STOP = Circular stop button (right side)
```

## Animation Timelines

### Voice Session Start
1. **Container entrance** (280ms): Scale and opacity spring animation
2. **Glow pulse** (800ms repeat): Alternates between 30% and 100% opacity
3. **Text fade-in** (220ms): Content becomes visible

### Audio Level Response
- **Rise**: Immediate timing response to audio input (80ms duration)
- **Decay**: Gradual 50ms interval decay when silent (5% per interval)
- **Fill height**: Maps from 2px (silent) to 100% (full volume)

### Voice Session End
1. **Container exit** (280ms): Scale and opacity spring animation
2. **Glow fade** (120ms): Quickly fades out
3. **Content fade** (120ms): Text disappears first

## Color Scheme

The gradient colors are carefully chosen to match TypeBase's yellow accent theme:

| Audio Level | Color | Hex Code | Usage |
|---|---|---|---|
| Quiet (0-40%) | Light Yellow | #FFE082 | Initial audio detection |
| Medium (40-70%) | Amber | #FFC107 | Active speaking |
| Loud (70-100%) | Deep Orange | #FFA726 | Strong voice input |

## Responsive Behavior

- **Width**: Takes full width of suggestion bar (minus padding)
- **Height**: Minimum 44px, expands with content if needed
- **Orientation**: Works seamlessly in both portrait and landscape
- **Theme**: Automatically adapts to current keyboard theme colors

## User Experience Benefits

1. **Real-time Feedback**: Users see immediate visual response to their voice
2. **Visual Clarity**: The large pill design makes voice mode obvious and distinct
3. **Confidence Building**: The gradient fill gives users confidence that their voice is being captured
4. **Ease of Control**: The stop button is always visible and easily accessible
5. **Beautiful Design**: Modern, polished appearance that enhances overall keyboard aesthetic

## Future Enhancements

Potential improvements for future iterations:
- Frequency spectrum visualization (instead of single audio level)
- Waveform animation alongside gradient fill
- Custom color themes per keyboard design
- Haptic feedback patterns that respond to audio level
- Confidence indicator for transcript accuracy
- Undo/redo for voice input corrections
