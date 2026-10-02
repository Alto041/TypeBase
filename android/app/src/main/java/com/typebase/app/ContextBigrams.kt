package com.typebase.app

import android.content.Context
import org.json.JSONObject

/** Sentence bigram followers loaded from bundled english_bigrams.json. */
object ContextBigrams {
  private val loadLock = Any()

  @Volatile private var followerIndex: Map<String, Map<String, Int>>? = null

  fun ensureLoaded(context: Context) {
    if (followerIndex != null) {
      return
    }
    synchronized(loadLock) {
      if (followerIndex != null) {
        return
      }
      val map = HashMap<String, Map<String, Int>>(4096)
      context.assets.open("english_bigrams.json").bufferedReader().use { reader ->
        val root = JSONObject(reader.readText())
        val keys = root.keys()
        while (keys.hasNext()) {
          val previous = keys.next()
          val arr = root.getJSONArray(previous)
          val followers = HashMap<String, Int>(arr.length().coerceAtLeast(4))
          for (i in 0 until arr.length()) {
            val pair = arr.getJSONArray(i)
            followers[pair.getString(0)] = pair.getInt(1)
          }
          map[previous] = followers
        }
      }
      followerIndex = map
    }
  }

  fun followScore(context: Context, previousWord: String, nextWord: String): Int {
    ensureLoaded(context)
    val prev = previousWord.trim().lowercase()
    val next = nextWord.trim().lowercase()
    if (prev.isEmpty() || next.isEmpty()) {
      return 0
    }
    return followerIndex?.get(prev)?.get(next) ?: 0
  }

  /** Static table + words you actually type after `previousWord`. */
  fun combinedFollowScore(context: Context, previousWord: String, nextWord: String): Int {
    val static = followScore(context, previousWord, nextWord)
    val personal = PersonalContextMemory.followScore(context, previousWord, nextWord)
    if (personal <= 0) {
      return static
    }
    return static + personal * 3 + minOf(personal, 48)
  }

  fun topFollowers(context: Context, previousWord: String, limit: Int): List<Pair<String, Int>> {
    ensureLoaded(context)
    val prev = previousWord.trim().lowercase()
    if (prev.isEmpty()) {
      return emptyList()
    }
    val followers = followerIndex?.get(prev) ?: return emptyList()
    return followers.entries
        .sortedByDescending { it.value }
        .take(limit.coerceAtLeast(1))
        .map { it.key to it.value }
  }

  fun combinedTopFollowers(
      context: Context,
      previousWord: String,
      limit: Int,
  ): List<Pair<String, Int>> {
    val merged = HashMap<String, Int>()
    for ((word, score) in topFollowers(context, previousWord, limit * 2)) {
      merged[word] = score
    }
    for ((word, score) in PersonalContextMemory.topFollowers(context, previousWord, limit * 2)) {
      val personalBoost = score * 3 + minOf(score, 48)
      merged[word] = maxOf(merged[word] ?: 0, personalBoost)
    }
    return merged.entries
        .sortedByDescending { it.value }
        .take(limit.coerceAtLeast(1))
        .map { it.key to it.value }
  }
}
