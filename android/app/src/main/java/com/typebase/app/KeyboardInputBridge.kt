package com.typebase.app

import android.view.KeyEvent
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import java.util.concurrent.CopyOnWriteArrayList

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  /** Google app search bar: always show submit enter, never newline. */
  private const val GOOGLE_QUICK_SEARCH_BOX = "com.google.android.googlequicksearchbox"

  @Volatile
  private var numpadPreferred: Boolean = false

  @Volatile
  private var supportsNewline: Boolean = false

  @Volatile
  private var currentEditorInfo: EditorInfo? = null

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardVisibilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val supportsNewlineListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val initialCapsModeListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val nativeFastPathKeyListeners =
      CopyOnWriteArrayList<(String, String, String, String) -> Unit>()

  @Volatile
  private var initialCapsMode: Boolean = false

  fun prefersNumpad(): Boolean = numpadPreferred

  fun currentInputSupportsNewline(): Boolean = supportsNewline

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

  /**
   * Check if the input field expects initial capitalization.
   * This checks TYPE_TEXT_FLAG_CAP_SENTENCES and TYPE_TEXT_FLAG_CAP_WORDS.
   */
  fun shouldCapitalizeInitial(info: EditorInfo?): Boolean {
    if (info == null) {
      return false
    }
    val inputType = info.inputType
    val textFlags = inputType and android.text.InputType.TYPE_MASK_FLAGS
    return (textFlags and android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES) != 0 ||
           (textFlags and android.text.InputType.TYPE_TEXT_FLAG_CAP_WORDS) != 0
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

  fun performKeyHaptic() {
    inputService
        ?.keyboardViewForFeedback
        ?.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
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

  fun shouldAllowNewline(info: EditorInfo?): Boolean {
    if (info?.packageName == GOOGLE_QUICK_SEARCH_BOX) {
      return false
    }

    if (info == null) {
      return false
    }
    val inputType = info.inputType
    val textFlags = inputType and android.text.InputType.TYPE_MASK_FLAGS

    // Multi-line text inputs typically set TYPE_TEXT_FLAG_MULTI_LINE.
    val isMultilineFlag = (inputType and android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0
    if (isMultilineFlag) {
      return true
    }

    // Some editors set IME_FLAG_NO_ENTER_ACTION for multi-line / return-as-newline.
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
}
