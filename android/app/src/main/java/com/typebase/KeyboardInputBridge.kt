package com.typebase

import android.view.inputmethod.InputConnection

object KeyboardInputBridge {
  @Volatile
  var inputService: TypeBaseInputService? = null

  fun getInputConnection(): InputConnection? = inputService?.currentInputConnection

  fun requestHideSelf() {
    inputService?.requestHideSelf(0)
  }

  fun setKeyboardHeightDp(heightDp: Int) {
    inputService?.setKeyboardHeightDp(heightDp)
  }
}
