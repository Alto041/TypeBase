package com.typebase.app

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

object SwipeWordDictionary {
  private const val LEARNED_WORDS_KEY = "learned_words"

  @Volatile private var loaded = false
  private val loadLock = Any()

  private val words = ArrayList<String>(10_000)
  private val staticRank = HashMap<String, Int>(10_000)

  fun ensureLoaded(context: Context) {
    if (loaded) {
      return
    }
    synchronized(loadLock) {
      if (loaded) {
        return
      }
      context.assets.open("english_words.txt").bufferedReader().useLines { lines ->
        for (line in lines) {
          val word = line.trim().lowercase()
          if (word.length !in 2..16) {
            continue
          }
          if (!word.all { it in 'a'..'z' }) {
            continue
          }
          val rank = words.size
          words.add(word)
          staticRank[word] = rank
        }
      }
      loaded = true
    }
  }

  fun isKnownWord(word: String): Boolean =
    staticRank.containsKey(word.trim().lowercase())

  fun getSwipeCandidates(
    context: Context,
    prefs: SharedPreferences,
    pattern: String,
    maxCandidates: Int,
  ): WritableArray {
    ensureLoaded(context)

    val normalized = pattern.lowercase()
    if (normalized.isEmpty() || normalized[0] !in 'a'..'z') {
      return Arguments.createArray()
    }

    val first = normalized[0]
    val maxEdits = traceEditBudget(normalized)
    val seen = HashSet<String>()
    val results = ArrayList<Pair<String, Int>>()

    fun push(word: String, rank: Int): Boolean {
      if (!seen.add(word)) {
        return false
      }
      if (word.length !in 2..16) {
        return false
      }
      if (!wordMatchesTrace(word, normalized, maxEdits)) {
        return false
      }
      results.add(word to rank)
      return results.size >= maxCandidates
    }

    val learned = readLearnedWords(prefs)
    val learnedByCount =
        learned.entries
            .asSequence()
            .filter { (word, count) -> count > 0 && word.isNotEmpty() && word[0] == first }
            .sortedByDescending { it.value }
            .toList()

    for ((word, count) in learnedByCount) {
      val static = staticRank[word]
      val rank =
          if (static != null) {
            max(0, static - learnedRankBoost(count))
          } else {
            max(0, 2500 - learnedRankBoost(count))
          }
      if (push(word, rank)) {
        return toWritableArray(results)
      }
    }

    for (rank in words.indices) {
      val word = words[rank]
      if (word[0] != first) {
        continue
      }
      if (push(word, rank)) {
        break
      }
    }

    return toWritableArray(results)
  }

  private fun toWritableArray(results: List<Pair<String, Int>>): WritableArray {
    val array = Arguments.createArray()
    for ((word, rank) in results) {
      val map = Arguments.createMap()
      map.putString("word", word)
      map.putInt("rank", rank)
      array.pushMap(map)
    }
    return array
  }

  private fun readLearnedWords(prefs: SharedPreferences): Map<String, Int> {
    val raw = prefs.getString(LEARNED_WORDS_KEY, "{}") ?: "{}"
    val json = JSONObject(raw)
    val result = HashMap<String, Int>()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val count = json.optInt(key, 0)
      if (count > 0) {
        result[key] = count
      }
    }
    return result
  }

  private fun learnedRankBoost(uses: Int): Int {
    if (uses <= 0) {
      return 0
    }
    return min(uses * 80, 4000)
  }

  private fun traceEditBudget(trace: String): Int =
      when {
        trace.length <= 3 -> 1
        trace.length <= 5 -> 2
        trace.length <= 8 -> 3
        else -> min(7, max(3, trace.length / 2))
      }

  private fun wordMatchesTrace(word: String, trace: String, maxEdits: Int): Boolean {
    if (isPatternSubsequence(word, trace)) {
      return true
    }
    return fuzzyMatchesPattern(word, trace, maxEdits)
  }

  private fun isPatternSubsequence(pattern: String, word: String): Boolean {
    if (pattern.isEmpty()) {
      return true
    }
    var patternIndex = 0
    for (char in word) {
      if (char == pattern[patternIndex]) {
        patternIndex += 1
        if (patternIndex == pattern.length) {
          return true
        }
      }
    }
    return false
  }

  private fun fuzzyMatchesPattern(pattern: String, word: String, maxEdits: Int): Boolean {
    if (isPatternSubsequence(pattern, word)) {
      return true
    }

    val rows = pattern.length + 1
    val cols = word.length + 1
    val dp = IntArray(cols)
    for (j in 0 until cols) {
      dp[j] = j
    }

    for (i in 1 until rows) {
      var prev = dp[0]
      dp[0] = i
      for (j in 1 until cols) {
        val temp = dp[j]
        val cost = if (pattern[i - 1] == word[j - 1]) 0 else 1
        dp[j] =
            min(
                min(dp[j] + 1, dp[j - 1] + 1),
                prev + cost,
            )
        prev = temp
      }
    }

    return dp[word.length] <= maxEdits
  }
}
