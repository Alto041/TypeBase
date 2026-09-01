package com.typebase.app

import android.content.Context
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Background prefix tracker + completion lookup for the live suggestion bar.
 * Runs off the JS thread so chips can appear even when React is busy.
 */
object NativeSuggestionBarEngine {
  private const val SUGGESTION_LIMIT = 8
  private const val MAX_PREFIX_LENGTH = 28

  private val generation = AtomicInteger(0)
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()

  @Volatile private var livePrefix: String = ""

  data class Snapshot(
      val prefix: String,
      val suggestions: List<String>,
      val generation: Int,
      val atMs: Long,
  )

  @Volatile private var latestSnapshot: Snapshot? = null

  fun preload(context: Context) {
    executor.execute { SwipeWordDictionary.ensureLoaded(context) }
  }

  fun syncPrefix(prefix: String) {
    val normalized = prefix.take(MAX_PREFIX_LENGTH)
    if (normalized == livePrefix && latestSnapshot != null) {
      return
    }
    livePrefix = normalized
    if (normalized.isEmpty()) {
      clearPrefix()
      return
    }
    scheduleCompute(normalized, KeyboardInputBridge.inputService?.applicationContext)
  }

  fun appendLetter(letter: String) {
    if (letter.length != 1 || !letter[0].isLetter()) {
      return
    }
    val next =
        (livePrefix + letter.lowercase()).take(MAX_PREFIX_LENGTH)
    livePrefix = next
    val context = KeyboardInputBridge.inputService?.applicationContext
    scheduleCompute(next, context)
  }

  fun clearPrefix() {
    livePrefix = ""
    val snapshot =
        Snapshot(
            prefix = "",
            suggestions = emptyList(),
            generation = generation.incrementAndGet(),
            atMs = System.currentTimeMillis(),
        )
    latestSnapshot = snapshot
    KeyboardInputBridge.notifyNativeSuggestionsUpdated(snapshot)
  }

  fun getLatestSnapshot(): Snapshot? = latestSnapshot

  private fun scheduleCompute(prefix: String, context: Context? = null) {
    val appContext = context?.applicationContext
    val runId = generation.incrementAndGet()
    executor.execute {
      val suggestions =
          if (appContext != null) {
            SwipeWordDictionary.getPrefixCompletions(appContext, prefix, SUGGESTION_LIMIT)
          } else {
            emptyList()
          }
      if (runId < generation.get()) {
        return@execute
      }
      val snapshot =
          Snapshot(
              prefix = prefix,
              suggestions = suggestions,
              generation = runId,
              atMs = System.currentTimeMillis(),
          )
      latestSnapshot = snapshot
      KeyboardInputBridge.notifyNativeSuggestionsUpdated(snapshot)
    }
  }
}
