package com.typebase.app

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Rect
import android.hardware.input.InputManager
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Choreographer
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowInsets
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
import kotlin.math.roundToInt

class TypeBaseInputService : InputMethodService(), InputManager.InputDeviceListener {

  private var reactSurface: ReactSurface? = null
  private var container: FrameLayout? = null
  private var keyboardView: View? = null
  private var previewOverlay: FrameLayout? = null
  /** Wraps RN keyboard + preview overlay so drag moves one composited layer (Gboard-style). */
  private var floatingCardShell: FrameLayout? = null
  private var keyboardHeightDp: Int = DEFAULT_KEYBOARD_HEIGHT_DP
  private var surfaceMountAttempts = 0
  private var keyboardResumedReact = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private val nativeKeyFastPath = NativeKeyFastPath()
  private var inputManager: InputManager? = null
  private var controllerConnected = false
  private var lastControllerDirection: String? = null
  private var lastControllerDirectionAt = 0L
  private var floatingKeyboardEnabled = false
  private val floatingTouchableRect = Rect()
  private var floatingLeftPx = -1
  private var floatingTopPx = -1
  private var floatingDragStartX = 0f
  private var floatingDragStartY = 0f
  private var floatingDragStartLeft = 0
  private var floatingDragStartTop = 0
  private var floatingDragActive = false
  private var pendingFloatingDragDeltaX = 0f
  private var pendingFloatingDragDeltaY = 0f
  private var floatingDragFramePosted = false
  private val floatingDragFrameCallback =
      Choreographer.FrameCallback {
        floatingDragFramePosted = false
        if (!floatingDragActive) {
          return@FrameCallback
        }
        applyFloatingDragTranslation(pendingFloatingDragDeltaX, pendingFloatingDragDeltaY)
      }
  private val floatingKeyboardOutlineProvider =
      object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setRoundRect(0, 0, view.width, view.height, dpToPx(FLOATING_CORNER_RADIUS_DP).toFloat())
        }
      }

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
    inputManager = getSystemService(INPUT_SERVICE) as? InputManager
    inputManager?.registerInputDeviceListener(this, mainHandler)
    updateControllerConnectionState()
    val app = application as? ReactApplication
    app?.reactHost?.addReactInstanceEventListener(reactInstanceListener)
    preloadKeyboardRuntime()
  }

  val popupAnchorView: View?
    get() {
      if (Looper.myLooper() != Looper.getMainLooper()) {
        return previewOverlay ?: keyboardView ?: container
      }
      ensurePreviewOverlay()
      return previewOverlay ?: keyboardView ?: container
    }

  val keyboardCoordinateView: View?
    get() = keyboardView ?: container

  val keyboardViewForFeedback: View?
    get() = keyboardView ?: container

  override fun onCreateInputView(): View {
    surfaceMountAttempts = 0
    val frame =
        KeyboardFrameLayout().apply {
          isHapticFeedbackEnabled = true
          // Allow two+ letter keys to receive touches at the same time (Gboard-style).
          setMotionEventSplittingEnabled(true)
          clipChildren = false
          clipToPadding = false
        }
    container = frame
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
    publishEditorContextBeforeCursor()
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    KeyboardInputBridge.setCurrentEditorInfo(info)
    KeyboardInputBridge.setPrefersNumpad(KeyboardInputBridge.shouldPreferNumpad(info))
    // Always notify JS when the input view opens; onStartInput may fire before RN mounts.
    KeyboardInputBridge.refreshSupportsNewline(info)
    KeyboardInputBridge.refreshInitialCapsMode(info)
    val frame = container ?: return
    resumeReactForKeyboard {
      // Reset JS to the main alphabet view after React resumes, before the window is shown.
      KeyboardInputBridge.notifyKeyboardSessionStart()
      mountKeyboardSurface(frame)
    }
  }

  override fun onWindowShown() {
    super.onWindowShown()
    val frame = container ?: return
    resumeReactForKeyboard()
    mountKeyboardSurface(frame)
    syncImeCaptionBarVisibility()
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
    publishEditorContextBeforeCursor("")
    pauseReactForKeyboardIfNeeded()
  }

  override fun onUpdateSelection(
      oldSelStart: Int,
      oldSelEnd: Int,
      newSelStart: Int,
      newSelEnd: Int,
      candidatesStart: Int,
      candidatesEnd: Int,
  ) {
    super.onUpdateSelection(
        oldSelStart,
        oldSelEnd,
        newSelStart,
        newSelEnd,
        candidatesStart,
        candidatesEnd,
    )
    publishEditorContextBeforeCursor()
  }

  private fun publishEditorContextBeforeCursor(forced: String? = null) {
    if (KeyboardInputBridge.isGamePerformanceMode()) {
      return
    }
    if (KeyboardInputBridge.isFloatingKeyboardDragging()) {
      return
    }
    if (forced != null) {
      KeyboardInputBridge.notifyEditorContextBeforeCursor(forced)
      return
    }
    val before =
        currentInputConnection?.getTextBeforeCursor(200, 0)?.toString().orEmpty()
    KeyboardInputBridge.notifyEditorContextBeforeCursor(before)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val landscape = newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE
    KeyboardInputBridge.notifyOrientationChanged(landscape)
    floatingLeftPx = -1
    floatingTopPx = -1
    mainHandler.post {
      KeyboardInputBridge.syncFloatingKeyboardForOrientation()
      applyKeyboardSurfaceLayout()
      ensurePreviewOverlay()
      KeyboardInputBridge.notifyPreviewContainerChanged()
    }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (event != null && handleControllerKeyEvent(event)) {
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    if (event != null && handleControllerKeyEvent(event)) {
      return true
    }
    return super.onKeyUp(keyCode, event)
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
      keyboardResumedReact = true
      // MainActivity owns the shared React host while it is visible.
      if (
          host.lifecycleState != LifecycleState.RESUMED &&
              !KeyboardInputBridge.isMainAppInForeground()
      ) {
        host.onHostResume(null)
      }
      onResumed?.invoke()
    }
  }

  private fun pauseReactForKeyboardIfNeeded() {
    if (!keyboardResumedReact) {
      return
    }
    keyboardResumedReact = false
    // Never pause the shared React host while TypeBase is on screen — the IME and app
    // share one ReactHost and onHostPause here freezes the main app.
    if (KeyboardInputBridge.isMainAppInForeground()) {
      return
    }
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      app.reactHost?.onHostPause()
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

    if (keyboardView === view && (view.parent === frame || view.parent === floatingCardShell)) {
      if (floatingKeyboardEnabled) {
        ensureFloatingCardShell(frame)
      }
      ensurePreviewOverlay()
      return
    }

    (view.parent as? FrameLayout)?.removeView(view)
    (view as? ViewGroup)?.setMotionEventSplittingEnabled(true)
    view.isHapticFeedbackEnabled = true
    keyboardView = view
    frame.addView(view, createKeyboardLayoutParams(frame.width))
    if (floatingKeyboardEnabled) {
      ensureFloatingCardShell(frame)
    }
    frame.post {
      applyKeyboardSurfaceLayout()
      ensurePreviewOverlay()
    }
  }

  private var ensuringPreviewOverlay = false

  private fun ensurePreviewOverlay() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { ensurePreviewOverlay() }
      return
    }
    if (ensuringPreviewOverlay) {
      return
    }
    ensuringPreviewOverlay = true
    try {
      ensurePreviewOverlayOnMainThread()
    } finally {
      ensuringPreviewOverlay = false
    }
  }

  private fun ensurePreviewOverlayOnMainThread() {
    val frame = container ?: return
    val keyboard = keyboardView ?: return
    val parent: ViewGroup = floatingCardShell ?: frame

    var overlay = previewOverlay
    if (overlay == null) {
      overlay =
          FrameLayout(this).apply {
            clipChildren = false
            clipToPadding = false
            isClickable = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
          }
      previewOverlay = overlay
      val lp =
          if (parent === floatingCardShell) {
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
          } else {
            FrameLayout.LayoutParams(keyboard.width, keyboard.height)
          }
      parent.addView(overlay, lp)
      KeyboardInputBridge.notifyPreviewContainerChanged()
    } else if (overlay.parent !== parent) {
      (overlay.parent as? ViewGroup)?.removeView(overlay)
      val lp =
          if (parent === floatingCardShell) {
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
          } else {
            FrameLayout.LayoutParams(keyboard.width, keyboard.height)
          }
      parent.addView(overlay, lp)
      KeyboardInputBridge.notifyPreviewContainerChanged()
    }

    syncPreviewOverlayLayout()
  }

  /** Preview overlay frame without creating it — avoids re-entrancy from overlay managers. */
  fun peekPreviewOverlay(): FrameLayout? = previewOverlay

  private fun syncPreviewOverlayLayout() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { syncPreviewOverlayLayout() }
      return
    }
    val keyboard = keyboardView ?: return
    val overlay = previewOverlay ?: return
    if (floatingCardShell != null && overlay.parent === floatingCardShell) {
      val lp =
          (overlay.layoutParams as? FrameLayout.LayoutParams)
              ?: FrameLayout.LayoutParams(
                  FrameLayout.LayoutParams.MATCH_PARENT,
                  FrameLayout.LayoutParams.MATCH_PARENT,
              )
      lp.width = FrameLayout.LayoutParams.MATCH_PARENT
      lp.height = FrameLayout.LayoutParams.MATCH_PARENT
      lp.leftMargin = 0
      lp.topMargin = 0
      lp.gravity = Gravity.NO_GRAVITY
      overlay.layoutParams = lp
      overlay.bringToFront()
      return
    }
    val lp =
        (overlay.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(keyboard.width, keyboard.height)
    lp.width = keyboard.width
    lp.height = keyboard.height
    lp.leftMargin = keyboard.left
    lp.topMargin = keyboard.top
    lp.gravity = Gravity.NO_GRAVITY
    overlay.layoutParams = lp
    overlay.bringToFront()
    // Docked mode no longer calls super.onLayout(), so assign overlay bounds here.
    val overlayLeft = lp.leftMargin
    val overlayTop = lp.topMargin
    val overlayRight = overlayLeft + overlay.measuredWidth.coerceAtLeast(lp.width)
    val overlayBottom = overlayTop + overlay.measuredHeight.coerceAtLeast(lp.height)
    overlay.layout(overlayLeft, overlayTop, overlayRight, overlayBottom)
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
    UiThreadUtil.runOnUiThread { applyKeyboardSurfaceLayout() }
  }

  fun setFloatingKeyboardEnabled(enabled: Boolean) {
    if (floatingKeyboardEnabled == enabled) {
      return
    }
    floatingKeyboardEnabled = enabled
    floatingLeftPx = -1
    floatingTopPx = -1
    UiThreadUtil.runOnUiThread { applyKeyboardSurfaceLayout() }
  }

  fun setNativeKeyFastPathConfig(json: String) {
    try {
      val obj = org.json.JSONObject(json)
      KeyboardInputBridge.setKeyPreviewDoodleEnabled(
          obj.optBoolean(
              "previewDoodleEnabled",
              KeyboardInputBridge.isKeyPreviewDoodleEnabled(),
          ),
      )
    } catch (_: Exception) {
      // Fast-path config parse handles invalid JSON.
    }
    nativeKeyFastPath.updateConfig(json)
  }

  fun updateTouchIntelligenceContext(json: String) {
    nativeKeyFastPath.updateTouchIntelligenceContext(json)
  }

  fun setNativeZeroLatencyMode(enabled: Boolean) {
    nativeKeyFastPath.setZeroLatencyMode(enabled)
  }

  fun setNativeGamePerformanceMode(enabled: Boolean) {
    nativeKeyFastPath.setGamePerformanceMode(enabled)
  }

  fun clearNativeMidWordShiftBlock() {
    nativeKeyFastPath.clearMidWordShiftBlock()
  }

  fun updateNativeFastPathCaseState(
      shiftOn: Boolean,
      capsLocked: Boolean,
      uppercase: Boolean,
  ) {
    nativeKeyFastPath.updateCaseState(shiftOn, capsLocked, uppercase)
  }

  fun updateNativeFastPathPreviewChrome(
      previewPopup: Boolean,
      previewPressed: Boolean,
      previewDoodle: Boolean,
  ) {
    nativeKeyFastPath.updatePreviewChromeFlags(previewPopup, previewPressed, previewDoodle)
  }

  fun consumeNativeFastPathPointer(pointerId: Int): Boolean =
      nativeKeyFastPath.consumePointer(pointerId)

  fun pollNativeFastPathCommit(): NativeKeyFastPath.PendingJsCommit? =
      nativeKeyFastPath.pollPendingCommit()

  fun isNativeTypingCommitActive(): Boolean = nativeKeyFastPath.isTypingCommitActive()

  fun isCompactTypingSessionActive(): Boolean = nativeKeyFastPath.isCompactTyping()

  fun syncCompactTypingPrefix(prefix: String) {
    nativeKeyFastPath.syncLivePrefixFromJs(prefix)
  }

  fun rollbackNativeFastPathPointer(pointerId: Int): Boolean =
      nativeKeyFastPath.rollbackPointerCommit(pointerId)

  private fun keyboardHeightPx(heightDp: Int): Int =
      TypedValue.applyDimension(
              TypedValue.COMPLEX_UNIT_DIP,
              heightDp.toFloat(),
              resources.displayMetrics,
          )
          .toInt()

  private fun floatingRootHeightPx(keyboardHeightPx: Int, measuredHeightPx: Int = 0): Int {
    val screenHeight = resources.displayMetrics.heightPixels
    val landscape =
        resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    if (landscape) {
      // Avoid a ~full-screen IME layer in landscape; still leave room to drag vertically.
      val verticalTravel = dpToPx(LANDSCAPE_FLOATING_VERTICAL_TRAVEL_DP)
      val maxRoot = (screenHeight * LANDSCAPE_FLOATING_ROOT_MAX_FRACTION).toInt()
      return (keyboardHeightPx + verticalTravel)
          .coerceAtMost(maxRoot)
          .coerceAtLeast(keyboardHeightPx + dpToPx(FLOATING_VERTICAL_MARGIN_DP * 2))
    }
    val measured =
        measuredHeightPx.takeIf { it > keyboardHeightPx } ?: ((screenHeight * 0.88f).toInt())
    return measured.coerceAtMost(screenHeight).coerceAtLeast(
        keyboardHeightPx + dpToPx(FLOATING_VERTICAL_MARGIN_DP * 2),
    )
  }

  /** View that represents the floating card position (shell when enabled). */
  private fun floatingCard(): View? =
      if (floatingKeyboardEnabled) {
        floatingCardShell ?: keyboardView
      } else {
        keyboardView
      }

  private fun ensureFloatingCardShell(frame: FrameLayout) {
    if (!floatingKeyboardEnabled) {
      teardownFloatingCardShell(frame)
      return
    }
    val keyboard = keyboardView ?: return
    var shell = floatingCardShell
    if (shell == null) {
      shell =
          FrameLayout(this).apply {
            clipChildren = false
            clipToPadding = false
            setMotionEventSplittingEnabled(true)
            isHapticFeedbackEnabled = true
          }
      floatingCardShell = shell
      frame.addView(shell, createKeyboardLayoutParams(frame.width))
    } else {
      shell.layoutParams = createKeyboardLayoutParams(frame.width)
    }

    if (keyboard.parent !== shell) {
      (keyboard.parent as? ViewGroup)?.removeView(keyboard)
      shell.addView(
          keyboard,
          FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
          ),
      )
    }

    ensurePreviewOverlayOnMainThread()
    previewOverlay?.let { overlay ->
      if (overlay.parent !== shell) {
        (overlay.parent as? ViewGroup)?.removeView(overlay)
        shell.addView(
            overlay,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
      }
    }

    applyFloatingSurfaceChrome(shell)
  }

  private fun teardownFloatingCardShell(frame: FrameLayout) {
    val shell = floatingCardShell ?: return
    val keyboard = keyboardView
    val overlay = previewOverlay

    if (keyboard?.parent === shell) {
      shell.removeView(keyboard)
    }
    if (overlay?.parent === shell) {
      shell.removeView(overlay)
    }
    frame.removeView(shell)
    floatingCardShell = null

    if (keyboard != null && keyboard.parent !== frame) {
      frame.addView(keyboard, createKeyboardLayoutParams(frame.width))
    }
    if (overlay != null && keyboard != null && overlay.parent !== frame) {
      frame.addView(
          overlay,
          FrameLayout.LayoutParams(keyboard.width, keyboard.height),
      )
    }
    keyboard?.let { applyFloatingSurfaceChrome(it) }
    syncPreviewOverlayLayout()
  }

  private fun floatingKeyboardWidthPx(containerWidth: Int): Int {
    val availableWidth =
        if (containerWidth > 0) containerWidth else resources.displayMetrics.widthPixels
    val horizontalMargin = dpToPx(FLOATING_HORIZONTAL_MARGIN_DP * 2)
    val landscape =
        resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val maxWidth =
        dpToPx(
            if (landscape) FLOATING_LANDSCAPE_MAX_WIDTH_DP else FLOATING_MAX_WIDTH_DP,
        )
    val targetWidth = (availableWidth - horizontalMargin).coerceAtMost(maxWidth)
    val minWidth = dpToPx(if (landscape) 300 else 320)
    return targetWidth.coerceAtLeast(availableWidth.coerceAtMost(minWidth))
  }

  private fun createKeyboardLayoutParams(containerWidth: Int): FrameLayout.LayoutParams {
    val heightPx = keyboardHeightPx(keyboardHeightDp)
    if (!floatingKeyboardEnabled) {
      floatingLeftPx = -1
      floatingTopPx = -1
      return FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, heightPx).apply {
        gravity = Gravity.BOTTOM
      }
    }

    return FrameLayout.LayoutParams(floatingKeyboardWidthPx(containerWidth), heightPx).apply {
      gravity = Gravity.NO_GRAVITY
    }
  }

  private fun ensureFloatingPosition(frameWidth: Int, frameHeight: Int, childWidth: Int, childHeight: Int) {
    val margin = dpToPx(FLOATING_VERTICAL_MARGIN_DP)
    val landscape =
        resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    if (floatingLeftPx < 0 || floatingTopPx < 0) {
      if (landscape && restoreFloatingCardPosition(frameWidth, frameHeight, childWidth, childHeight)) {
        return
      }
      floatingLeftPx = ((frameWidth - childWidth) / 2).coerceAtLeast(0)
      floatingTopPx =
          if (landscape) {
            ((frameHeight - childHeight) / 2).coerceAtLeast(margin)
          } else {
            (frameHeight - childHeight - margin).coerceAtLeast(0)
          }
      return
    }
    floatingLeftPx = floatingLeftPx.coerceIn(0, (frameWidth - childWidth).coerceAtLeast(0))
    floatingTopPx = floatingTopPx.coerceIn(0, (frameHeight - childHeight).coerceAtLeast(0))
  }

  private fun restoreFloatingCardPosition(
      frameWidth: Int,
      frameHeight: Int,
      childWidth: Int,
      childHeight: Int,
  ): Boolean {
    val prefs =
        applicationContext.getSharedPreferences(FLOATING_POSITION_PREFS, MODE_PRIVATE)
    if (!prefs.contains(KEY_FLOATING_LEFT_FRAC)) {
      return false
    }
    val maxLeft = (frameWidth - childWidth).coerceAtLeast(0)
    val maxTop = (frameHeight - childHeight).coerceAtLeast(0)
    floatingLeftPx =
        (prefs.getFloat(KEY_FLOATING_LEFT_FRAC, 0.5f) * maxLeft).roundToInt().coerceIn(0, maxLeft)
    floatingTopPx =
        (prefs.getFloat(KEY_FLOATING_TOP_FRAC, 0.5f) * maxTop).roundToInt().coerceIn(0, maxTop)
    return true
  }

  private fun persistFloatingCardPosition(
      frameWidth: Int,
      frameHeight: Int,
      childWidth: Int,
      childHeight: Int,
  ) {
    val maxLeft = (frameWidth - childWidth).coerceAtLeast(1)
    val maxTop = (frameHeight - childHeight).coerceAtLeast(1)
    applicationContext
        .getSharedPreferences(FLOATING_POSITION_PREFS, MODE_PRIVATE)
        .edit()
        .putFloat(KEY_FLOATING_LEFT_FRAC, floatingLeftPx.toFloat() / maxLeft.toFloat())
        .putFloat(KEY_FLOATING_TOP_FRAC, floatingTopPx.toFloat() / maxTop.toFloat())
        .apply()
  }

  private fun scheduleFloatingDragTranslation(deltaX: Float, deltaY: Float) {
    pendingFloatingDragDeltaX = deltaX
    pendingFloatingDragDeltaY = deltaY
    if (floatingDragFramePosted) {
      return
    }
    floatingDragFramePosted = true
    Choreographer.getInstance().postFrameCallback(floatingDragFrameCallback)
  }

  private fun flushFloatingDragTranslation(deltaX: Float, deltaY: Float) {
    if (floatingDragFramePosted) {
      Choreographer.getInstance().removeFrameCallback(floatingDragFrameCallback)
      floatingDragFramePosted = false
    }
    applyFloatingDragTranslation(deltaX, deltaY)
  }

  /** Landscape uses a floating card when enabled in settings; portrait stays docked. */
  private fun syncFloatingModeForOrientation() {
    KeyboardInputBridge.syncFloatingKeyboardForOrientation()
  }

  private fun applyKeyboardSurfaceLayout() {
    syncFloatingModeForOrientation()
    val frame = container
    val view = keyboardView
    if (view == null || frame == null) {
      return
    }
    if (floatingKeyboardEnabled) {
      ensureFloatingCardShell(frame)
    } else {
      teardownFloatingCardShell(frame)
      view.layoutParams = createKeyboardLayoutParams(frame.width)
      applyFloatingSurfaceChrome(view)
    }
    frame.requestLayout()
    frame.invalidate()
    updateInputViewShown()
    ensurePreviewOverlay()
  }

  private fun applyFloatingSurfaceChrome(view: View) {
    if (floatingKeyboardEnabled) {
      view.outlineProvider = floatingKeyboardOutlineProvider
      // clipToOutline cuts off the bottom row at rounded corners; RN handles insets.
      view.clipToOutline = false
      view.elevation = dpToPx(FLOATING_ELEVATION_DP).toFloat()
      syncImeCaptionBarVisibility()
      return
    }
    view.clipToOutline = false
    view.elevation = 0f
    view.outlineProvider = ViewOutlineProvider.BACKGROUND
    syncImeCaptionBarVisibility()
  }

  /**
   * Hides the system "IME caption bar" (globe + dismiss) when floating so it does not sit
   * under the keyboard card. On API 36+ the IME may need a custom switcher if the system asks.
   */
  private fun syncImeCaptionBarVisibility() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return
    }
    val decorView = window?.window?.decorView ?: return
    val controller = decorView.windowInsetsController ?: return
    if (floatingKeyboardEnabled) {
      controller.hide(WindowInsets.Type.captionBar())
    } else {
      controller.show(WindowInsets.Type.captionBar())
    }
  }

  override fun onComputeInsets(outInsets: Insets) {
    super.onComputeInsets(outInsets)
    if (!floatingKeyboardEnabled) {
      return
    }

    val frame = container ?: return
    val view = floatingCard() ?: return
    val tx = view.translationX.toInt()
    val ty = view.translationY.toInt()
    val left = (view.left + tx).coerceAtLeast(0)
    val top = (view.top + ty).coerceAtLeast(0)
    val right = (view.right + tx).coerceAtMost(frame.width)
    val bottom = (view.bottom + ty).coerceAtMost(frame.height)
    if (right <= left || bottom <= top) {
      return
    }

    floatingTouchableRect.set(left, top, right, bottom)
    outInsets.touchableInsets = Insets.TOUCHABLE_INSETS_REGION
    outInsets.touchableRegion.set(floatingTouchableRect)
    outInsets.contentTopInsets = top
    outInsets.visibleTopInsets = top
  }

  /** Commit layout after a translation-only drag (single inset update). */
  private fun commitFloatingDragPosition() {
    val frame = container ?: return
    val view = floatingCard() ?: return

    val maxLeft = (frame.width - view.width).coerceAtLeast(0)
    val maxTop = (frame.height - view.height).coerceAtLeast(0)
    floatingLeftPx = floatingLeftPx.coerceIn(0, maxLeft)
    floatingTopPx = floatingTopPx.coerceIn(0, maxTop)

    view.translationX = 0f
    view.translationY = 0f
    endFloatingDragLayers()

    val childLeft = floatingLeftPx
    val childTop = floatingTopPx
    view.layout(
        childLeft,
        childTop,
        childLeft + view.measuredWidth,
        childTop + view.measuredHeight,
    )
    if (floatingCardShell == null) {
      syncPreviewOverlayLayout()
    }
    persistFloatingCardPosition(
        frame.width,
        frame.height,
        view.measuredWidth,
        view.measuredHeight,
    )
    updateInputViewShown()
  }

  /** Move floating keyboard visually during drag — no layout or inset churn. */
  private fun applyFloatingDragTranslation(deltaX: Float, deltaY: Float) {
    val frame = container ?: return
    val view = floatingCard() ?: return
    val maxLeft = (frame.width - view.width).coerceAtLeast(0)
    val maxTop = (frame.height - view.height).coerceAtLeast(0)
    val minTx = -floatingDragStartLeft.toFloat()
    val maxTx = (maxLeft - floatingDragStartLeft).toFloat()
    val minTy = -floatingDragStartTop.toFloat()
    val maxTy = (maxTop - floatingDragStartTop).toFloat()
    val tx = deltaX.coerceIn(minTx, maxTx)
    val ty = deltaY.coerceIn(minTy, maxTy)
    view.translationX = tx
    view.translationY = ty
    floatingLeftPx = floatingDragStartLeft + tx.roundToInt()
    floatingTopPx = floatingDragStartTop + ty.roundToInt()
  }

  private fun beginFloatingDragLayers() {
    KeyboardInputBridge.setFloatingKeyboardDragging(true)
    val card = floatingCard() ?: return
    previewOverlay?.visibility = View.GONE
    keyboardView?.isEnabled = false
    keyboardView?.setLayerType(View.LAYER_TYPE_NONE, null)
    previewOverlay?.setLayerType(View.LAYER_TYPE_NONE, null)
    card.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      card.setHasTransientState(true)
    }
    card.elevation = 0f
    card.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
  }

  private fun endFloatingDragLayers() {
    KeyboardInputBridge.setFloatingKeyboardDragging(false)
    val card = floatingCard() ?: return
    previewOverlay?.visibility = View.VISIBLE
    keyboardView?.isEnabled = true
    card.setLayerType(View.LAYER_TYPE_NONE, null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      card.setHasTransientState(false)
    }
    card.elevation = dpToPx(FLOATING_ELEVATION_DP).toFloat()
  }

  private fun isControllerSource(source: Int): Boolean =
      (source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
          (source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
          (source and InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD

  private fun isControllerKeyCode(keyCode: Int): Boolean =
      keyCode == KeyEvent.KEYCODE_DPAD_UP ||
          keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
          keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
          keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
          keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
          (keyCode >= KeyEvent.KEYCODE_BUTTON_A && keyCode <= KeyEvent.KEYCODE_BUTTON_MODE) ||
          keyCode == KeyEvent.KEYCODE_BUTTON_THUMBL ||
          keyCode == KeyEvent.KEYCODE_BUTTON_THUMBR

  private fun hasConnectedController(): Boolean =
      InputDevice.getDeviceIds().any { id ->
        val device = InputDevice.getDevice(id) ?: return@any false
        isControllerSource(device.sources)
      }

  private fun updateControllerConnectionState(forceConnected: Boolean? = null) {
    val connected = forceConnected ?: hasConnectedController()
    if (forceConnected == true && connected) {
      KeyboardInputBridge.notifyControllerConnection(true)
      controllerConnected = true
      return
    }
    if (controllerConnected == connected) {
      return
    }
    controllerConnected = connected
    KeyboardInputBridge.notifyControllerConnection(connected)
  }

  private fun keyNameForController(keyCode: Int): String =
      when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> "dpad_up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "dpad_down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "dpad_left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "dpad_right"
        KeyEvent.KEYCODE_DPAD_CENTER -> "dpad_center"
        KeyEvent.KEYCODE_BUTTON_A -> "button_a"
        KeyEvent.KEYCODE_BUTTON_B -> "button_b"
        KeyEvent.KEYCODE_BUTTON_X -> "button_x"
        KeyEvent.KEYCODE_BUTTON_Y -> "button_y"
        KeyEvent.KEYCODE_BUTTON_L1 -> "button_l1"
        KeyEvent.KEYCODE_BUTTON_R1 -> "button_r1"
        KeyEvent.KEYCODE_BUTTON_L2 -> "button_l2"
        KeyEvent.KEYCODE_BUTTON_R2 -> "button_r2"
        KeyEvent.KEYCODE_BUTTON_THUMBL -> "button_thumb_l"
        KeyEvent.KEYCODE_BUTTON_THUMBR -> "button_thumb_r"
        KeyEvent.KEYCODE_BUTTON_START -> "button_start"
        KeyEvent.KEYCODE_BUTTON_SELECT -> "button_select"
        KeyEvent.KEYCODE_BUTTON_MODE -> "button_mode"
        else -> "key_$keyCode"
      }

  private fun handleControllerKeyEvent(event: KeyEvent): Boolean {
    if (!isControllerSource(event.source) && !isControllerKeyCode(event.keyCode)) {
      return false
    }
    updateControllerConnectionState(true)
    val action =
        when (event.action) {
          KeyEvent.ACTION_DOWN -> "down"
          KeyEvent.ACTION_UP -> "up"
          else -> return true
        }
    val name = keyNameForController(event.keyCode)
    KeyboardInputBridge.notifyControllerInput(
        """{"kind":"key","action":"$action","keyCode":${event.keyCode},"key":"$name"}""",
    )
    return true
  }

  private fun emitControllerAxis(direction: String): Boolean {
    val now = android.os.SystemClock.uptimeMillis()
    if (lastControllerDirection == direction && now - lastControllerDirectionAt < 180L) {
      return true
    }
    lastControllerDirection = direction
    lastControllerDirectionAt = now
    updateControllerConnectionState(true)
    KeyboardInputBridge.notifyControllerInput(
        """{"kind":"axis","direction":"$direction"}""",
    )
    return true
  }

  private fun handleControllerMotionEvent(event: MotionEvent): Boolean {
    if (!isControllerSource(event.source)) {
      return false
    }
    if (event.action != MotionEvent.ACTION_MOVE) {
      updateControllerConnectionState(true)
      return true
    }

    val x = event.getAxisValue(MotionEvent.AXIS_HAT_X)
        .takeIf { kotlin.math.abs(it) > 0.35f }
        ?: event.getAxisValue(MotionEvent.AXIS_X)
    val y = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
        .takeIf { kotlin.math.abs(it) > 0.35f }
        ?: event.getAxisValue(MotionEvent.AXIS_Y)
    val absX = kotlin.math.abs(x)
    val absY = kotlin.math.abs(y)
    val threshold = 0.55f

    if (absX < threshold && absY < threshold) {
      lastControllerDirection = null
      updateControllerConnectionState(true)
      return true
    }

    return if (absX > absY) {
      emitControllerAxis(if (x > 0) "right" else "left")
    } else {
      emitControllerAxis(if (y > 0) "down" else "up")
    }
  }

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
    if (floatingDragFramePosted) {
      Choreographer.getInstance().removeFrameCallback(floatingDragFrameCallback)
      floatingDragFramePosted = false
    }
    val app = application as? ReactApplication
    app?.reactHost?.removeReactInstanceEventListener(reactInstanceListener)
    pauseReactForKeyboardIfNeeded()
    keyboardView?.let { view -> (view.parent as? ViewGroup)?.removeView(view) }
    keyboardView = null
    previewOverlay = null
    floatingCardShell = null
    container = null
    nativeKeyFastPath.clear()
    inputManager?.unregisterInputDeviceListener(this)
    inputManager = null
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

  override fun onInputDeviceAdded(deviceId: Int) {
    updateControllerConnectionState()
  }

  override fun onInputDeviceRemoved(deviceId: Int) {
    updateControllerConnectionState()
  }

  override fun onInputDeviceChanged(deviceId: Int) {
    updateControllerConnectionState()
  }

  companion object {
    const val KEYBOARD_COMPONENT_NAME = "TypeBaseKeyboard"
    const val DEFAULT_KEYBOARD_HEIGHT_DP = 340
    private const val MIN_KEYBOARD_HEIGHT_DP = 200
    private const val MAX_SURFACE_MOUNT_ATTEMPTS = 120
    private const val FLOATING_HORIZONTAL_MARGIN_DP = 18
    private const val FLOATING_VERTICAL_MARGIN_DP = 18
    private const val FLOATING_MAX_WIDTH_DP = 720
    /** Portrait-like card width in landscape (not full strip). */
    private const val FLOATING_LANDSCAPE_MAX_WIDTH_DP = 480
    private const val FLOATING_DRAG_HANDLE_HEIGHT_DP = 46
    private const val FLOATING_CORNER_RADIUS_DP = 18
    private const val FLOATING_ELEVATION_DP = 10
    /** Lighter shadow while dragging (less GPU work per frame). */
    private const val FLOATING_DRAG_ELEVATION_DP = 4
    private const val LANDSCAPE_FLOATING_VERTICAL_TRAVEL_DP = 140
    private const val LANDSCAPE_FLOATING_ROOT_MAX_FRACTION = 0.52f
    private const val FLOATING_POSITION_PREFS = "typebase_floating_keyboard"
    private const val KEY_FLOATING_LEFT_FRAC = "landscape_left_frac"
    private const val KEY_FLOATING_TOP_FRAC = "landscape_top_frac"
  }

  private inner class KeyboardFrameLayout : FrameLayout(this@TypeBaseInputService) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
      val width = MeasureSpec.getSize(widthMeasureSpec)
      val keyboardHeightPx = keyboardHeightPx(keyboardHeightDp)

      if (!floatingKeyboardEnabled) {
        keyboardView?.measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(keyboardHeightPx, MeasureSpec.EXACTLY),
        )
        previewOverlay?.measure(
            MeasureSpec.makeMeasureSpec(keyboardView?.measuredWidth ?: width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(
                keyboardView?.measuredHeight ?: keyboardHeightPx,
                MeasureSpec.EXACTLY,
            ),
        )
        setMeasuredDimension(width, keyboardHeightPx)
        return
      }

      val rootHeight = floatingRootHeightPx(keyboardHeightPx, MeasureSpec.getSize(heightMeasureSpec))
      val childWidth = floatingKeyboardWidthPx(width)
      val shell = floatingCardShell
      if (shell != null) {
        shell.measure(
            MeasureSpec.makeMeasureSpec(childWidth, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(keyboardHeightPx, MeasureSpec.EXACTLY),
        )
      } else {
        keyboardView?.measure(
            MeasureSpec.makeMeasureSpec(childWidth, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(keyboardHeightPx, MeasureSpec.EXACTLY),
        )
      }
      setMeasuredDimension(width, rootHeight)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
      if (!floatingKeyboardEnabled) {
        val view = keyboardView
        if (view != null) {
          view.layout(0, 0, view.measuredWidth, view.measuredHeight)
        }
        syncPreviewOverlayLayout()
        return
      }

      val card = floatingCard() ?: return
      val childWidth = card.measuredWidth
      val childHeight = card.measuredHeight
      ensureFloatingPosition(width, height, childWidth, childHeight)
      val childLeft = floatingLeftPx
      val childTop = floatingTopPx
      card.layout(childLeft, childTop, childLeft + childWidth, childTop + childHeight)
      if (floatingCardShell == null) {
        syncPreviewOverlayLayout()
      }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      if (handleControllerKeyEvent(event)) {
        return true
      }
      return super.dispatchKeyEvent(event)
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
      if (handleControllerMotionEvent(event)) {
        return true
      }
      return super.dispatchGenericMotionEvent(event)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (handleControllerMotionEvent(event)) {
        return true
      }
      if (handleFloatingKeyboardDrag(event)) {
        return true
      }
      if (floatingDragActive) {
        return true
      }

      // Commit text first, then haptic — never stall InputConnection behind the vibrator.
      val blockReactDispatch = nativeKeyFastPath.onTouchEvent(event)

      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN,
        MotionEvent.ACTION_POINTER_DOWN -> {
          if (KeyboardInputBridge.isKeyPreviewDoodleEnabled()) {
            val index = event.actionIndex
            KeyboardInputBridge.showKeyDoodleAtScreen(
                event.getRawX(index),
                event.getRawY(index),
            )
          }
        }
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_POINTER_UP -> {
          KeyboardInputBridge.releaseHapticPointer(event.getPointerId(event.actionIndex))
        }
        MotionEvent.ACTION_CANCEL -> {
          KeyboardInputBridge.clearAllHapticPointers()
        }
      }

      if (blockReactDispatch) {
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

    private fun isFloatingDragHandle(event: MotionEvent): Boolean {
      if (!floatingKeyboardEnabled) {
        return false
      }
      val view = floatingCard() ?: return false
      val tx = view.translationX.toInt()
      val ty = view.translationY.toInt()
      val x = event.x.toInt()
      val y = event.y.toInt()
      val handleHeight = dpToPx(FLOATING_DRAG_HANDLE_HEIGHT_DP)
      val inset = dpToPx(6)
      val visLeft = view.left + tx
      val visTop = view.top + ty
      val handleLeft = visLeft + inset
      val handleRight = view.right + tx - inset
      val topHandleBottom = visTop + handleHeight
      return x in handleLeft..handleRight && y in visTop..topHandleBottom
    }

    private fun handleFloatingKeyboardDrag(event: MotionEvent): Boolean {
      if (!floatingKeyboardEnabled) {
        floatingDragActive = false
        return false
      }

      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          if (!isFloatingDragHandle(event)) {
            floatingDragActive = false
            return false
          }
          floatingDragActive = true
          floatingDragStartX = event.x
          floatingDragStartY = event.y
          floatingDragStartLeft = floatingLeftPx
          floatingDragStartTop = floatingTopPx
          beginFloatingDragLayers()
          parent?.requestDisallowInterceptTouchEvent(true)
          return true
        }
        MotionEvent.ACTION_MOVE -> {
          if (!floatingDragActive) {
            return false
          }
          val deltaX = event.x - floatingDragStartX
          val deltaY = event.y - floatingDragStartY
          scheduleFloatingDragTranslation(deltaX, deltaY)
          return true
        }
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> {
          if (!floatingDragActive) {
            return false
          }
          val deltaX = event.x - floatingDragStartX
          val deltaY = event.y - floatingDragStartY
          flushFloatingDragTranslation(deltaX, deltaY)
          floatingDragActive = false
          commitFloatingDragPosition()
          return true
        }
      }
      return floatingDragActive
    }
  }
}
