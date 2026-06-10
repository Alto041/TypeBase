package com.typebase

import android.inputmethodservice.InputMethodService
import android.util.TypedValue
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.interfaces.fabric.ReactSurface

class TypeBaseInputService : InputMethodService() {

  private var reactSurface: ReactSurface? = null
  private var container: FrameLayout? = null
  private var keyboardView: View? = null
  private var keyboardHeightDp: Int = DEFAULT_KEYBOARD_HEIGHT_DP

  override fun onCreate() {
    super.onCreate()
    KeyboardInputBridge.inputService = this
  }

  override fun onCreateInputView(): View {
    val frame = FrameLayout(this)
    container = frame
    val app = application as? ReactApplication ?: return frame
    val reactHost = app.reactHost ?: return frame

    val surface = reactHost.createSurface(this, KEYBOARD_COMPONENT_NAME, null)
    surface.start()
    reactSurface = surface

    val view = surface.view ?: return frame
    keyboardView = view

    frame.addView(
        view,
        FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            keyboardHeightPx(keyboardHeightDp),
        ),
    )
    return frame
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
    reactSurface?.stop()
    reactSurface = null
    keyboardView = null
    container = null
    if (KeyboardInputBridge.inputService === this) {
      KeyboardInputBridge.inputService = null
    }
    super.onDestroy()
  }

  companion object {
    const val KEYBOARD_COMPONENT_NAME = "TypeBaseKeyboard"
    const val DEFAULT_KEYBOARD_HEIGHT_DP = 300
    private const val MIN_KEYBOARD_HEIGHT_DP = 280
  }
}
