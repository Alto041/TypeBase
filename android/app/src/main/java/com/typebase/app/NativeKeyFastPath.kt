package com.typebase.app

import android.os.SystemClock
import android.view.MotionEvent
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.hypot

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
      val startRawX: Float,
      val startRawY: Float,
      val startTimeMs: Long,
  )

  @Volatile
  private var enabled = false
  private var areaPageX = 0f
  private var areaPageY = 0f
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  private var pixelRatio = 1f
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
      pixelRatio = obj.optDouble("pixelRatio", 1.0).toFloat().coerceAtLeast(1f)
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
        sessions[pointerId] =
            TouchSession(pointerId, key, rawX, rawY, SystemClock.uptimeMillis())
        false
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_POINTER_UP -> {
        val index = event.actionIndex
        val pointerId = event.getPointerId(index)
        val session = sessions.remove(pointerId) ?: return false
        val rawX = event.rawXForIndex(index)
        val rawY = event.rawYForIndex(index)
        if (!isTap(session, rawX, rawY)) {
          return false
        }

        val key = hitTest(rawX, rawY)
        if (key?.id != session.key.id) {
          return false
        }

        commitKey(key)
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
      parsed.add(
          NativeKey(
              id = obj.optString("id", value),
              type = obj.optString("type", "char"),
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
    val localX = rawX / pixelRatio - areaPageX
    val localY = rawY / pixelRatio - areaPageY
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

  private fun isTap(session: TouchSession, rawX: Float, rawY: Float): Boolean {
    val distance = hypot((rawX - session.startRawX).toDouble(), (rawY - session.startRawY).toDouble())
    val elapsed = SystemClock.uptimeMillis() - session.startTimeMs
    return distance <= MAX_TAP_MOVE_PX && elapsed <= MAX_TAP_MS
  }

  private fun commitKey(key: NativeKey): Boolean {
    val connection = KeyboardInputBridge.getInputConnection() ?: return false
    val text =
        if (keyboardLayout == "letters" && uppercase && key.value.length == 1) {
          key.value.uppercase()
        } else {
          key.value
        }

    connection.commitText(text, 1)
    KeyboardInputBridge.performKeyHaptic()
    KeyboardInputBridge.notifyNativeFastPathKey(key.id, key.type, key.value, text)

    if (keyboardLayout == "letters" && shiftOn && !capsLocked) {
      shiftOn = false
      uppercase = false
    }

    return true
  }

  private fun MotionEvent.rawXForIndex(index: Int): Float {
    return rawX + getX(index) - x
  }

  private fun MotionEvent.rawYForIndex(index: Int): Float {
    return rawY + getY(index) - y
  }

  companion object {
    private const val MAX_TAP_MS = 220L
    private const val MAX_TAP_MOVE_PX = 18f
  }
}
