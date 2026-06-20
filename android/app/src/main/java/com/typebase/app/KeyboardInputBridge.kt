package com.typebase.app

import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import java.util.concurrent.CopyOnWriteArrayList

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  @Volatile
  private var numpadPreferred: Boolean = false

  @Volatile
  private var supportsNewline: Boolean = false

  @Volatile
  private var currentEditorInfo: EditorInfo? = null

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardVisibilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val supportsNewlineListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

  fun prefersNumpad(): Boolean = numpadPreferred

  fun currentInputSupportsNewline(): Boolean = supportsNewline

  fun setCurrentEditorInfo(info: EditorInfo?) {
    currentEditorInfo = info
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
