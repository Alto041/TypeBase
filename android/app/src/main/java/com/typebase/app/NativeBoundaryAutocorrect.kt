package com.typebase.app

import android.content.Context

/** Applies native context correction on compact typing space boundary. */
object NativeBoundaryAutocorrect {
  fun applyContextOnSpace(
      context: Context,
      typedWord: String,
      previousWord: String,
  ): String? {
    val settings = NativeAutocorrectSettingsReader.read(context)
    if (!settings.enabled || !settings.autoApplyOnSpace || !settings.contextCorrectionEnabled) {
      return null
    }
    val typed = typedWord.trim()
    if (typed.length < 2) {
      return null
    }
    val minConfidence = AutocorrectIntensityProfile.minAutoConfidence(settings.intensity)

    NativeContextCorrectionEngine.suggestOnBoundary(
            context,
            typed,
            previousWord,
            settings.intensity,
        )
        ?.let { pick ->
          if (pick.confidence >= minConfidence && !pick.correction.equals(typed, ignoreCase = true)) {
            return pick.correction
          }
        }

    NativeTypoCorrectionEngine.suggestOnBoundary(
            context,
            typed,
            previousWord,
            settings.intensity,
        )
        ?.let { pick ->
          if (pick.confidence >= minConfidence && !pick.correction.equals(typed, ignoreCase = true)) {
            return pick.correction
          }
        }

    return null
  }
}
