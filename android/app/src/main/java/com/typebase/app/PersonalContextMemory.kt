package com.typebase.app

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Learns which words follow which from typing (compact native space + JS sync).
 * Merged with static [ContextBigrams] at correction time.
 */
object PersonalContextMemory {
  private const val PREFS = "typebase_keyboard"
  private const val KEY = "context_word_follows_v1"
  private const val MAX_PREV_WORDS = 1800
  private const val MAX_FOLLOWERS_PER_PREV = 28

  private val followersByPrevious = ConcurrentHashMap<String, MutableMap<String, Int>>()

  @Volatile private var loaded = false

  fun ensureLoaded(context: Context) {
    if (loaded) {
      return
    }
    synchronized(this) {
      if (loaded) {
        return
      }
      loadFromPrefs(context.applicationContext)
      loaded = true
    }
  }

  fun recordFollow(context: Context, previousWord: String, nextWord: String) {
    val prev = previousWord.trim().lowercase()
    val next = nextWord.trim().lowercase()
    if (prev.length < 1 || next.length < 2) {
      return
    }
    if (!prev.all { it in 'a'..'z' } || !next.all { it in 'a'..'z' }) {
      return
    }
    ensureLoaded(context)
    val bucket =
        followersByPrevious.getOrPut(prev) { ConcurrentHashMap<String, Int>() }
    val nextCount = (bucket[next] ?: 0) + 1
    bucket[next] = nextCount
    trimFollowers(bucket)
    trimPreviousWords()
    schedulePersist(context.applicationContext)
  }

  fun followScore(context: Context, previousWord: String, nextWord: String): Int {
    ensureLoaded(context)
    val prev = previousWord.trim().lowercase()
    val next = nextWord.trim().lowercase()
    if (prev.isEmpty() || next.isEmpty()) {
      return 0
    }
    return followersByPrevious[prev]?.get(next) ?: 0
  }

  fun topFollowers(context: Context, previousWord: String, limit: Int): List<Pair<String, Int>> {
    ensureLoaded(context)
    val prev = previousWord.trim().lowercase()
    if (prev.isEmpty()) {
      return emptyList()
    }
    val bucket = followersByPrevious[prev] ?: return emptyList()
    return bucket.entries
        .sortedByDescending { it.value }
        .take(limit.coerceAtLeast(1))
        .map { it.key to it.value }
  }

  /** Merge follows exported from the JS personal typing profile. */
  fun mergeFromProfileJson(context: Context, profileJson: String) {
    if (profileJson.isBlank()) {
      return
    }
    ensureLoaded(context)
    try {
      val root = JSONObject(profileJson)
      val follows = root.optJSONObject("follows") ?: return
      val keys = follows.keys()
      while (keys.hasNext()) {
        val prev = keys.next().trim().lowercase()
        if (prev.isEmpty()) {
          continue
        }
        val nextObj = follows.optJSONObject(prev) ?: continue
        val bucket =
            followersByPrevious.getOrPut(prev) { ConcurrentHashMap<String, Int>() }
        val nextKeys = nextObj.keys()
        while (nextKeys.hasNext()) {
          val next = nextKeys.next().trim().lowercase()
          if (next.isEmpty()) {
            continue
          }
          val entry = nextObj.optJSONObject(next) ?: continue
          val uses = entry.optInt("uses", 0).coerceAtLeast(0)
          if (uses <= 0) {
            continue
          }
          val scaled = (uses * (0.35 + entry.optDouble("confidence", 0.25) * 0.65) * 12)
              .toInt()
              .coerceAtLeast(1)
          bucket[next] = maxOf(bucket[next] ?: 0, scaled)
        }
        trimFollowers(bucket)
      }
      trimPreviousWords()
      schedulePersist(context.applicationContext)
    } catch (_: Exception) {
      // Ignore malformed profile payloads.
    }
  }

  fun clear(context: Context) {
    followersByPrevious.clear()
    context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY)
        .apply()
    loaded = true
  }

  private fun loadFromPrefs(context: Context) {
    followersByPrevious.clear()
    val raw =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
            ?: return
    try {
      val root = JSONObject(raw)
      val keys = root.keys()
      while (keys.hasNext()) {
        val prev = keys.next()
        val nextObj = root.optJSONObject(prev) ?: continue
        val bucket = ConcurrentHashMap<String, Int>()
        val nextKeys = nextObj.keys()
        while (nextKeys.hasNext()) {
          val next = nextKeys.next()
          bucket[next] = nextObj.optInt(next, 0)
        }
        if (bucket.isNotEmpty()) {
          followersByPrevious[prev] = bucket
        }
      }
    } catch (_: Exception) {
      followersByPrevious.clear()
    }
  }

  @Volatile private var persistPosted = false

  private fun schedulePersist(context: Context) {
    if (persistPosted) {
      return
    }
    persistPosted = true
    Thread {
      try {
        val root = JSONObject()
        for ((prev, bucket) in followersByPrevious) {
          val nextObj = JSONObject()
          for ((next, score) in bucket) {
            nextObj.put(next, score)
          }
          root.put(prev, nextObj)
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, root.toString()).apply()
      } finally {
        persistPosted = false
      }
    }
        .start()
  }

  private fun trimFollowers(bucket: MutableMap<String, Int>) {
    if (bucket.size <= MAX_FOLLOWERS_PER_PREV) {
      return
    }
    val keep =
        bucket.entries.sortedByDescending { it.value }.take(MAX_FOLLOWERS_PER_PREV).map { it.key }
    bucket.keys.retainAll(keep.toSet())
  }

  private fun trimPreviousWords() {
    if (followersByPrevious.size <= MAX_PREV_WORDS) {
      return
    }
    val keep =
        followersByPrevious.entries
            .sortedByDescending { entry -> entry.value.values.sum() }
            .take(MAX_PREV_WORDS)
            .map { it.key }
    followersByPrevious.keys.retainAll(keep.toSet())
  }
}
