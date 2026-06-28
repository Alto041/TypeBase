package com.typebase.app

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.LifecycleState
import com.facebook.react.interfaces.fabric.ReactSurface
import com.typebase.app.licensing.PlayLicenseManager

class TypeBaseInputService : InputMethodService() {

  private var reactSurface: ReactSurface? = null
  private var container: FrameLayout? = null
  private var keyboardView: View? = null
  private var keyboardHeightDp: Int = DEFAULT_KEYBOARD_HEIGHT_DP
  private var surfaceMountAttempts = 0
  private var keyboardResumedReact = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private val nativeKeyFastPath = NativeKeyFastPath()

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
    KeyTapSoundPlayer.sync(applicationContext)
    val app = application as? ReactApplication
    app?.reactHost?.addReactInstanceEventListener(reactInstanceListener)
    preloadKeyboardRuntime()
  }

  val popupAnchorView: View?
    get() = container

  val keyboardViewForFeedback: View?
    get() = keyboardView ?: container

  override fun onCreateInputView(): View {
    surfaceMountAttempts = 0
    val frame =
        KeyboardFrameLayout().apply {
          // Allow two+ letter keys to receive touches at the same time (Gboard-style).
          setMotionEventSplittingEnabled(true)
        }
    container = frame
    if (!PlayLicenseManager.isLicensedCached(this)) {
      mountUnlicensedPlaceholder(frame)
      return frame
    }
    resumeReactForKeyboard()
    mountKeyboardSurface(frame)
    return frame
  }

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    KeyboardInputBridge.setCurrentEditorInfo(attribute)
    KeyboardInputBridge.setPrefersNumpad(KeyboardInputBridge.shouldPreferNumpad(attribute))
    KeyboardInputBridge.setSupportsNewline(KeyboardInputBridge.shouldAllowNewline(attribute))
    KeyboardInputBridge.refreshInitialCapsMode(attribute)
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    KeyboardInputBridge.setCurrentEditorInfo(info)
    KeyboardInputBridge.setPrefersNumpad(KeyboardInputBridge.shouldPreferNumpad(info))
    // Always notify JS when the input view opens; onStartInput may fire before RN mounts.
    KeyboardInputBridge.refreshSupportsNewline(info)
    KeyboardInputBridge.refreshInitialCapsMode(info)
    val frame = container ?: return
    if (!PlayLicenseManager.isLicensedCached(this)) {
      mountUnlicensedPlaceholder(frame)
      return
    }
    resumeReactForKeyboard {
      // Reset JS to the main alphabet view after React resumes, before the window is shown.
      KeyboardInputBridge.notifyKeyboardSessionStart()
      mountKeyboardSurface(frame)
    }
  }

  override fun onWindowShown() {
    super.onWindowShown()
    val frame = container ?: return
    if (!PlayLicenseManager.isLicensedCached(this)) {
      mountUnlicensedPlaceholder(frame)
      return
    }
    resumeReactForKeyboard()
    mountKeyboardSurface(frame)
    KeyboardInputBridge.notifyKeyboardShown()
  }

  override fun onFinishInputView(finishingInput: Boolean) {
    super.onFinishInputView(finishingInput)
    // Do not pause React here — onWindowHidden will notify JS and pause after the reset.
  }

  override fun onWindowHidden() {
    super.onWindowHidden()
    // Notify JS while React is still resumed so the reset runs before the next show.
    KeyboardInputBridge.notifyKeyboardHidden()
    pauseReactForKeyboardIfNeeded()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val landscape = newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE
    KeyboardInputBridge.notifyOrientationChanged(landscape)
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
  private fun resumeReactForKeyboard(onResumed: (() -> Unit)? = null) {
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      val host = app.reactHost ?: return@runOnUiThread
      if (host.lifecycleState != LifecycleState.RESUMED) {
        host.onHostResume(null)
        keyboardResumedReact = true
      }
      onResumed?.invoke()
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
    if (!PlayLicenseManager.isLicensedCached(this)) {
      mountUnlicensedPlaceholder(frame)
      return
    }
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

  fun setNativeKeyFastPathConfig(json: String) {
    nativeKeyFastPath.updateConfig(json)
  }

  private fun keyboardHeightPx(heightDp: Int): Int =
      TypedValue.applyDimension(
              TypedValue.COMPLEX_UNIT_DIP,
              heightDp.toFloat(),
              resources.displayMetrics,
          )
          .toInt()

  private fun mountUnlicensedPlaceholder(frame: FrameLayout) {
    UiThreadUtil.runOnUiThread {
      keyboardView?.let { view -> (view.parent as? ViewGroup)?.removeView(view) }
      keyboardView = null
      reactSurface?.stop()
      reactSurface = null
      frame.removeAllViews()

      val panel =
          LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F2F2F4"))
            val padding = dpToPx(20)
            setPadding(padding, padding, padding, padding)
          }

      val title =
          TextView(this).apply {
            text = getString(R.string.license_keyboard_title)
            setTextColor(Color.parseColor("#111111"))
            textSize = 18f
            gravity = Gravity.CENTER
          }
      val body =
          TextView(this).apply {
            text = getString(R.string.license_keyboard_body)
            setTextColor(Color.parseColor("#6B6B6B"))
            textSize = 14f
            gravity = Gravity.CENTER
            val top = dpToPx(8)
            setPadding(0, top, 0, 0)
          }
      val action =
          TextView(this).apply {
            text = "Open Google Play"
            setTextColor(Color.parseColor("#D71921"))
            textSize = 15f
            gravity = Gravity.CENTER
            val top = dpToPx(16)
            setPadding(0, top, 0, 0)
            setOnClickListener {
              val marketUri =
                  Uri.parse("market://details?id=${packageName}")
              val intent = Intent(Intent.ACTION_VIEW, marketUri)
              intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              intent.setPackage("com.android.vending")
              try {
                startActivity(intent)
              } catch (_: Exception) {
                val webUri =
                    Uri.parse("https://play.google.com/store/apps/details?id=${packageName}")
                startActivity(
                    Intent(Intent.ACTION_VIEW, webUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
              }
            }
          }

      panel.addView(title)
      panel.addView(body)
      panel.addView(action)
      frame.addView(
          panel,
          FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              keyboardHeightPx(keyboardHeightDp),
          ),
      )
    }
  }

  private fun dpToPx(dp: Int): Int =
      TypedValue.applyDimension(
              TypedValue.COMPLEX_UNIT_DIP,
              dp.toFloat(),
              resources.displayMetrics,
          )
          .toInt()

  override fun onDestroy() {
    val app = application as? ReactApplication
    app?.reactHost?.removeReactInstanceEventListener(reactInstanceListener)
    pauseReactForKeyboardIfNeeded()
    keyboardView?.let { view -> (view.parent as? ViewGroup)?.removeView(view) }
    keyboardView = null
    container = null
    nativeKeyFastPath.clear()
    KeyboardInputBridge.setTouchpadGestureConsuming(false)
    val surface = reactSurface
    reactSurface = null
    surface?.stop()
    mainHandler.removeCallbacksAndMessages(null)
    if (KeyboardInputBridge.inputService === this) {
      KeyboardInputBridge.inputService = null
    }
    super.onDestroy()
  }

  companion object {
    const val KEYBOARD_COMPONENT_NAME = "TypeBaseKeyboard"
    const val DEFAULT_KEYBOARD_HEIGHT_DP = 340
    private const val MIN_KEYBOARD_HEIGHT_DP = 200
    private const val MAX_SURFACE_MOUNT_ATTEMPTS = 120
  }

  private inner class KeyboardFrameLayout : FrameLayout(this@TypeBaseInputService) {
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (nativeKeyFastPath.onTouchEvent(event)) {
        return true
      }
      super.dispatchTouchEvent(event)
      if (KeyboardInputBridge.isTouchpadGestureConsuming()) {
        return true
      }
      // Gboard-style: any tap inside the IME window stays in the keyboard — even on
      // empty plugin-panel padding. If we return false, Android may hide the IME.
      return true
    }
  }
}
