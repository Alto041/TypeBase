package com.typebase.app

import android.content.Context
import org.json.JSONObject

data class NativeAutocorrectSettings(
    val enabled: Boolean,
    val autoApplyOnSpace: Boolean,
    val contextCorrectionEnabled: Boolean,
    val intensity: String,
)

object NativeAutocorrectSettingsReader {
  private const val PREFS = "typebase_keyboard"
  private const val KEY = "autocorrect_settings"
  private const val DEFAULT =
      """{"enabled":true,"autoApplyOnSpace":true,"contextCorrectionEnabled":true,"intensity":"medium"}"""

  fun read(context: Context): NativeAutocorrectSettings {
    val raw =
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, DEFAULT)
            ?: DEFAULT
    return try {
      val obj = JSONObject(raw)
      NativeAutocorrectSettings(
          enabled = obj.optBoolean("enabled", true),
          autoApplyOnSpace = obj.optBoolean("autoApplyOnSpace", true),
          contextCorrectionEnabled = obj.optBoolean("contextCorrectionEnabled", true),
          intensity = obj.optString("intensity", "medium"),
      )
    } catch (_: Exception) {
      NativeAutocorrectSettings(
          enabled = true,
          autoApplyOnSpace = true,
          contextCorrectionEnabled = true,
          intensity = "medium",
      )
    }
  }
}
