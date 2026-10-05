package com.typebase.app

import android.content.Context
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Fast sentence-context typo picker for compact typing (space boundary).
 * Logic aligned with JS contextCorrectionEngine, with stricter 1-edit gates so common
 * word swaps (think/thing, trial/trail) need real bigram support.
 */
object NativeContextCorrectionEngine {
  private const val MAX_SYMSPELL = 8
  private const val MAX_BIGRAM_SEEDS = 16
  /** Mirrors JS contextCorrectionEngine — only ultra-common words skip context fixes. */
  private const val PROTECTED_RANK = 1_200

  data class Candidate(val correction: String, val confidence: Double)

  private data class ScoredRunner(
      val word: String,
      val rawScore: Double,
      val bigram: Int,
      val edits: Int,
  )

  fun suggestOnBoundary(
      context: Context,
      typedWord: String,
      previousWord: String,
      intensity: String,
  ): Candidate? {
    val typed = typedWord.trim()
    val typedLower = typed.lowercase()
    if (typedLower.length < 2 || !typedLower.all { it in 'a'..'z' }) {
      return null
    }
    SwipeWordDictionary.ensureLoaded(context)
    if (isProtectedKnownWord(typedLower)) {
      return null
    }
    val prev = previousWord.trim().lowercase()
    if (prev.isEmpty()) {
      return null
    }

    val maxEdits = maxEditDistance(typedLower.length)
    val candidates = gatherCandidates(context, typedLower, prev, maxEdits, intensity)
    if (candidates.isEmpty()) {
      return null
    }

    val runners = ArrayList<ScoredRunner>(candidates.size)
    for ((word, edits) in candidates) {
      val scored = scoreCandidate(context, prev, word, edits)
      runners.add(
          ScoredRunner(
              word = word,
              rawScore = scored.first,
              bigram = scored.second,
              edits = edits,
          ),
      )
    }
    runners.sortByDescending { it.rawScore }

    val minBigramOneEdit =
        AutocorrectIntensityProfile.contextMinBigramOneEditBoundary(intensity)
    val oneEditScoreMargin =
        AutocorrectIntensityProfile.contextOneEditScoreMarginBoundary(intensity)

    val best = runners.firstOrNull() ?: return null
    val second = runners.getOrNull(1)
    if (best.edits == 1) {
      if (best.bigram < minBigramOneEdit) {
        return null
      }
      if (second != null && best.rawScore - second.rawScore < oneEditScoreMargin) {
        return null
      }
    }

    val confidence = toConfidence(best.rawScore, best.edits, intensity)
    if (confidence <= 0.0) {
      return null
    }
    return Candidate(
        correction = applyCaseToWord(best.word, typed),
        confidence = confidence,
    )
  }

  private fun isProtectedKnownWord(lower: String): Boolean {
    val rank = SwipeWordDictionary.getWordRank(lower)
    return rank != null && rank < PROTECTED_RANK
  }

  private fun maxEditDistance(length: Int): Int =
      when {
        length <= 3 -> 1
        length <= 5 -> 2
        else -> 3
      }

  private fun gatherCandidates(
      context: Context,
      typedLower: String,
      previousWord: String,
      maxEdits: Int,
      intensity: String,
  ): Map<String, Int> {
    val out = LinkedHashMap<String, Int>()
    fun add(word: String, edits: Int) {
      val lower = word.lowercase()
      if (lower.isEmpty() || lower == typedLower) {
        return
      }
      if (!lower.all { it in 'a'..'z' }) {
        return
      }
      val existing = out[lower]
      if (existing == null || edits < existing) {
        out[lower] = edits
      }
    }

    for ((word, score) in ContextBigrams.combinedTopFollowers(context, previousWord, MAX_BIGRAM_SEEDS)) {
      if (abs(word.length - typedLower.length) > maxEdits) {
        continue
      }
      val edits = levenshtein(typedLower, word)
      if (edits in 1..maxEdits) {
        add(word, edits)
      }
    }

    val minBigramOneEdit =
        AutocorrectIntensityProfile.contextMinBigramOneEditBoundary(intensity)
    for ((word, edits) in SwipeWordDictionary.findEditDistanceCandidates(context, typedLower, maxEdits, MAX_SYMSPELL)) {
      val bigram = ContextBigrams.combinedFollowScore(context, previousWord, word)
      if (edits == 1 && bigram < minBigramOneEdit) {
        continue
      }
      if (edits >= 2 && bigram <= 0) {
        continue
      }
      add(word, edits)
    }

    return out
  }

  private fun scoreCandidate(
      context: Context,
      previousWord: String,
      candidate: String,
      edits: Int,
  ): Pair<Double, Int> {
    val bigram = ContextBigrams.combinedFollowScore(context, previousWord, candidate)
    var score = bigram * 3.2
    if (edits == 1) {
      score += 10.0
    } else if (edits == 2) {
      score += 6.0
    }
    score -= edits * 6.0
    val rank = SwipeWordDictionary.getWordRank(candidate) ?: Int.MAX_VALUE
    if (rank < 4000) {
      score += 2.0
    }
    return score to bigram
  }

  private fun toConfidence(rawScore: Double, edits: Int, intensity: String): Double {
    if (rawScore <= 0.0) {
      return 0.0
    }
    val normalized = min(1.0, rawScore / 120.0)
    var confidence = 0.52 + normalized * 0.4
    if (edits == 1) {
      confidence += 0.06
    } else if (edits >= 3) {
      confidence -= 0.08
    }
    confidence = max(0.0, min(0.97, confidence))
    val min = AutocorrectIntensityProfile.minContextConfidenceBoundary(intensity)
    return if (confidence >= min) confidence else 0.0
  }

  private fun levenshtein(a: String, b: String): Int {
    if (a == b) {
      return 0
    }
    if (a.isEmpty()) {
      return b.length
    }
    if (b.isEmpty()) {
      return a.length
    }
    if (abs(a.length - b.length) > 3) {
      return 99
    }
    val row = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
      var previous = i - 1
      row[0] = i
      for (j in 1..b.length) {
        val temp = row[j]
        val cost = if (a[i - 1] == b[j - 1]) 0 else 1
        row[j] = min(min(row[j] + 1, row[j - 1] + 1), previous + cost)
        previous = temp
      }
    }
    return row[b.length]
  }

  private fun applyCaseToWord(word: String, typed: String): String {
    if (typed.isEmpty() || word.isEmpty()) {
      return word
    }
    if (typed.all { it.isUpperCase() }) {
      return word.uppercase()
    }
    if (typed[0].isUpperCase()) {
      return word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
    return word
  }
}
