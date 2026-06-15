# Native Key Preview Popup — Agent Instructions

## What we're building
A Gboard-style key press preview for a React Native Android keyboard app.
When a letter key is pressed, a circle popup appears **above** the key showing
the letter. It appears instantly on touch (UI thread, no JS lag) and dismisses
on release. The key itself also dims slightly on press.

The JS side already has a multi-touch router that detects which key was hit.
We just need it to call a native module to show/hide the popup.

---

## Step 1 — Create `KeyPreviewManager.kt`

Create this file at:
`android/app/src/main/java/<your/package/path>/KeyPreviewManager.kt`

```kotlin
package <YOUR_PACKAGE_NAME>

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.PopupWindow
import android.widget.TextView
import androidx.core.content.ContextCompat

/**
 * Shows a Gboard-style circular key preview popup above a pressed key.
 * All show/hide calls MUST happen on the main thread.
 */
class KeyPreviewManager(private val context: Context) {

    private var popupWindow: PopupWindow? = null
    private var previewView: TextView? = null
    private val handler = Handler(Looper.getMainLooper())
    private var dismissRunnable: Runnable? = null

    /** Call this once during keyboard setup to pre-build the popup view. */
    fun init() {
        val tv = TextView(context).apply {
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.DEFAULT_BOLD
        }

        // Circle background
        val circle = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#FF6200EE")) // replace with your theme accent
            cornerRadius = 999f
        }
        tv.background = circle

        previewView = tv

        popupWindow = PopupWindow(tv, dpToPx(52), dpToPx(52), false).apply {
            isClippingEnabled = false   // allow drawing above the keyboard window
            isTouchable = false         // don't intercept touches
            elevation = 12f
        }
    }

    /**
     * Show the preview above the given anchor view with the given letter.
     *
     * @param anchor    The key View that was pressed
     * @param label     The letter to display (e.g. "A")
     * @param yOffsetDp How many dp above the key top to center the circle (default 36)
     */
    fun show(anchor: View, label: String, yOffsetDp: Int = 36) {
        handler.post {
            cancelDismiss()
            val pw = popupWindow ?: return@post
            val tv = previewView ?: return@post

            tv.text = label

            val popupSize = dpToPx(52)
            val anchorLoc = IntArray(2)
            anchor.getLocationInWindow(anchorLoc)

            val x = anchorLoc[0] + anchor.width / 2 - popupSize / 2
            val y = anchorLoc[1] - dpToPx(yOffsetDp) - popupSize / 2

            if (pw.isShowing) {
                pw.update(x, y, popupSize, popupSize)
            } else {
                pw.showAtLocation(anchor, Gravity.NO_GRAVITY, x, y)
            }
        }
    }

    /** Immediately hide the preview. */
    fun hide() {
        handler.post {
            cancelDismiss()
            popupWindow?.dismiss()
        }
    }

    /** Hide after a short delay (use on key release so fast taps still see the preview). */
    fun hideDelayed(delayMs: Long = 80) {
        cancelDismiss()
        dismissRunnable = Runnable {
            popupWindow?.dismiss()
        }.also { handler.postDelayed(it, delayMs) }
    }

    fun destroy() {
        handler.removeCallbacksAndMessages(null)
        popupWindow?.dismiss()
        popupWindow = null
        previewView = null
    }

    private fun cancelDismiss() {
        dismissRunnable?.let { handler.removeCallbacks(it) }
        dismissRunnable = null
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(),
            context.resources.displayMetrics
        ).toInt()
}
```

---

## Step 2 — Create `KeyPreviewModule.kt` (React Native bridge)

Create at:
`android/app/src/main/java/<your/package/path>/KeyPreviewModule.kt`

```kotlin
package <YOUR_PACKAGE_NAME>

import android.view.View
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.UIManagerModule

class KeyPreviewModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val manager = KeyPreviewManager(reactContext)

    override fun getName() = "KeyPreview"

    @ReactMethod
    fun init() {
        manager.init()
    }

    /**
     * Show preview above the view with the given reactTag.
     * @param reactTag  The RN tag of the key View (from findNodeHandle)
     * @param label     Letter to show, e.g. "A"
     */
    @ReactMethod
    fun show(reactTag: Int, label: String) {
        val uiManager = reactContext
            .getNativeModule(UIManagerModule::class.java) ?: return

        uiManager.addUIBlock { nativeViewHierarchyManager ->
            val view: View = try {
                nativeViewHierarchyManager.resolveView(reactTag)
            } catch (e: Exception) {
                return@addUIBlock
            }
            manager.show(view, label)
        }
    }

    @ReactMethod
    fun hide() {
        manager.hide()
    }

    @ReactMethod
    fun hideDelayed(delayMs: Double) {
        manager.hideDelayed(delayMs.toLong())
    }

    @ReactMethod
    fun destroy() {
        manager.destroy()
    }
}
```

