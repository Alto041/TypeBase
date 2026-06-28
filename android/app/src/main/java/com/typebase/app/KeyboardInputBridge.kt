package com.typebase.app

import android.view.KeyEvent
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.text.InputType
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

  @Volatile
  private var currentEditorInfo: EditorInfo? = null

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardVisibilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardSessionStartListeners = CopyOnWriteArrayList<() -> Unit>()
  private val orientationChangeListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val supportsNewlineListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val initialCapsModeListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val nativeFastPathKeyListeners =
      CopyOnWriteArrayList<(String, String, String, String) -> Unit>()

  @Volatile
  private var initialCapsMode: Boolean = false

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

    if (actionId == EditorInfo.IME_ACTION_NONE) {
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

  fun setNativeKeyFastPathConfig(json: String) {
    inputService?.setNativeKeyFastPathConfig(json)
  }

  fun isKeyHapticEnabled(): Boolean = keyHapticEnabled

  fun syncLayoutSettings(json: String) {
    try {
      val layout = JSONObject(json)
      keyHapticEnabled = layout.optBoolean("keyHapticEnabled", true)
    } catch (_: Exception) {
      keyHapticEnabled = true
    }
  }

  fun performKeyHaptic() {
    if (keyHapticEnabled) {
      inputService
          ?.keyboardViewForFeedback
          ?.performHapticFeedback(
              HapticFeedbackConstants.KEYBOARD_TAP,
              HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
          )
    }
    inputService?.applicationContext?.let { KeyTapSoundPlayer.play(it) }
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

  fun notifyOrientationChanged(landscape: Boolean) {
    orientationChangeListeners.forEach { listener -> listener(landscape) }
  }

  fun addOrientationChangeListener(listener: (Boolean) -> Unit): () -> Unit {
    orientationChangeListeners.add(listener)
    return { orientationChangeListeners.remove(listener) }
  }

  fun notifyNativeFastPathKey(id: String, type: String, value: String, text: String) {
    nativeFastPathKeyListeners.forEach { listener -> listener(id, type, value, text) }
  }

  fun addNativeFastPathKeyListener(
      listener: (String, String, String, String) -> Unit,
  ): () -> Unit {
    nativeFastPathKeyListeners.add(listener)
    return { nativeFastPathKeyListeners.remove(listener) }
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

    // Apps like Instagram search set MULTI_LINE but still expect Search/Go/Done on Enter.
    if (isExplicitSubmitImeAction(getImeAction(info))) {
      return false
    }

    val inputType = info.inputType
    if (isSingleLineTextVariation(inputType)) {
      return false
    }

    if ((inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0) {
      return true
    }

    return (info.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0
  }

  fun getPopupAnchorView(): View? = inputService?.popupAnchorView

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
