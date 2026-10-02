package com.typebase.app

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
}
