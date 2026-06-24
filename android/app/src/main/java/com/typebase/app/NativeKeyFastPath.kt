package com.typebase.app

import android.view.MotionEvent
import org.json.JSONArray
import org.json.JSONObject

class NativeKeyFastPath {
  private data class NativeKey(
      val id: String,
      val type: String,
      val value: String,
      val left: Float,
      val top: Float,
      val right: Float,
      val bottom: Float,
  )

  private data class TouchSession(
      val pointerId: Int,
      val key: NativeKey,
  )

  @Volatile
  private var enabled = false
  private var areaPageX = 0f
  private var areaPageY = 0f
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  private var keyboardLayout = "letters"
  private var uppercase = false
  private var shiftOn = false
  private var capsLocked = false
  private var keys = emptyList<NativeKey>()
  private val sessions = mutableMapOf<Int, TouchSession>()

  fun updateConfig(json: String) {
    try {
      val obj = JSONObject(json)
      enabled = obj.optBoolean("enabled", false)
      areaPageX = obj.optDouble("areaPageX", 0.0).toFloat()
      areaPageY = obj.optDouble("areaPageY", 0.0).toFloat()
      hitSlopHorizontal = obj.optDouble("hitSlopHorizontal", 0.0).toFloat()
      hitSlopVertical = obj.optDouble("hitSlopVertical", 0.0).toFloat()
      keyboardLayout = obj.optString("layout", "letters")
      uppercase = obj.optBoolean("isUppercase", false)
      shiftOn = obj.optBoolean("shiftOn", false)
      capsLocked = obj.optBoolean("capsLocked", false)
      keys = parseKeys(obj.optJSONArray("keys") ?: JSONArray())
      if (!enabled) {
        sessions.clear()
      }
    } catch (_: Exception) {
      enabled = false
      keys = emptyList()
      sessions.clear()
    }
  }

  fun clear() {
    enabled = false
    keys = emptyList()
    sessions.clear()
  }

  /**
   * Commits letter keys on touch-down (before React processes the event) for minimal
   * input latency. Returns false so swipe typing and key visuals still receive touches.
   */
  fun onTouchEvent(event: MotionEvent): Boolean {
    if (!enabled || keys.isEmpty()) {
      return false
    }

    return when (event.actionMasked) {
      MotionEvent.ACTION_DOWN,
      MotionEvent.ACTION_POINTER_DOWN -> {
        val index = event.actionIndex
        val pointerId = event.getPointerId(index)
        val rawX = event.rawXForIndex(index)
        val rawY = event.rawYForIndex(index)
        val key = hitTest(rawX, rawY) ?: return false
        sessions[pointerId] = TouchSession(pointerId, key)
        commitKey(key)
        false
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_POINTER_UP -> {
        val pointerId = event.getPointerId(event.actionIndex)
        sessions.remove(pointerId)
        false
      }

      MotionEvent.ACTION_CANCEL -> {
        sessions.clear()
        false
      }

      else -> false
    }
  }

  private fun parseKeys(array: JSONArray): List<NativeKey> {
    val parsed = mutableListOf<NativeKey>()
    for (index in 0 until array.length()) {
      val obj = array.optJSONObject(index) ?: continue
      val value = obj.optString("value", "")
      if (value.isEmpty()) {
        continue
      }
      val type = obj.optString("type", "char")
      if (type == "comma" || type == "period") {
        continue
      }
      parsed.add(
          NativeKey(
              id = obj.optString("id", value),
              type = type,
              value = value,
              left = obj.optDouble("x", 0.0).toFloat(),
              top = obj.optDouble("y", 0.0).toFloat(),
              right =
                  obj.optDouble("x", 0.0).toFloat() +
                      obj.optDouble("width", 0.0).toFloat(),
              bottom =
                  obj.optDouble("y", 0.0).toFloat() +
                      obj.optDouble("height", 0.0).toFloat(),
          ),
      )
    }
    return parsed
  }

  private fun hitTest(rawX: Float, rawY: Float): NativeKey? {
    val localX = rawX - areaPageX
    val localY = rawY - areaPageY
    var match: NativeKey? = null
    var smallestArea = Float.MAX_VALUE

    for (key in keys) {
      if (
          localX < key.left - hitSlopHorizontal ||
              localX > key.right + hitSlopHorizontal ||
              localY < key.top - hitSlopVertical ||
              localY > key.bottom + hitSlopVertical
      ) {
        continue
      }
      val area = (key.right - key.left) * (key.bottom - key.top)
      if (area < smallestArea) {
        smallestArea = area
        match = key
      }
    }

    return match
  }

  private fun commitKey(key: NativeKey): Boolean {
    val connection = KeyboardInputBridge.getInputConnection() ?: return false
    val text = resolveCommitText(key.value)

    connection.commitText(text, 1)
    KeyboardInputBridge.performKeyHaptic()
    KeyboardInputBridge.notifyNativeFastPathKey(key.id, key.type, key.value, text)

    if (keyboardLayout == "letters" && shiftOn && !capsLocked) {
      shiftOn = false
      uppercase = false
    }

    return true
  }

  private fun resolveCommitText(value: String): String {
    if (keyboardLayout != "letters" || value.length != 1) {
      return value
    }
    return if (uppercase) {
      value.uppercase()
    } else {
      value.lowercase()
    }
  }

  private fun MotionEvent.rawXForIndex(index: Int): Float {
    return rawX + getX(index) - x
  }

  private fun MotionEvent.rawYForIndex(index: Int): Float {
    return rawY + getY(index) - y
  }
}
