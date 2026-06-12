package com.typebase

import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.LifecycleState
import com.facebook.react.interfaces.fabric.ReactSurface

class TypeBaseInputService : InputMethodService() {

  private var reactSurface: ReactSurface? = null
  private var container: FrameLayout? = null
  private var keyboardView: View? = null
  private var keyboardHeightDp: Int = DEFAULT_KEYBOARD_HEIGHT_DP
  private var surfaceMountAttempts = 0
  private var keyboardResumedReact = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private val reactInstanceListener =
      object : ReactInstanceEventListener {
        override fun onReactContextInitialized(context: ReactContext) {
          container?.let { frame ->
            mainHandler.post { mountKeyboardSurface(frame) }
          }
        }
      }

  override fun onCreate() {
    super.onCreate()
    KeyboardInputBridge.inputService = this
    val app = application as? ReactApplication
    app?.reactHost?.addReactInstanceEventListener(reactInstanceListener)
    preloadKeyboardRuntime()
  }

  override fun onCreateInputView(): View {
    surfaceMountAttempts = 0
    val frame =
        FrameLayout(this).apply {
          // Allow two+ letter keys to receive touches at the same time (Gboard-style).
          setMotionEventSplittingEnabled(true)
        }
    container = frame
    resumeReactForKeyboard()
    mountKeyboardSurface(frame)
    return frame
  }

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    KeyboardInputBridge.setPrefersNumpad(KeyboardInputBridge.shouldPreferNumpad(attribute))
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    KeyboardInputBridge.setPrefersNumpad(KeyboardInputBridge.shouldPreferNumpad(info))
    resumeReactForKeyboard()
    container?.let { mountKeyboardSurface(it) }
  }

  override fun onWindowShown() {
    super.onWindowShown()
    resumeReactForKeyboard()
    container?.let { mountKeyboardSurface(it) }
    KeyboardInputBridge.notifyKeyboardShown()
  }

  override fun onFinishInputView(finishingInput: Boolean) {
    super.onFinishInputView(finishingInput)
    pauseReactForKeyboardIfNeeded()
  }

  override fun onWindowHidden() {
    super.onWindowHidden()
    pauseReactForKeyboardIfNeeded()
    KeyboardInputBridge.notifyKeyboardHidden()
  }

  private fun preloadKeyboardRuntime() {
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      app.reactHost?.start()
    }
  }

  /**
   * The IME has no Activity, so React Native stays paused unless we resume it when the keyboard
   * window is shown. Without this, taps on items/emoji/voice appear to freeze the keyboard.
   */
  private fun resumeReactForKeyboard() {
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      val host = app.reactHost ?: return@runOnUiThread
      if (host.lifecycleState != LifecycleState.RESUMED) {
        host.onHostResume(null)
        keyboardResumedReact = true
      }
    }
  }

  private fun pauseReactForKeyboardIfNeeded() {
    if (!keyboardResumedReact) {
      return
    }
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      app.reactHost?.onHostPause()
      keyboardResumedReact = false
    }
  }

  private fun mountKeyboardSurface(frame: FrameLayout) {
    val app = application as? ReactApplication ?: return
    val host = app.reactHost ?: return

    val surface =
        reactSurface
            ?: host.createSurface(this, KEYBOARD_COMPONENT_NAME, null).also { created ->
              reactSurface = created
              created.start()
            }

    val view = surface.view
    if (view == null) {
      scheduleSurfaceMountRetry(frame)
      return
    }

    surfaceMountAttempts = 0

    if (keyboardView === view && view.parent === frame) {
      return
    }

    (view.parent as? FrameLayout)?.removeView(view)
    (view as? ViewGroup)?.setMotionEventSplittingEnabled(true)
    keyboardView = view
    frame.addView(
        view,
        FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            keyboardHeightPx(keyboardHeightDp),
        ),
    )
  }

  private fun scheduleSurfaceMountRetry(frame: FrameLayout) {
    if (surfaceMountAttempts >= MAX_SURFACE_MOUNT_ATTEMPTS) {
      return
    }
    surfaceMountAttempts += 1
    val delayMs = minOf(50L * surfaceMountAttempts, 500L)
    mainHandler.postDelayed({ mountKeyboardSurface(frame) }, delayMs)
  }

  fun setKeyboardHeightDp(heightDp: Int) {
    keyboardHeightDp = heightDp.coerceAtLeast(MIN_KEYBOARD_HEIGHT_DP)
    val view = keyboardView ?: return
    val frame = container ?: return
    val heightPx = keyboardHeightPx(keyboardHeightDp)

    UiThreadUtil.runOnUiThread {
      val layoutParams =
          (view.layoutParams as? FrameLayout.LayoutParams)
              ?: FrameLayout.LayoutParams(
                  FrameLayout.LayoutParams.MATCH_PARENT,
                  heightPx,
              )
      layoutParams.height = heightPx
      view.layoutParams = layoutParams
      frame.requestLayout()
    }
  }

  private fun keyboardHeightPx(heightDp: Int): Int =
      TypedValue.applyDimension(
              TypedValue.COMPLEX_UNIT_DIP,
              heightDp.toFloat(),
              resources.displayMetrics,
          )
          .toInt()

  override fun onDestroy() {
    val app = application as? ReactApplication
    app?.reactHost?.removeReactInstanceEventListener(reactInstanceListener)
    pauseReactForKeyboardIfNeeded()
    reactSurface?.stop()
    reactSurface = null
    keyboardView = null
    container = null
    mainHandler.removeCallbacksAndMessages(null)
    if (KeyboardInputBridge.inputService === this) {
      KeyboardInputBridge.inputService = null
    }
    super.onDestroy()
  }

  companion object {
    const val KEYBOARD_COMPONENT_NAME = "TypeBaseKeyboard"
    const val DEFAULT_KEYBOARD_HEIGHT_DP = 340
    private const val MIN_KEYBOARD_HEIGHT_DP = 280
    private const val MAX_SURFACE_MOUNT_ATTEMPTS = 120
  }
}
