package com.typebase

import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import java.util.concurrent.CopyOnWriteArrayList

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  @Volatile
  private var numpadPreferred: Boolean = false

  private val prefersNumpadListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

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
