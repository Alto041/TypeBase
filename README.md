# TypeBase

Custom Android keyboard built with **React Native** and an **InputMethodService (IME)**.

The keyboard UI is rendered in React Native. Text input is handled through a native bridge that talks to Android's `InputConnection` API.

## Architecture

```
┌─────────────────────────────────────┐
│  Any Android app (Messages, etc.)   │
└─────────────────┬───────────────────┘
                  │ InputConnection
┌─────────────────▼───────────────────┐
│  TypeBaseInputService (Kotlin IME)  │
│  └── ReactSurface → TypeBaseKeyboard│
└─────────────────┬───────────────────┘
                  │ NativeModules
┌─────────────────▼───────────────────┐
│  KeyboardModule (insertText, etc.)  │
└─────────────────────────────────────┘
```

Inspired by [SitePen's React Native input extensions demo](https://github.com/SitePen/rn-input-extensions-blog).

## Features

- QWERTY letter layout
- Number and symbol layouts
- Shift, backspace, space, and enter keys
- Dark theme keyboard UI
- Setup screen in the main app

## Prerequisites

- Node.js 22+
- Android Studio with SDK and an emulator or device
- JDK 17+

## Getting started

This is an **Expo dev client** project (SDK 56). Custom keyboard native code requires a development build — **Expo Go will not work**.

```bash
cd TypeBase
npm install
npm start
```

In another terminal:

```bash
npm run android
# or: npx expo run:android
```

## Enable the keyboard

After installing the app:

1. Open **Settings → System → Languages & input → On-screen keyboard → Manage keyboards**
2. Enable **TypeBase Keyboard**
3. Open any app with a text field
4. Tap the keyboard switcher (often bottom-right) and select **TypeBase Keyboard**

You can also tap **Open Keyboard Settings** in the TypeBase app.

## Project structure

```
TypeBase/
├── android/app/src/main/java/com/typebase/
│   ├── TypeBaseInputService.kt   # Android IME service
│   ├── KeyboardModule.kt         # Native bridge for text input
│   └── KeyboardInputBridge.kt    # Service ↔ module connection
├── src/keyboard/
│   ├── KeyboardApp.tsx           # Keyboard root component
│   ├── components/Key.tsx        # Key and row components
│   └── layouts/qwerty.ts         # QWERTY / number / symbol layouts
└── App.tsx                       # Main app setup screen
```

## Development notes

- The keyboard runs as a system IME, not an in-app custom view.
- React Native renders the keyboard via `ReactSurface` attached to the app's shared `ReactHost`.
- Keep the keyboard UI lightweight for fast startup and low memory use.
- Metro must be running in debug builds so the IME can load the JS bundle.

## Next steps

- Haptic feedback on key press
- Long-press for alternate characters
- Autocorrect and suggestions bar
- Themes and layout customization
- SharedPreferences bridge between app and keyboard (auth, settings)

## License

MIT
