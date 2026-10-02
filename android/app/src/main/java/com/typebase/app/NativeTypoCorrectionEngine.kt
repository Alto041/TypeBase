package com.typebase.app

import android.content.Context
import kotlin.math.min

/** Bigram-gated SymSpell-style boundary fixes (blocks thik→this after "the"). */
object NativeTypoCorrectionEngine {
  private const val MAX_CANDIDATES = 12
  private const val MIN_BIGRAM_ONE_EDIT = 4
  private const val BIGRAM_WEIGHT = 120
  private const val PROTECTED_RANK = 20_000

  data class Candidate(val correction: String, val confidence: Double)

  fun suggestOnBoundary(
      context: Context,
      typedWord: String,
      previousWord: String,
      intensity: String,
  ): Candidate? {
    val typed = typedWord.trim()
    val typedLower = typed.lowercase()
    val prev = previousWord.trim().lowercase()
    if (typedLower.length < 2 || prev.isEmpty()) {
      return null
    }
    if (!typedLower.all { it in 'a'..'z' }) {
      return null
    }
    SwipeWordDictionary.ensureLoaded(context)
    val rank = SwipeWordDictionary.getWordRank(typedLower)
    if (rank != null && rank < PROTECTED_RANK) {
      return null
    }

    val maxEdits =
        when {
          typedLower.length <= 3 -> 1
          typedLower.length <= 5 -> 2
          else -> 2
        }
    val matches =
        SwipeWordDictionary.findEditDistanceCandidates(
            context,
            typedLower,
            maxEdits,
            MAX_CANDIDATES,
        )
    if (matches.isEmpty()) {
      return null
    }

    var bestWord: String? = null
    var bestScore = Int.MAX_VALUE
    var bestEdits = 99

    for ((word, edits) in matches) {
      if (!boundaryOneEditAllowed(context, prev, typedLower, word, edits)) {
        continue
      }
      val wordRank = SwipeWordDictionary.getWordRank(word) ?: Int.MAX_VALUE
      val prefix = sharedPrefixLength(typedLower, word)
      val bigram = ContextBigrams.combinedFollowScore(context, prev, word)
      val score = wordRank + edits * 2_000 - prefix * 800 - bigram * BIGRAM_WEIGHT
      if (score < bestScore || (score == bestScore && edits < bestEdits)) {
        bestScore = score
        bestWord = word
        bestEdits = edits
      }
    }

    val pick = bestWord ?: return null
    if (pick.equals(typedLower, ignoreCase = true)) {
      return null
    }

    val confidence =
        when {
          bestEdits == 1 && ContextBigrams.combinedFollowScore(context, prev, pick) >= 40 -> 0.92
          bestEdits == 1 -> 0.86
          else -> 0.82
        }
    if (confidence < AutocorrectIntensityProfile.minAutoConfidence(intensity)) {
      return null
    }
    return Candidate(
        correction = applyCaseToWord(pick, typed),
        confidence = confidence,
    )
  }

  private fun boundaryOneEditAllowed(
      context: Context,
      previousWord: String,
      typed: String,
      candidate: String,
      edits: Int,
  ): Boolean {
    if (edits != 1) {
      return true
    }
    val bigram = ContextBigrams.combinedFollowScore(context, previousWord, candidate)
    if (bigram >= MIN_BIGRAM_ONE_EDIT) {
      return true
    }
    if (isAdjacentTransposition(typed, candidate)) {
      return true
    }
    if (
        typed.length >= 3 &&
            candidate.length >= 3 &&
            typed.substring(1) == candidate.substring(1)
    ) {
      val rank = SwipeWordDictionary.getWordRank(candidate) ?: Int.MAX_VALUE
      if (rank < 4000) {
        return true
      }
    }
    return false
  }

  private fun isAdjacentTransposition(a: String, b: String): Boolean {
    if (a.length != b.length || a.length < 2) {
      return false
    }
    var mismatches = 0
    var swapA = -1
    var swapB = -1
    for (i in a.indices) {
      if (a[i] == b[i]) {
        continue
      }
      mismatches += 1
      if (swapA < 0) {
        swapA = i
      } else if (swapB < 0) {
        swapB = i
      } else {
        return false
      }
    }
    if (mismatches != 2 || swapB != swapA + 1) {
      return false
    }
    return a[swapA] == b[swapB] && a[swapB] == b[swapA]
  }

  private fun sharedPrefixLength(a: String, b: String): Int {
    val limit = min(a.length, b.length)
    var count = 0
    while (count < limit && a[count] == b[count]) {
      count += 1
    }
    return count
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
