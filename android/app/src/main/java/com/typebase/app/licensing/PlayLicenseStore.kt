package com.typebase.app.licensing

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Fast license cache shared by the main app and IME service. */
object PlayLicenseStore {
  private const val PREFS_NAME = "typebase_license_secure"
  private const val KEY_LICENSED = "licensed"

  @JvmStatic
  fun setLicensed(context: Context, licensed: Boolean) {
    prefs(context).edit().putBoolean(KEY_LICENSED, licensed).apply()
  }

  @JvmStatic
  fun isLicensed(context: Context): Boolean {
    return prefs(context).getBoolean(KEY_LICENSED, false)
  }

  private fun prefs(context: Context) =
      EncryptedSharedPreferences.create(
          context,
          PREFS_NAME,
          MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
      )
}