---

## Step 3 — Register the module in your Package file

Find your existing `ReactPackage` implementation (usually something like
`MainPackage.kt` or `AppPackage.kt`). Add `KeyPreviewModule` to the list:

```kotlin
override fun createNativeModules(
    reactContext: ReactApplicationContext
): List<NativeModule> {
    return listOf(
        // ... your existing modules ...
        KeyPreviewModule(reactContext),
    )
}
```

If you use auto-linking / the new architecture, instead annotate the module
with `@ReactModule(name = "KeyPreview")` and register via `TurboModuleRegistry`
— but the classic bridge approach above works for both old and new arch in
bridge mode.

---

## Step 4 — Create `KeyPreview.ts` (JS wrapper)

Create at: `src/keyboard/KeyPreview.ts` (adjust path to match your structure)

```ts
import {NativeModules} from 'react-native';

const {KeyPreview} = NativeModules;

export function initKeyPreview(): void {
  KeyPreview?.init();
}

export function showKeyPreview(reactTag: number, label: string): void {
  KeyPreview?.show(reactTag, label);
}

export function hideKeyPreview(delayMs = 80): void {
  KeyPreview?.hideDelayed(delayMs);
}

export function destroyKeyPreview(): void {
  KeyPreview?.destroy();
}
```

---

## Step 5 — Wire into `Key.tsx` (multi-touch router branch only)

In the `usesMultiTouchRouter` render branch, add `collapsable={false}` to the
outer `View` (already there) and grab its `reactTag` via `findNodeHandle`.

At the top of `KeyComponent`, add:

```tsx
import {findNodeHandle} from 'react-native';
import {showKeyPreview, hideKeyPreview} from '../KeyPreview';
```

Replace the `registerMultiTouchKeyVisual` effect:

```tsx
useEffect(() => {
  if (!usesMultiTouchRouter) return;
  return registerMultiTouchKeyVisual(keyDef.id, pressed => {
    if (pressed) {
      const tag = findNodeHandle(keyRef.current);
      const label = isUppercase
        ? (keyDef.value ?? '').toUpperCase()
        : (keyDef.value ?? '').toLowerCase();
      if (tag) showKeyPreview(tag, label);
    } else {
      hideKeyPreview(80);
    }
  });
}, [keyDef.id, keyDef.value, isUppercase, usesMultiTouchRouter]);
```

Also add `opacity` to the key view for the dim effect on press — using a plain
style swap (no animation needed, instant):

```tsx
// In the usesMultiTouchRouter render return:
<View
  pointerEvents="none"
  style={[
    styles.key,
    {borderRadius, minHeight: keyHeight},
    multiTouchPressed && {opacity: 0.6},   // instant dim, no animation
  ]}>
  {keyContent}
</View>
```

And keep `registerMultiTouchKeyVisual` passing `setMultiTouchPressed` as before
so the `multiTouchPressed` state still drives the opacity swap.

---

## Step 6 — Init and destroy in `KeyboardApp.tsx`

In your root keyboard component:

```tsx
import {initKeyPreview, destroyKeyPreview} from './KeyPreview';

useEffect(() => {
  initKeyPreview();
  return () => destroyKeyPreview();
}, []);
```

---

## Tuning knobs (all in `KeyPreviewManager.kt`)

| What              | Where                          | Default     |
|-------------------|--------------------------------|-------------|
| Circle size       | `PopupWindow` width/height     | 52dp        |
| Y offset above key| `yOffsetDp` param in `show()`  | 36dp        |
| Dismiss delay     | `hideDelayed(delayMs)`         | 80ms        |
| Circle color      | `GradientDrawable.setColor`    | #FF6200EE   |
| Font size         | `setTextSize`                  | 22sp        |

Change the circle color to match your keyboard theme's key color or accent.

---

## What makes this zero-lag

- `PopupWindow.showAtLocation` and `update` are called on the **main/UI thread**
  via `Handler(Looper.getMainLooper())`.
- The native module receives the call from JS (small latency) but the actual
  View positioning and drawing happens natively — no JS frame budget consumed.
- `isClippingEnabled = false` lets the circle draw above the keyboard window
  boundary, exactly like Gboard.
- The JS side only passes a tag + string — the heaviest work (measure, position,
  draw) is all Kotlin.
