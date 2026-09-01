package com.typebase.app

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.text.InputType
import android.text.TextUtils
import java.util.concurrent.CopyOnWriteArrayList
import org.json.JSONObject

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  /** Google app search bar: always show submit enter, never newline. */
  private const val GOOGLE_QUICK_SEARCH_BOX = "com.google.android.googlequicksearchbox"

  private val RICH_TEXT_EDITOR_PACKAGES =
      setOf(
          "com.google.android.apps.docs",
          "com.google.android.apps.docs.editors.docs",
          "com.google.android.apps.docs.editors.sheets",
          "com.google.android.apps.docs.editors.slides",
          "com.google.android.keep",
          "com.microsoft.office.word",
          "com.samsung.android.app.notes",
          "com.example.android.notepad",
      )

  @Volatile
  private var numpadPreferred: Boolean = false

  @Volatile
  private var supportsNewline: Boolean = false

  @Volatile
  private var keyHapticEnabled: Boolean = true
  @Volatile private var keyHapticPulseMs: Int = 12

  @Volatile
  private var currentEditorInfo: EditorInfo? = null

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardVisibilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardSessionStartListeners = CopyOnWriteArrayList<() -> Unit>()
  private val editorContextListeners = CopyOnWriteArrayList<(String) -> Unit>()
  private val orientationChangeListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val supportsNewlineListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val initialCapsModeListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val nativeFastPathKeyListeners =
      CopyOnWriteArrayList<(String, String, String, String, Boolean) -> Unit>()
  private val touchIntelligenceHitListeners =
      CopyOnWriteArrayList<(TouchIntelligence.HitAnalysis) -> Unit>()
  private val nativeSuggestionsListeners =
      CopyOnWriteArrayList<(NativeSuggestionBarEngine.Snapshot) -> Unit>()
  private var showKeyPreviewFn: ((Int, String) -> Unit)? = null
  private var hideKeyPreviewFn: ((Int) -> Unit)? = null
  private val previewContainerChangedListeners = CopyOnWriteArrayList<() -> Unit>()
  private val controllerInputListeners = CopyOnWriteArrayList<(String) -> Unit>()
  private val controllerConnectionListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

  @Volatile
  private var controllerConnected: Boolean = false

  @Volatile
  private var initialCapsMode: Boolean = false

  @Volatile
  private var gamePerformanceMode: Boolean = false

  /** True while MainActivity is in the foreground (shared React host must stay alive for the app). */
  @Volatile
  private var mainAppInForeground: Boolean = false

  fun setMainAppInForeground(inForeground: Boolean) {
    mainAppInForeground = inForeground
  }

  fun isMainAppInForeground(): Boolean = mainAppInForeground

  fun prefersNumpad(): Boolean = numpadPreferred

  fun currentInputSupportsNewline(): Boolean = supportsNewline

  fun shouldPreferDeleteKeyEvent(): Boolean {
    if (supportsNewline) {
      return true
    }
    val packageName = currentEditorInfo?.packageName ?: return false
    return RICH_TEXT_EDITOR_PACKAGES.any { packageName.startsWith(it) }
  }

  fun shouldForceSubmitEnter(): Boolean =
      currentEditorInfo?.packageName == GOOGLE_QUICK_SEARCH_BOX

  fun setCurrentEditorInfo(info: EditorInfo?) {
    currentEditorInfo = info
    refreshInitialCapsMode(info)
  }

  fun getCurrentEditorPackage(): String? = currentEditorInfo?.packageName

  fun isCurrentEditorGame(context: Context): Boolean {
    val packageName = getCurrentEditorPackage() ?: return false
    if (packageName == context.packageName) {
      return false
    }
    return try {
      val info = context.packageManager.getApplicationInfo(packageName, 0)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          info.category == android.content.pm.ApplicationInfo.CATEGORY_GAME) {
        true
      } else {
        isLikelyGamePackageName(packageName)
      }
    } catch (_: Exception) {
      isLikelyGamePackageName(packageName)
    }
  }

  private fun isLikelyGamePackageName(packageName: String): Boolean {
    val lower = packageName.lowercase()
    val markers =
        listOf(
            "com.tencent.",
            "com.activision.",
            "com.gameloft.",
            "com.supercell.",
            "com.mojang.",
            "com.epicgames.",
            "com.riotgames.",
            "com.pubg.",
            "com.dts.freefire",
            "com.king.",
            "com.roblox.",
            "com.mobile.legends",
            "com.miHoYo.",
            "com.ea.game",
            "com.garena.",
            "com.netease.",
            "com.vng.",
            "com.playrix.",
            "com.innersloth.",
            "com.nianticlabs.",
        )
    return markers.any { lower.startsWith(it) } ||
        lower.contains(".game.") ||
        lower.endsWith(".game")
  }

  fun getInitialCapsMode(): Boolean = initialCapsMode

  fun refreshInitialCapsMode(info: EditorInfo?) {
    val mode = shouldCapitalizeInitial(info)
    if (initialCapsMode != mode) {
      initialCapsMode = mode
      notifyInitialCapsModeListeners(mode)
    }
  }

  fun shouldCapitalizeInitial(info: EditorInfo?): Boolean {
    if (info == null) {
      return false
    }
    val inputType = info.inputType
    val inputClass = inputType and InputType.TYPE_MASK_CLASS
    if (inputClass != InputType.TYPE_CLASS_TEXT) {
      return false
    }

    val textFlags = inputType and InputType.TYPE_MASK_FLAGS
    if ((textFlags and InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0 ||
        (textFlags and InputType.TYPE_TEXT_FLAG_CAP_WORDS) != 0) {
      return true
    }

    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return when (variation) {
      InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
      InputType.TYPE_TEXT_VARIATION_EMAIL_SUBJECT,
      InputType.TYPE_TEXT_VARIATION_URI,
      InputType.TYPE_TEXT_VARIATION_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_FILTER -> false
      else -> true
    }
  }

  /** Whether the next typed letter should be capitalized at the current cursor. */
  fun shouldAutoCapitalizeAtCursor(): Boolean {
    val info = currentEditorInfo ?: return false
    if (!shouldCapitalizeInitial(info)) {
      return false
    }
    val connection = getInputConnection() ?: return false

    val textFlags = info.inputType and InputType.TYPE_MASK_FLAGS
    var mode = 0
    if ((textFlags and InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS) != 0) {
      mode = mode or TextUtils.CAP_MODE_CHARACTERS
    }
    if ((textFlags and InputType.TYPE_TEXT_FLAG_CAP_WORDS) != 0) {
      mode = mode or TextUtils.CAP_MODE_WORDS
    }
    if ((textFlags and InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0) {
      mode = mode or TextUtils.CAP_MODE_SENTENCES
    }
    if (mode == 0) {
      mode = TextUtils.CAP_MODE_SENTENCES
    }

    val before = connection.getTextBeforeCursor(200, 0)?.toString().orEmpty()
    if (before.isNotEmpty()) {
      val last = before[before.length - 1]
      if (last.isLetter()) {
        return false
      }
    }
    return TextUtils.getCapsMode(before, before.length, mode) != 0
  }

  private fun notifyInitialCapsModeListeners(mode: Boolean) {
    initialCapsModeListeners.forEach { listener -> listener(mode) }
  }

  fun addInitialCapsModeListener(listener: (Boolean) -> Unit): () -> Unit {
    initialCapsModeListeners.add(listener)
    listener(initialCapsMode)
    return { initialCapsModeListeners.remove(listener) }
  }

  fun performEnterAction(connection: InputConnection): Boolean {
    val actionId =
        currentEditorInfo?.let { it.imeOptions and EditorInfo.IME_MASK_ACTION }
            ?: EditorInfo.IME_ACTION_UNSPECIFIED

    // For unspecified / none, just emit a raw enter key event. This lets the target
    // app decide (some use raw enter for send or newline in their own logic).
    if (actionId == EditorInfo.IME_ACTION_NONE || actionId == EditorInfo.IME_ACTION_UNSPECIFIED) {
      connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
      connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
      return true
    }

    return connection.performEditorAction(actionId)
  }

  fun getInputConnection(): InputConnection? = inputService?.currentInputConnection

  fun requestHideSelf() {
    inputService?.requestHideSelf(0)
  }

  fun setKeyboardHeightDp(heightDp: Int) {
    inputService?.setKeyboardHeightDp(heightDp)
  }

  fun setFloatingKeyboard(enabled: Boolean) {
    inputService?.setFloatingKeyboardEnabled(enabled)
  }

  fun setNativeKeyFastPathConfig(json: String) {
    inputService?.setNativeKeyFastPathConfig(json)
  }

  fun updateTouchIntelligenceContext(json: String) {
    inputService?.updateTouchIntelligenceContext(json)
  }

  fun setNativeZeroLatencyMode(enabled: Boolean) {
    inputService?.setNativeZeroLatencyMode(enabled)
  }

  fun setGamePerformanceMode(enabled: Boolean) {
    gamePerformanceMode = enabled
  }

  fun isGamePerformanceMode(): Boolean = gamePerformanceMode

  fun clearNativeMidWordShiftBlock() {
    inputService?.clearNativeMidWordShiftBlock()
  }

  fun updateNativeFastPathCaseState(
      shiftOn: Boolean,
      capsLocked: Boolean,
      uppercase: Boolean,
  ) {
    inputService?.updateNativeFastPathCaseState(shiftOn, capsLocked, uppercase)
  }

  fun isKeyHapticEnabled(): Boolean = keyHapticEnabled

  fun syncLayoutSettings(json: String) {
    try {
      val layout = JSONObject(json)
      keyHapticEnabled = layout.optBoolean("keyHapticEnabled", true)
      keyHapticPulseMs = layout.optInt("keyHapticPulseMs", 12).coerceIn(6, 24)
    } catch (_: Exception) {
      keyHapticEnabled = true
      keyHapticPulseMs = 12
    }
    setFloatingKeyboard(false)
  }

  /** Cached for vibrator fallback only (no view attached). */
  @Volatile
  private var vibrator: Vibrator? = null

  /** Pointers that already received IME-level haptic on ACTION_DOWN. */
  private val hapticHandledPointers = mutableSetOf<Int>()

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile private var pendingEditorContextBeforeCursor: String? = null

  private val emitEditorContextRunnable =
      Runnable {
        val context = pendingEditorContextBeforeCursor ?: return@Runnable
        pendingEditorContextBeforeCursor = null
        editorContextListeners.forEach { listener -> listener(context) }
      }

  @Volatile
  private var lastHapticMs = 0L

  @Volatile
  private var lastPointerHapticMs = 0L

  /** Gaps below this use the snappier KEYBOARD_TAP primitive (Gboard-style bursts). */
  private const val FAST_TYPING_GAP_MS = 95L

  /** Collapse duplicate JS haptics in the same frame only — never throttle touch-down pulses. */
  private const val JS_HAPTIC_DEBOUNCE_MS = 8L

  /**
   * IME touch-down haptic — synchronous on ACTION_DOWN before React. Never debounced.
   * Always use the light KEYBOARD_TAP pulse (Gboard-style) — heavy KEYBOARD_PRESS
   * feels stiff at normal typing speeds (>95ms between keys).
   */
  fun performKeyHapticForPointer(pointerId: Int) {
    val now = SystemClock.uptimeMillis()
    if (keyHapticEnabled) {
      fireConfiguredKeyHapticPulse()
      lastHapticMs = now
      lastPointerHapticMs = now
    }
    synchronized(hapticHandledPointers) { hapticHandledPointers.add(pointerId) }
  }

  /** Softer touch-down haptic for zero-latency mode. Never debounced. */
  fun performLightKeyHapticForPointer(pointerId: Int) {
    if (keyHapticEnabled) {
      val lightMs = (keyHapticPulseMs - 4).coerceAtLeast(6).toLong()
      pulseVibrator(lightMs, hapticAmplitudeForPulseMs(keyHapticPulseMs - 4))
      val now = SystemClock.uptimeMillis()
      lastHapticMs = now
      lastPointerHapticMs = now
    }
    synchronized(hapticHandledPointers) { hapticHandledPointers.add(pointerId) }
  }

  fun playKeyTapSound() {
    scheduleTapSound()
  }

  fun releaseHapticPointer(pointerId: Int) {
    synchronized(hapticHandledPointers) { hapticHandledPointers.remove(pointerId) }
  }

  fun clearAllHapticPointers() {
    synchronized(hapticHandledPointers) { hapticHandledPointers.clear() }
  }

  fun consumeNativeHapticPointer(pointerId: Int): Boolean {
    synchronized(hapticHandledPointers) { return hapticHandledPointers.remove(pointerId) }
  }

  /**
   * Haptic from JS/UI (modifiers, space JS path, suggestion bar, etc.).
   * Skips when the IME already pulsed for this pointer or very recently.
   */
  fun performKeyHaptic() {
    val now = SystemClock.uptimeMillis()
    if (now - lastHapticMs < JS_HAPTIC_DEBOUNCE_MS) {
      return
    }
    lastHapticMs = now
    lastPointerHapticMs = now

    if (!keyHapticEnabled) {
      scheduleTapSound()
      return
    }
    fireConfiguredKeyHapticPulse()
    scheduleTapSound()
  }

  /** JS-only light haptic (zero-latency mode). No tap sound. */
  fun performLightKeyHaptic() {
    val now = SystemClock.uptimeMillis()
    if (now - lastHapticMs < JS_HAPTIC_DEBOUNCE_MS) {
      return
    }
    lastHapticMs = now

    if (!keyHapticEnabled) {
      return
    }
    val lightMs = (keyHapticPulseMs - 4).coerceAtLeast(6).toLong()
    pulseVibrator(lightMs, hapticAmplitudeForPulseMs(keyHapticPulseMs - 4))
  }

  /**
   * Use the device haptic engine (key-press / heavy-click primitives), not a raw
   * vibrator waveform buzz. Prefer View.performHapticFeedback(KEYBOARD_PRESS).
   */
  private fun fireHapticPulse() {
    val view = inputService?.keyboardViewForFeedback
    if (view != null) {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        performViewKeyPressHaptic(view)
      } else {
        mainHandler.post { performViewKeyPressHaptic(view) }
      }
      return
    }
    // No IME view yet — fall back to predefined haptic-engine effects.
    hapticEngineClickFallback()
  }

  private fun fireLightHapticPulse() {
    val view = inputService?.keyboardViewForFeedback
    if (view != null) {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        performViewLightKeyHaptic(view)
      } else {
        mainHandler.post { performViewLightKeyHaptic(view) }
      }
      return
    }
    lightHapticEngineFallback()
  }

  /** Snappier per-key pulse for fast bursts — still fires on every key, never skipped. */
  private fun fireConfiguredKeyHapticPulse() {
    val durationMs = keyHapticPulseMs.toLong()
    val view = inputService?.keyboardViewForFeedback
    if (view != null && durationMs <= 10) {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        performViewFastKeyHaptic(view)
      } else {
        mainHandler.post { performViewFastKeyHaptic(view) }
      }
      return
    }
    pulseVibrator(durationMs, hapticAmplitudeForPulseMs(keyHapticPulseMs))
  }

  private fun hapticAmplitudeForPulseMs(ms: Int): Int {
    return ((ms - 6) * 9 + 44).coerceIn(44, 200)
  }

  private fun pulseVibrator(durationMs: Long, amplitude: Int) {
    val ctx = inputService?.applicationContext ?: return
    val vib =
        vibrator
            ?: (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.also { vibrator = it }
            ?: return
    if (!vib.hasVibrator()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(
          VibrationEffect.createOneShot(
              durationMs.coerceIn(6L, 24L),
              amplitude.coerceIn(1, 255),
          ),
      )
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(durationMs.coerceIn(6L, 24L))
    }
  }

  private fun fireFastTypingHapticPulse() {
    val view = inputService?.keyboardViewForFeedback
    if (view != null) {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        performViewFastKeyHaptic(view)
      } else {
        mainHandler.post { performViewFastKeyHaptic(view) }
      }
      return
    }
    fastTypingHapticEngineFallback()
  }

  private fun performViewKeyPressHaptic(view: View) {
    val flags =
        HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING or
            HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
    val ok =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          // Virtual keyboard key-press primitive (haptic engine, not a buzz).
          view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_PRESS, flags)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP, flags)
        } else {
          @Suppress("DEPRECATION")
          view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY, flags)
        }
    if (!ok) {
      hapticEngineClickFallback()
    }
  }

  private fun performViewLightKeyHaptic(view: View) {
    val flags =
        HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING or
            HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
    @Suppress("DEPRECATION")
    val ok = view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK, flags)
    if (!ok) {
      lightHapticEngineFallback()
    }
  }

  private fun performViewFastKeyHaptic(view: View) {
    val flags =
        HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING or
            HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
    val ok =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP, flags)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_PRESS, flags)
        } else {
          @Suppress("DEPRECATION")
          view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY, flags)
        }
    if (!ok) {
      fastTypingHapticEngineFallback()
    }
  }

  private fun lightHapticEngineFallback() {
    val ctx = inputService?.applicationContext ?: return
    val vib =
        vibrator
            ?: (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.also { vibrator = it }
            ?: return
    if (!vib.hasVibrator()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createOneShot(8L, 48))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(8L)
    }
  }

  private fun fastTypingHapticEngineFallback() {
    val ctx = inputService?.applicationContext ?: return
    val vib =
        vibrator
            ?: (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.also { vibrator = it }
            ?: return
    if (!vib.hasVibrator()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createOneShot(12L, 72))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(12L)
    }
  }

  private fun hapticEngineClickFallback() {
    val ctx = inputService?.applicationContext ?: return
    val vib =
        vibrator
            ?: (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.also { vibrator = it }
            ?: return
    if (!vib.hasVibrator()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Predefined effects still go through the haptic engine (press/click), not waveforms.
      vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createOneShot(20L, VibrationEffect.DEFAULT_AMPLITUDE))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(20L)
    }
  }

  private fun scheduleTapSound() {
    if (!KeyTapSoundPlayer.isEnabled()) {
      return
    }
    val ctx = inputService?.applicationContext ?: return
    mainHandler.post { KeyTapSoundPlayer.play(ctx) }
  }

  fun setPrefersNumpad(prefers: Boolean) {
    if (numpadPreferred == prefers) {
      return
    }
    numpadPreferred = prefers
    prefersNumpadListeners.forEach { listener -> listener(prefers) }
  }

  fun addPrefersNumpadListener(listener: (Boolean) -> Unit): () -> Unit {
    prefersNumpadListeners.add(listener)
    return { prefersNumpadListeners.remove(listener) }
  }

  fun notifyKeyboardShown() {
    keyboardVisibilityListeners.forEach { listener -> listener(true) }
  }

  fun notifyKeyboardHidden() {
    keyboardVisibilityListeners.forEach { listener -> listener(false) }
  }

  fun addKeyboardVisibilityListener(listener: (Boolean) -> Unit): () -> Unit {
    keyboardVisibilityListeners.add(listener)
    return { keyboardVisibilityListeners.remove(listener) }
  }

  fun notifyKeyboardSessionStart() {
    keyboardSessionStartListeners.forEach { listener -> listener() }
  }

  fun addKeyboardSessionStartListener(listener: () -> Unit): () -> Unit {
    keyboardSessionStartListeners.add(listener)
    return { keyboardSessionStartListeners.remove(listener) }
  }

  fun notifyEditorContextBeforeCursor(beforeCursor: String) {
    if (gamePerformanceMode) {
      return
    }
    pendingEditorContextBeforeCursor = beforeCursor
    mainHandler.removeCallbacks(emitEditorContextRunnable)
    mainHandler.postDelayed(emitEditorContextRunnable, 40L)
  }

  fun addEditorContextListener(listener: (String) -> Unit): () -> Unit {
    editorContextListeners.add(listener)
    return { editorContextListeners.remove(listener) }
  }

  fun notifyOrientationChanged(landscape: Boolean) {
    orientationChangeListeners.forEach { listener -> listener(landscape) }
  }

  fun addOrientationChangeListener(listener: (Boolean) -> Unit): () -> Unit {
    orientationChangeListeners.add(listener)
    return { orientationChangeListeners.remove(listener) }
  }

  fun notifyNativeFastPathKey(
      id: String,
      type: String,
      value: String,
      text: String,
      shiftConsumed: Boolean,
  ) {
    nativeFastPathKeyListeners.forEach { listener ->
      listener(id, type, value, text, shiftConsumed)
    }
  }

  fun addNativeFastPathKeyListener(
      listener: (String, String, String, String, Boolean) -> Unit,
  ): () -> Unit {
    nativeFastPathKeyListeners.add(listener)
    return { nativeFastPathKeyListeners.remove(listener) }
  }

  fun notifyTouchIntelligenceHit(analysis: TouchIntelligence.HitAnalysis) {
    touchIntelligenceHitListeners.forEach { listener -> listener(analysis) }
  }

  fun addTouchIntelligenceHitListener(
      listener: (TouchIntelligence.HitAnalysis) -> Unit,
  ): () -> Unit {
    touchIntelligenceHitListeners.add(listener)
    return { touchIntelligenceHitListeners.remove(listener) }
  }

  fun notifyNativeSuggestionsUpdated(snapshot: NativeSuggestionBarEngine.Snapshot) {
    nativeSuggestionsListeners.forEach { listener -> listener(snapshot) }
  }

  fun addNativeSuggestionsListener(
      listener: (NativeSuggestionBarEngine.Snapshot) -> Unit,
  ): () -> Unit {
    nativeSuggestionsListeners.add(listener)
    return { nativeSuggestionsListeners.remove(listener) }
  }

  fun registerKeyPreviewCallbacks(
      show: (Int, String) -> Unit,
      hide: (Int) -> Unit,
  ) {
    showKeyPreviewFn = show
    hideKeyPreviewFn = hide
  }

  fun clearKeyPreviewCallbacks() {
    showKeyPreviewFn = null
    hideKeyPreviewFn = null
  }

  fun showKeyPreview(reactTag: Int, label: String) {
    showKeyPreviewFn?.invoke(reactTag, label)
  }

  fun hideKeyPreview(reactTag: Int) {
    hideKeyPreviewFn?.invoke(reactTag)
  }

  fun consumeNativeFastPathPointer(pointerId: Int): Boolean =
      inputService?.consumeNativeFastPathPointer(pointerId) ?: false

  fun pollNativeFastPathCommit(): NativeKeyFastPath.PendingJsCommit? =
      inputService?.pollNativeFastPathCommit()

  fun isNativeTypingCommitActive(): Boolean =
      inputService?.isNativeTypingCommitActive() ?: false

  fun rollbackNativeFastPathPointer(pointerId: Int): Boolean =
      inputService?.rollbackNativeFastPathPointer(pointerId) ?: false

  fun notifyControllerInput(json: String) {
    controllerInputListeners.forEach { listener -> listener(json) }
  }

  fun addControllerInputListener(listener: (String) -> Unit): () -> Unit {
    controllerInputListeners.add(listener)
    return { controllerInputListeners.remove(listener) }
  }

  fun notifyControllerConnection(connected: Boolean) {
    controllerConnected = connected
    controllerConnectionListeners.forEach { listener -> listener(connected) }
  }

  fun addControllerConnectionListener(listener: (Boolean) -> Unit): () -> Unit {
    controllerConnectionListeners.add(listener)
    listener(controllerConnected)
    return { controllerConnectionListeners.remove(listener) }
  }

  fun setSupportsNewline(supports: Boolean) {
    if (supportsNewline == supports) {
      return
    }
    supportsNewline = supports
    notifySupportsNewlineListeners(supports)
  }

  fun refreshSupportsNewline(info: EditorInfo?) {
    val supports = shouldAllowNewline(info)
    supportsNewline = supports
    notifySupportsNewlineListeners(supports)
  }

  private fun notifySupportsNewlineListeners(supports: Boolean) {
    supportsNewlineListeners.forEach { listener -> listener(supports) }
  }

  fun addSupportsNewlineListener(listener: (Boolean) -> Unit): () -> Unit {
    supportsNewlineListeners.add(listener)
    listener(supportsNewline)
    return { supportsNewlineListeners.remove(listener) }
  }

  private fun getImeAction(info: EditorInfo): Int =
      info.imeOptions and EditorInfo.IME_MASK_ACTION

  private fun isExplicitSubmitImeAction(action: Int): Boolean =
      when (action) {
        EditorInfo.IME_ACTION_SEARCH,
        EditorInfo.IME_ACTION_GO,
        EditorInfo.IME_ACTION_DONE,
        EditorInfo.IME_ACTION_SEND,
        EditorInfo.IME_ACTION_NEXT,
        EditorInfo.IME_ACTION_PREVIOUS -> true
        else -> false
      }

  private fun isSingleLineTextVariation(inputType: Int): Boolean {
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return when (variation) {
      InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
      InputType.TYPE_TEXT_VARIATION_EMAIL_SUBJECT,
      InputType.TYPE_TEXT_VARIATION_URI,
      InputType.TYPE_TEXT_VARIATION_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_FILTER,
      InputType.TYPE_TEXT_VARIATION_PERSON_NAME,
      InputType.TYPE_TEXT_VARIATION_POSTAL_ADDRESS,
      InputType.TYPE_TEXT_VARIATION_PHONETIC -> true
      else -> false
    }
  }

  fun shouldAllowNewline(info: EditorInfo?): Boolean {
    if (info == null) {
      return false
    }
    if (info.packageName == GOOGLE_QUICK_SEARCH_BOX) {
      return false
    }

    val inputType = info.inputType
    if (isSingleLineTextVariation(inputType)) {
      return false
    }

    val action = getImeAction(info)

    // Search / Go actions should almost always submit (even if an app mistakenly sets multiline).
    // This covers cases like Instagram search bar that expect the search icon/action on enter.
    if (action == EditorInfo.IME_ACTION_SEARCH || action == EditorInfo.IME_ACTION_GO) {
      return false
    }

    // Multiline inputs (typical chat / notes compose) should allow literal newlines on enter
    // so the respective function (newline) is used. Submit actions like SEND are handled by
    // app buttons in most cases; enter = newline here.
    if ((inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0) {
      return true
    }

    if (isExplicitSubmitImeAction(action)) {
      // Non-multiline field with explicit action (DONE, SEND, NEXT, ...) -> perform the action.
      return false
    }

    return (info.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0
  }

  fun getPopupAnchorView(): View? = inputService?.popupAnchorView

  fun getKeyboardCoordinateView(): View? = inputService?.keyboardCoordinateView

  fun notifyPreviewContainerChanged() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      Handler(Looper.getMainLooper()).post { notifyPreviewContainerChanged() }
      return
    }
    previewContainerChangedListeners.forEach { listener -> listener() }
  }

  fun addPreviewContainerChangedListener(listener: () -> Unit): () -> Unit {
    previewContainerChangedListeners.add(listener)
    return { previewContainerChangedListeners.remove(listener) }
  }

  fun shouldPreferNumpad(info: EditorInfo?): Boolean {
    if (info == null) {
      return false
    }

    val inputClass = info.inputType and android.text.InputType.TYPE_MASK_CLASS
    return when (inputClass) {
      android.text.InputType.TYPE_CLASS_NUMBER,
      android.text.InputType.TYPE_CLASS_PHONE -> true
      else -> false
    }
  }

  @Volatile private var touchpadGestureConsuming: Boolean = false

  fun setTouchpadGestureConsuming(active: Boolean) {
    touchpadGestureConsuming = active
  }

  fun isTouchpadGestureConsuming(): Boolean = touchpadGestureConsuming
}
