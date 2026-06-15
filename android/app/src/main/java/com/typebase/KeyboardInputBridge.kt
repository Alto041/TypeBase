package com.typebase

import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import java.util.concurrent.CopyOnWriteArrayList

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  @Volatile
  private var numpadPreferred: Boolean = false

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
  private val keyboardVisibilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

  fun prefersNumpad(): Boolean = numpadPreferred

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
