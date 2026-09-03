package com.typebase.app

import kotlin.math.abs

/**
 * Native touchpad engine for handling gesture processing with minimal JS overhead.
 * Buffers cursor movements and emits batched updates to reduce bridge traffic.
 */
class NativeTouchpadEngine {
  private val TRACKPAD_STEP_PX_HORIZONTAL = 12
  private val TRACKPAD_STEP_PX_VERTICAL = 40
  private val HAPTIC_THROTTLE_MS = 80L // Only haptic every 80ms during continuous drag

  companion object {
    const val ACTION_DOWN = 0
    const val ACTION_UP = 1
    const val ACTION_MOVE = 2
    const val ACTION_CANCEL = 3
  }
  
  private var accumX = 0f
  private var accumY = 0f
  private var lastX = 0f
  private var lastY = 0f
  
  private var selectMode = false
  private var gestureActive = false
  private var lastHapticTimeMs = 0L
  
  // Buffered movements to emit to JS
  private var pendingMoves = mutableListOf<CursorMove>()
  
  data class CursorMove(
    val direction: String,
    val count: Int = 1
  )
  
  data class GestureSnapshot(
    val moves: List<CursorMove>,
    val selectMode: Boolean,
    val gestureEnded: Boolean
  )
  
  /**
   * Process a touchpad gesture from JS coordinates.
   */
  fun processGesture(action: Int, x: Float, y: Float, selectModeFromJs: Boolean): Boolean {
    selectMode = selectModeFromJs

    when (action) {
      ACTION_DOWN -> {
        gestureActive = true
        accumX = 0f
        accumY = 0f
        lastX = x
        lastY = y
        pendingMoves.clear()
        lastHapticTimeMs = System.currentTimeMillis()
      }

      ACTION_MOVE -> {
        if (!gestureActive) return false

        val deltaX = x - lastX
        val deltaY = y - lastY
        lastX = x
        lastY = y

        accumX += deltaX
        accumY += deltaY

        while (shouldStepHorizontal() || shouldStepVertical()) {
          val direction = stepCursor() ?: break
          enqueueMove(direction)

          val now = System.currentTimeMillis()
          if (now - lastHapticTimeMs >= HAPTIC_THROTTLE_MS) {
            lastHapticTimeMs = now
          }
        }
      }

      ACTION_UP, ACTION_CANCEL -> {
        gestureActive = false
        accumX = 0f
        accumY = 0f
      }
    }

    return gestureActive || pendingMoves.isNotEmpty()
  }

  private fun enqueueMove(direction: String) {
    if (pendingMoves.isNotEmpty() && pendingMoves.last().direction == direction) {
      val last = pendingMoves.last()
      pendingMoves[pendingMoves.size - 1] = CursorMove(direction, last.count + 1)
    } else {
      pendingMoves.add(CursorMove(direction, 1))
    }
  }
  
  private fun shouldStepHorizontal(): Boolean {
    return abs(accumX) >= TRACKPAD_STEP_PX_HORIZONTAL
  }
  
  private fun shouldStepVertical(): Boolean {
    val verticalDominant = abs(accumY) >= abs(accumX)
    return verticalDominant && abs(accumY) >= TRACKPAD_STEP_PX_VERTICAL
  }
  
  private fun stepCursor(): String? {
    val horizontalDominant = abs(accumX) >= abs(accumY)
    
    return if (horizontalDominant && abs(accumX) >= TRACKPAD_STEP_PX_HORIZONTAL) {
      val step = if (accumX > 0) 1 else -1
      accumX -= step * TRACKPAD_STEP_PX_HORIZONTAL
      if (step > 0) "right" else "left"
    } else if (abs(accumY) >= TRACKPAD_STEP_PX_VERTICAL) {
      val step = if (accumY > 0) 1 else -1
      accumY -= step * TRACKPAD_STEP_PX_VERTICAL
      if (step > 0) "down" else "up"
    } else {
      null
    }
  }
  
  /**
   * Poll and consume buffered cursor movements.
   * Returns a snapshot of pending moves with metadata.
   */
  fun pollPendingMoves(shouldFireHaptic: Boolean): GestureSnapshot {
    val moves = pendingMoves.toList()
    val gestureEnded = !gestureActive && moves.isNotEmpty()
    
    pendingMoves.clear()
    
    // Reset haptic timer if gesture ended
    if (gestureEnded) {
      lastHapticTimeMs = 0L
    }
    
    return GestureSnapshot(
      moves = moves,
      selectMode = selectMode,
      gestureEnded = gestureEnded
    )
  }
  
  fun setSelectMode(active: Boolean) {
    selectMode = active
  }
  
  fun isGestureActive(): Boolean = gestureActive
  
  fun hasPendingMoves(): Boolean = pendingMoves.isNotEmpty()
  
  fun reset() {
    accumX = 0f
    accumY = 0f
    lastX = 0f
    lastY = 0f
    gestureActive = false
    selectMode = false
    pendingMoves.clear()
    lastHapticTimeMs = 0L
  }
}
