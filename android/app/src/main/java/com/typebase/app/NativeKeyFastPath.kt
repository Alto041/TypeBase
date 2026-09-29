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
  @Volatile
  private var previewPopupEnabled = true
  @Volatile
  private var previewPressedEnabled = true
  @Volatile
  private var previewDoodleEnabled = false
  @Volatile
  private var compactTyping = false
  private var areaPageX = 0f
  private var areaPageY = 0f
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  @Volatile
  private var blockAutoShiftReenable = false
  @Volatile
  private var shiftEditorShortcuts = true
  @Volatile
  private var shiftEditorHeld = false
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
  private val compactSyncHandler = Handler(Looper.getMainLooper())
  private var compactIdleSyncRunnable: Runnable? = null
  private var livePrefix = StringBuilder()

  fun isCompactTyping(): Boolean = enabled && compactTyping

  fun syncLivePrefixFromJs(prefix: String) {
    livePrefix.clear()
    livePrefix.append(prefix.take(28))
  }

  private fun clearCompactSessionState() {
    livePrefix.clear()
    compactIdleSyncRunnable?.let { compactSyncHandler.removeCallbacks(it) }
    compactIdleSyncRunnable = null
    KeyboardInputBridge.stopCompactBackspaceRepeat()
  }

  private fun pushCompactStateSync(reason: String) {
    if (!compactTyping) {
      return
    }
    KeyboardInputBridge.notifyCompactTypingState(
        livePrefix.toString(),
        shiftOn,
        capsLocked,
        reason,
    )
  }

  private fun scheduleCompactIdleSync() {
    if (!compactTyping) {
      return
    }
    compactIdleSyncRunnable?.let { compactSyncHandler.removeCallbacks(it) }
    val runnable = Runnable {
      compactIdleSyncRunnable = null
      pushCompactStateSync("idle")
    }
    compactIdleSyncRunnable = runnable
    compactSyncHandler.postDelayed(runnable, 200L)
  }

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
      previewPopupEnabled = obj.optBoolean("previewPopupEnabled", true)
      previewPressedEnabled = obj.optBoolean("previewPressedEnabled", true)
      previewDoodleEnabled = obj.optBoolean("previewDoodleEnabled", false)
      compactTyping = obj.optBoolean("compactTyping", false)
      areaPageX = obj.optDouble("areaPageX", 0.0).toFloat()
      areaPageY = obj.optDouble("areaPageY", 0.0).toFloat()
      hitSlopHorizontal = obj.optDouble("hitSlopHorizontal", 0.0).toFloat()
      hitSlopVertical = obj.optDouble("hitSlopVertical", 0.0).toFloat()
      keyboardLayout = obj.optString("layout", "letters")
      shiftEditorShortcuts = obj.optBoolean("shiftEditorShortcuts", true)
      if (obj.has("shiftEditorHeld")) {
        shiftEditorHeld = obj.optBoolean("shiftEditorHeld", false)
      }
      if (obj.has("shiftOn") && obj.has("capsLocked")) {
        updateCaseState(
            obj.optBoolean("shiftOn", false),
            obj.optBoolean("capsLocked", false),
            obj.optBoolean("shiftOn", false) || obj.optBoolean("capsLocked", false),
        )
      }
      keys = parseKeys(obj.optJSONArray("keys") ?: JSONArray())
      keyById = keys.associateBy { it.id }
      touchIntelligence.updateTapMapFromJson(obj.optJSONArray("tapMap"))
      touchIntelligence.updateConfig(
          obj.optJSONObject("touchIntelligence"),
          hitSlopHorizontal,
          hitSlopVertical,
          keys.map { key -> key.toGeometry() },
      )
      if (!enabled) {
        zeroLatency = false
        gamePerformance = false
        previewPopupEnabled = true
        previewPressedEnabled = true
        clearCompactSessionState()
        sessions.clear()
        synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
      }
      lastConfigJson = json
      CompactTypingTelemetry.recordFastPathConfigPublish()
    } catch (_: Exception) {
      enabled = false
      zeroLatency = false
      gamePerformance = false
      previewPopupEnabled = true
      previewPressedEnabled = true
      previewDoodleEnabled = false
      keys = emptyList()
      keyById = emptyMap()
      lastConfigJson = ""
      sessions.clear()
      synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
    }
  }

  fun updatePreviewChromeFlags(
      previewPopup: Boolean,
      previewPressed: Boolean,
      previewDoodle: Boolean,
  ) {
    previewPopupEnabled = previewPopup
    previewPressedEnabled = previewPressed
    previewDoodleEnabled = previewDoodle
  }

  fun clear() {
    enabled = false
    zeroLatency = false
    gamePerformance = false
    previewPopupEnabled = true
    previewPressedEnabled = true
    previewDoodleEnabled = false
    keys = emptyList()
    keyById = emptyMap()
    lastConfigJson = ""
    lastTouchContextJson = ""
    clearCompactSessionState()
    sessions.clear()
    synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
  }

  fun updateTouchIntelligenceContext(json: String) {
    if (json == lastTouchContextJson) {
      return
    }
    try {
      touchIntelligence.updateTypingContext(json)
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

  fun setGamePerformanceMode(enabled: Boolean) {
    gamePerformance = enabled
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
   * Commits keys on touch-down. When [compactTyping] is active and a typing key is handled,
   * returns true so the IME can skip dispatching the event to React Native.
   */
  fun onTouchEvent(event: MotionEvent): Boolean {
    if (!enabled || keys.isEmpty()) {
      return false
    }

    return when (event.actionMasked) {
      MotionEvent.ACTION_DOWN,
      MotionEvent.ACTION_POINTER_DOWN -> {
        handlePointerDown(event)
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_POINTER_UP -> {
        handlePointerUp(event)
      }

      MotionEvent.ACTION_CANCEL -> {
        handlePointerCancel()
      }

      else -> false
    }
  }

  private fun handlePointerDown(event: MotionEvent): Boolean {
    val index = event.actionIndex
    val pointerId = event.getPointerId(index)
    val rawX = event.rawXForIndex(index)
    val rawY = event.rawYForIndex(index)
    val localX = rawX - areaPageX
    val localY = rawY - areaPageY
    val key =
        if (zeroLatency || gamePerformance || compactTyping) {
          touchIntelligence.geometricHitTest(localX, localY)?.let { geometry ->
            keyById[geometry.id]
          }
        } else {
          touchIntelligence
              .hitTestWithAnalysis(localX, localY, event.eventTime)
              .key
              ?.let { geometry -> keyById[geometry.id] }
        }
            ?: return false

    if (!commitOnDown) {
      return false
    }

    val blockReact = handleKeyDown(key, pointerId, localX, localY, rawX, rawY, event.eventTime)
    if (blockReact) {
      CompactTypingTelemetry.recordNativeCommit()
      CompactTypingTelemetry.recordReactTouchBlocked()
    }
    return blockReact
  }

  private fun handleKeyDown(
      key: NativeKey,
      pointerId: Int,
      localX: Float,
      localY: Float,
      rawX: Float,
      rawY: Float,
      eventTime: Long,
  ): Boolean {
    when (key.type) {
      "backspace" -> {
        KeyboardInputBridge.performDeleteBackwardFast()
        if (livePrefix.isNotEmpty()) {
          livePrefix.deleteCharAt(livePrefix.length - 1)
        }
        NativeSuggestionBarEngine.syncPrefix(livePrefix.toString())
        KeyboardInputBridge.startCompactBackspaceRepeat()
        pulseLandscapeAwareHaptic(pointerId)
        showKeyChromeForKey(key, "⌫", rawX, rawY, localX, localY)
        sessions[pointerId] = TouchSession(pointerId, key, "")
        pushCompactStateSync("backspace")
        scheduleCompactIdleSync()
        return compactTyping
      }
      "space" -> {
        val connection = KeyboardInputBridge.getInputConnection() ?: return false
        connection.commitText(" ", 1)
        val typedWord = livePrefix.toString()
        livePrefix.clear()
        NativeSuggestionBarEngine.clearPrefix()
        pulseLandscapeAwareHaptic(pointerId)
        showKeyChromeForKey(key, " ", rawX, rawY, localX, localY)
        sessions[pointerId] = TouchSession(pointerId, key, " ")
        if (compactTyping && typedWord.isNotBlank()) {
          KeyboardInputBridge.notifyCompactTypingBoundary(" ", typedWord)
        }
        pushCompactStateSync("space")
        return compactTyping
      }
      "shift" -> {
        return false
      }
      "enter", "enter-backspace" -> {
        return false
      }
      "numbers", "symbols", "letters" -> {
        return false
      }
    }

    val text = resolveCommitText(key.value)
    if (shouldRunShiftEditorChord(text)) {
      KeyboardInputBridge.tryPerformShiftEditorShortcut(text[0])
      shiftOn = false
      uppercase = false
      blockAutoShiftReenable = true
      pulseLandscapeAwareHaptic(pointerId)
      showKeyChromeForKey(key, text, rawX, rawY, localX, localY)
      sessions[pointerId] = TouchSession(pointerId, key, "")
      return false
    }
    val shiftConsumed =
        keyboardLayout == "letters" &&
            shiftOn &&
            !capsLocked &&
            text.length == 1 &&
            text[0].isUpperCase()
    if (!commitKeyTextOnly(key, text, shiftConsumed)) {
      return false
    }

    if (keyboardLayout == "letters" && text.length == 1 && text[0].isLetter()) {
      if (!zeroLatency && !compactTyping) {
        if (!gamePerformance) {
          NativeSuggestionBarEngine.appendLetter(text)
        }
      } else if (!zeroLatency && compactTyping) {
        livePrefix.append(text.lowercase())
        NativeSuggestionBarEngine.appendLetter(text)
      }
    }

    sessions[pointerId] = TouchSession(pointerId, key, text)
    if (compactTyping && text.length == 1 && text[0].isLetter()) {
      KeyboardInputBridge.notifyCompactLetterTap(text.lowercase(), localX, localY)
    }
    if (!zeroLatency && !gamePerformance && !compactTyping) {
      touchIntelligence.recordTap(text, localX, localY, eventTime)
    }
    if (!compactTyping) {
      synchronized(pendingJsCommitsLock) {
        pendingJsCommits.addLast(
            PendingJsCommit(pointerId, key.id, text, shiftConsumed),
        )
      }
    }

    pulseLandscapeAwareHaptic(pointerId)
    showKeyChromeForKey(key, text, rawX, rawY, localX, localY)
    if (!zeroLatency) {
      previewHandler.post { KeyboardInputBridge.playKeyTapSound() }
    }
    scheduleCompactIdleSync()
    return compactTyping
  }

  private fun previewIdForKey(key: NativeKey): Int =
      if (key.reactTag > 0) key.reactTag else key.id.hashCode()

  private fun showKeyChromeForKey(
      key: NativeKey,
      previewLabel: String,
      rawX: Float,
      rawY: Float,
      localX: Float,
      localY: Float,
  ) {
    if (zeroLatency || compactTyping) {
      return
    }
    val previewId = previewIdForKey(key)
    if (previewPressedEnabled && key.reactTag > 0) {
      KeyboardInputBridge.showKeyPressed(key.reactTag)
    }
    if (previewPopupEnabled) {
      val keyWidth = (key.right - key.left).coerceAtLeast(1f)
      val keyHeight = (key.bottom - key.top).coerceAtLeast(1f)
      // Keys are laid out in keys-area space; areaPage* matches native hit-test coords.
      val screenCenterX = areaPageX + key.centerX
      val screenKeyTop = areaPageY + key.top
      KeyboardInputBridge.showKeyPreviewAtTouch(
          previewId,
          screenCenterX,
          screenKeyTop,
          keyWidth,
          keyHeight,
          previewLabel,
      )
    }
  }

  private fun handlePointerUp(event: MotionEvent): Boolean {
    val pointerId = event.getPointerId(event.actionIndex)
    val session = sessions[pointerId]
    if (session?.key?.type == "backspace") {
      KeyboardInputBridge.stopCompactBackspaceRepeat()
    }
    if (!zeroLatency) {
      val sessionKey = session?.key
      if (sessionKey != null) {
        val previewId = previewIdForKey(sessionKey)
        if (previewPressedEnabled && sessionKey.reactTag > 0) {
          KeyboardInputBridge.hideKeyPressed(sessionKey.reactTag)
        }
        if (previewPopupEnabled) {
          val tagForHide = previewId
          previewHandler.postDelayed(
              { KeyboardInputBridge.hideKeyPreview(tagForHide) },
              120L,
          )
        }
      }
    }
    val blockReact = compactTyping && session != null
    val sessionCleanupDelayMs =
        if (zeroLatency || gamePerformance) 120L else 450L
    previewHandler.postDelayed({ sessions.remove(pointerId) }, sessionCleanupDelayMs)
    return blockReact
  }

  private fun handlePointerCancel(): Boolean {
    KeyboardInputBridge.stopCompactBackspaceRepeat()
    for (session in sessions.values) {
      val previewId = previewIdForKey(session.key)
      if (session.key.reactTag > 0) {
        if (previewPressedEnabled) {
          KeyboardInputBridge.hideKeyPressed(session.key.reactTag)
        }
      }
      if (previewPopupEnabled) {
        KeyboardInputBridge.hideKeyPreview(previewId)
      }
    }
    val blockReact = compactTyping && sessions.isNotEmpty()
    sessions.clear()
    synchronized(pendingJsCommitsLock) { pendingJsCommits.clear() }
    return blockReact
  }

  private fun parseKeys(array: JSONArray): List<NativeKey> {
    val parsed = mutableListOf<NativeKey>()
    for (index in 0 until array.length()) {
      val obj = array.optJSONObject(index) ?: continue
      val type = obj.optString("type", "char")
      var value = obj.optString("value", "")
      if (value.isEmpty()) {
        value =
            when (type) {
              "backspace" -> "\u232b"
              "space" -> " "
              "shift" -> "shift"
              "enter", "enter-backspace" -> "enter"
              "numbers" -> "123"
              "symbols" -> "sym"
              "letters" -> "abc"
              else -> ""
            }
      }
      if (value.isEmpty()) {
        continue
      }
      if (!compactTyping && (type == "comma" || type == "period" || type == "space")) {
        continue
      }
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

    return true
  }

  private fun shouldRunShiftEditorChord(text: String): Boolean {
    if (
        !shiftEditorShortcuts ||
            keyboardLayout != "letters" ||
            capsLocked ||
            text.length != 1
    ) {
      return false
    }
    if (EditorSelectionActions.actionForShiftLetter(text[0]) == null) {
      return false
    }
    return shiftEditorHeld
  }

  private fun pulseLandscapeAwareHaptic(pointerId: Int) {
    when {
      zeroLatency -> KeyboardInputBridge.performSubtleKeyHapticForPointer(pointerId)
      gamePerformance || compactTyping ->
          KeyboardInputBridge.performLightKeyHapticForPointer(pointerId)
      else -> KeyboardInputBridge.performKeyHapticForPointer(pointerId)
    }
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
