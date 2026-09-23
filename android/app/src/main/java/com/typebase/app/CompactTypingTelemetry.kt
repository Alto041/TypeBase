package com.typebase.app

import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject

/** Dev/engine stats counters for landscape compact typing session. */
object CompactTypingTelemetry {
  private val nativeCommits = AtomicInteger(0)
  private val reactTouchBlocks = AtomicInteger(0)
  private val fastPathConfigPublishes = AtomicInteger(0)
  private val layoutEpochBumps = AtomicInteger(0)
  private val compactStateSyncs = AtomicInteger(0)
  private val boundaryAutocorrectCalls = AtomicInteger(0)

  fun recordNativeCommit() {
    nativeCommits.incrementAndGet()
  }

  fun recordReactTouchBlocked() {
    reactTouchBlocks.incrementAndGet()
  }

  fun recordFastPathConfigPublish() {
    fastPathConfigPublishes.incrementAndGet()
  }

  fun recordLayoutEpochBump() {
    layoutEpochBumps.incrementAndGet()
  }

  fun recordCompactStateSync() {
    compactStateSyncs.incrementAndGet()
  }

  fun recordBoundaryAutocorrect() {
    boundaryAutocorrectCalls.incrementAndGet()
  }

  fun resetSessionCounters() {
    nativeCommits.set(0)
    reactTouchBlocks.set(0)
    fastPathConfigPublishes.set(0)
    layoutEpochBumps.set(0)
    compactStateSyncs.set(0)
    boundaryAutocorrectCalls.set(0)
  }

  fun toJson(): JSONObject =
      JSONObject()
          .put("nativeCommits", nativeCommits.get())
          .put("reactTouchBlocks", reactTouchBlocks.get())
          .put("fastPathConfigPublishes", fastPathConfigPublishes.get())
          .put("layoutEpochBumps", layoutEpochBumps.get())
          .put("compactStateSyncs", compactStateSyncs.get())
          .put("boundaryAutocorrectCalls", boundaryAutocorrectCalls.get())
}
