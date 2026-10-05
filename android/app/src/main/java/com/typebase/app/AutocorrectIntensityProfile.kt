package com.typebase.app

import kotlin.math.max

/** Mirrors src/keyboard/autocorrect/autocorrectIntensityProfile.ts (medium = legacy). */
object AutocorrectIntensityProfile {
  fun minAutoConfidence(intensity: String): Double =
      when (intensity) {
        "low" -> 0.7
        "high" -> 0.48
        else -> 0.55
      }

  fun minContextConfidenceBoundary(intensity: String): Double =
      when (intensity) {
        "low" -> 0.6
        "high" -> 0.46
        else -> 0.52
      }

  fun contextMinBigramOneEdit(intensity: String): Int =
      when (intensity) {
        "low" -> 4
        "high" -> 2
        else -> 3
      }

  fun contextOneEditScoreMargin(intensity: String): Int =
      when (intensity) {
        "low" -> 14
        "high" -> 6
        else -> 10
      }

  /** Matches JS contextThresholds(boundary = true). */
  fun contextMinBigramOneEditBoundary(intensity: String): Int =
      max(1, contextMinBigramOneEdit(intensity) - 1)

  fun contextOneEditScoreMarginBoundary(intensity: String): Int =
      max(4, contextOneEditScoreMargin(intensity) - 2)
}
