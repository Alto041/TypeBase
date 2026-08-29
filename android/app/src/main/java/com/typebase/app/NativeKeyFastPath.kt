package com.typebase.app

import android.os.Handler
import android.os.Looper
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
      val centerX: Float,
      val centerY: Float,
      val reactTag: Int,
  ) {
    fun toGeometry(): TouchIntelligence.KeyGeometry =
        TouchIntelligence.KeyGeometry(
            id = id,
            value = value,
            left = left,
            top = top,
            right = right,
            bottom = bottom,
            centerX = centerX,
            centerY = centerY,
        )
  }

  private class TouchSession(
      val pointerId: Int,
      val key: NativeKey,
      val commitText: String,
      var jsConsumed: Boolean = false,
  )

  data class PendingJsCommit(
      val pointerId: Int,
      val keyId: String,
      val commitText: String,
      val shiftConsumed: Boolean,
  )

  @Volatile
  private var enabled = false
  @Volatile
  private var commitOnDown = true
  @Volatile
  private var zeroLatency = false
  @Volatile
  private var gamePerformance = false
  private var areaPageX = 0f
  private var areaPageY = 0f
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  @Volatile
  private var blockAutoShiftReenable = false
  private var keyboardLayout = "letters"
  private var uppercase = false
  private var shiftOn = false
  private var capsLocked = false
  private var keys = emptyList<NativeKey>()
  private var keyById = emptyMap<String, NativeKey>()
  private val touchIntelligence = TouchIntelligence()
  @Volatile private var lastConfigJson = ""
  @Volatile private var lastTouchContextJson = ""
  private val sessions = mutableMapOf<Int, TouchSession>()
  private val pendingJsCommits = ArrayDeque<PendingJsCommit>()
  private val pendingJsCommitsLock = Any()
  private val previewHandler = Handler(Looper.getMainLooper())

  fun updateConfig(json: String) {
    if (json == lastConfigJson) {
      return
    }
    try {
      val obj = JSONObject(json)
      enabled = obj.optBoolean("enabled", false)
      commitOnDown = obj.optBoolean("commitOnDown", true)
      zeroLatency = obj.optBoolean("zeroLatency", false)
      gamePerformance = obj.optBoolean("gamePerformance", false)
      areaPageX = obj.optDouble("areaPageX", 0.0).toFloat()
      areaPageY = obj.optDouble("areaPageY", 0.0).toFloat()
      hitSlopHorizontal = obj.optDouble("hitSlopHorizontal", 0.0).toFloat()
      hitSlopVertical = obj.optDouble("hitSlopVertical", 0.0).toFloat()
      keyboardLayout = obj.optString("layout", "letters")
      // Case state is owned by updateCaseState() only. Republishing layout config
      // must not reset shift after a native letter commit during fast typing.
      keys = parseKeys(obj.optJSONArray("keys") ?: JSONArray())
      keyById = keys.associateBy { it.id }
      touchIntelligence.updateConfig(
          obj.optJSONObject("touchIntelligence"),
          hitSlopHorizontal,
          hitSlopVertical,
          keys.map { key -> key.toGeometry() },
      )
      if (!enabled) {
        zeroLatency = false
        gamePerformance = false
        sessions.clear()
        synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
      }
      lastConfigJson = json
    } catch (_: Exception) {
      enabled = false
      zeroLatency = false
      gamePerformance = false
      keys = emptyList()
      keyById = emptyMap()
      lastConfigJson = ""
      sessions.clear()
      synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
    }
  }

  fun clear() {
    enabled = false
    zeroLatency = false
    gamePerformance = false
    keys = emptyList()
    keyById = emptyMap()
    lastConfigJson = ""
    lastTouchContextJson = ""
    sessions.clear()
    synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
  }

  fun updateTouchIntelligenceContext(json: String) {
    if (json == lastTouchContextJson) {
      return
    }
    try {
      val obj = JSONObject(json)
      touchIntelligence.updateTypingContext(
          obj.optString("previousKeyLetter", "").takeIf { it.isNotEmpty() },
          obj.optString("wordPrefix", ""),
      )
      lastTouchContextJson = json
    } catch (_: Exception) {
      // Ignore malformed context payloads.
    }
  }

  /** O(1) ack for JS — avoids pointer-id mismatches vs MotionEvent ids. */
  fun pollPendingCommit(): PendingJsCommit? {
    val pending =
        synchronized(pendingJsCommitsLock) { pendingJsCommits.removeFirstOrNull() }
            ?: return null
    sessions[pending.pointerId]?.jsConsumed = true
    return pending
  }

  /**
   * True when native already committed text for this touch. RN touch identifiers often
   * differ from MotionEvent pointer ids, so fall back to any pending native commit.
   */
  fun consumePointer(pointerId: Int): Boolean {
    sessions[pointerId]?.takeIf { !it.jsConsumed }?.let { session ->
      session.jsConsumed = true
      return true
    }
    val pending = sessions.values.firstOrNull { !it.jsConsumed } ?: return false
    pending.jsConsumed = true
    return true
  }

  fun isTypingCommitActive(): Boolean = enabled && commitOnDown && keys.isNotEmpty()

  fun isZeroLatencyMode(): Boolean = zeroLatency

  fun setZeroLatencyMode(enabled: Boolean) {
    zeroLatency = enabled
  }

  fun updateCaseState(shiftOn: Boolean, capsLocked: Boolean, uppercase: Boolean) {
    if (blockAutoShiftReenable && shiftOn && !capsLocked) {
      return
    }
    if (shiftOn && !capsLocked) {
      blockAutoShiftReenable = false
    }
    this.shiftOn = shiftOn
    this.capsLocked = capsLocked
    this.uppercase = shiftOn || capsLocked
  }

  fun clearMidWordShiftBlock() {
    blockAutoShiftReenable = false
  }

  /** Undo a native letter commit when a touch becomes a swipe gesture. */
  fun rollbackPointerCommit(pointerId: Int): Boolean {
    val session =
        sessions[pointerId]
            ?: sessions.values.lastOrNull { it.commitText.isNotEmpty() }
            ?: return false
    val connection = KeyboardInputBridge.getInputConnection() ?: return false
    val length = session.commitText.length
    if (length <= 0) {
      return false
    }
    connection.deleteSurroundingText(length, 0)
    sessions.remove(session.pointerId)
    return true
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
        val localX = rawX - areaPageX
        val localY = rawY - areaPageY
        val hitResult = touchIntelligence.hitTestWithAnalysis(localX, localY, event.eventTime)
        val key = hitResult.key?.let { keyById[it.id] } ?: return false

        if (!commitOnDown) {
          return false
        }

        val text = resolveCommitText(key.value)
        val shiftConsumed =
            keyboardLayout == "letters" &&
                shiftOn &&
                !capsLocked &&
                text.length == 1 &&
                text[0].isUpperCase()
        if (!commitKeyTextOnly(key, text, shiftConsumed)) {
          return false
        }

        sessions[pointerId] = TouchSession(pointerId, key, text)
        touchIntelligence.recordTap(text, localX, localY, event.eventTime)
        if (!zeroLatency && !gamePerformance) {
          hitResult.analysis?.let { analysis ->
            previewHandler.post { KeyboardInputBridge.notifyTouchIntelligenceHit(analysis) }
          }
        }
        synchronized(pendingJsCommitsLock) {
          pendingJsCommits.addLast(
              PendingJsCommit(pointerId, key.id, text, shiftConsumed),
          )
        }

        // Haptic on touch-down immediately — never queue behind preview/sound.
        if (zeroLatency || gamePerformance) {
          KeyboardInputBridge.performLightKeyHapticForPointer(pointerId)
        } else {
          KeyboardInputBridge.performKeyHapticForPointer(pointerId)
        }

        // Preview and tap sound can post async; haptic must not wait on the handler.
        previewHandler.post {
          if (!zeroLatency) {
            if (key.reactTag > 0) {
              KeyboardInputBridge.showKeyPreview(key.reactTag, text)
            }
            KeyboardInputBridge.playKeyTapSound()
          }
        }
        false
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_POINTER_UP -> {
        val pointerId = event.getPointerId(event.actionIndex)
        sessions[pointerId]?.key?.reactTag?.let { reactTag ->
          if (reactTag > 0) {
            KeyboardInputBridge.hideKeyPreview(reactTag)
          }
        }
        // Keep sessions briefly so JS can acknowledge native commits even when
        // touch identifiers do not match MotionEvent pointer ids.
        previewHandler.postDelayed({ sessions.remove(pointerId) }, 450)
        false
      }

      MotionEvent.ACTION_CANCEL -> {
        for (session in sessions.values) {
          if (session.key.reactTag > 0) {
            KeyboardInputBridge.hideKeyPreview(session.key.reactTag)
          }
        }
        sessions.clear()
        synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
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
      if (type == "comma" || type == "period" || type == "space") {
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
              centerX =
                  obj.optDouble("centerX", Double.NaN).toFloat().let { parsedCenterX ->
                    if (parsedCenterX.isNaN()) {
                      obj.optDouble("x", 0.0).toFloat() +
                          obj.optDouble("width", 0.0).toFloat() / 2f
                    } else {
                      parsedCenterX
                    }
                  },
              centerY =
                  obj.optDouble("centerY", Double.NaN).toFloat().let { parsedCenterY ->
                    if (parsedCenterY.isNaN()) {
                      obj.optDouble("y", 0.0).toFloat() +
                          obj.optDouble("height", 0.0).toFloat() / 2f
                    } else {
                      parsedCenterY
                    }
                  },
              reactTag = obj.optInt("reactTag", 0),
          ),
      )
    }
    return parsed
  }

  private fun hitTest(localX: Float, localY: Float, timestampMs: Long): NativeKey? {
    val geometry = touchIntelligence.hitTest(localX, localY, timestampMs) ?: return null
    return keyById[geometry.id]
  }

  /**
   * Commits text + notifies (used only for the fast-commit-on-down case).
   * Haptic is intentionally fired *before* calling this, in the touch handler.
   */
  private fun commitKeyTextOnly(
      key: NativeKey,
      text: String,
      shiftConsumed: Boolean,
  ): Boolean {
    val connection = KeyboardInputBridge.getInputConnection() ?: return false

    connection.commitText(text, 1)

    if (shiftConsumed) {
      shiftOn = false
      uppercase = false
      blockAutoShiftReenable = true
    }

    // Notify JS after commit — never block the touch path on the RN bridge.
    val keyId = key.id
    val keyType = key.type
    val keyValue = key.value
    previewHandler.post {
      KeyboardInputBridge.notifyNativeFastPathKey(
          keyId,
          keyType,
          keyValue,
          text,
          shiftConsumed,
      )
    }

    return true
  }

  private fun resolveCommitText(value: String): String {
    if (keyboardLayout != "letters" || value.length != 1) {
      return value
    }
    return if (shiftOn || capsLocked) {
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
