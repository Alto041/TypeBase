# Landscape compact typing — release acceptance

Build: `npm run android:apk` → install `android/app/build/outputs/apk/release/app-release.apk`  
Package: `com.typebase.app` (uninstall debug build first if signature mismatch).

## Environment

- Physical Android device, landscape typing in a plain text field (Notes, Messages, or similar).
- Compare against Gboard in the **same app and field**, not against debug `npx expo run:android`.

## Pass criteria

| Check | Expected |
|-------|----------|
| Letter latency | Key-down → character visible feels Gboard-close (target median &lt; 25 ms subjectively) |
| Backspace tap | One char removed per tap, no multi-second stall |
| Backspace hold | Steady repeat via native path, no JS jank |
| Space + autocorrect | With autocorrect on, typed word + space applies correction when appropriate |
| Rotate | Portrait ↔ landscape mid-session: keys stay live, prefix reasonable |
| Dead keys | None on letter row or bottom row modifiers |
| Zero-latency | Long-press space still enters zero-latency; previews may be off |

## Engine Stats (in-app)

Open Settings → Engine Stats → **Compact typing (session)**:

- `reactTouchBlocks` should rise while typing letters in landscape (RN not handling those touches).
- `fastPathConfigPublishes` should stay low during typing (not per keystroke).
- `compactStateSyncs` should track boundaries/backspace/idle, not every letter.

## Regression smoke

- Portrait typing unchanged (multi-touch letters, swipe if enabled).
- Emoji panel, suggestion bar taps, premium panels still respond in landscape.
