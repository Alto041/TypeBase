package com.typebase.app.billing

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Fast premium cache shared by the main app and IME service. */
object PremiumStore {
  private const val PREFS_NAME = "typebase_premium_secure"
  private const val KEY_PREMIUM = "premium"
  private const val KEY_PURCHASE_TOKEN = "purchase_token"
  private const val KEY_LAST_VERIFIED_AT = "last_verified_at"

  @JvmStatic
  fun setPremium(context: Context, premium: Boolean, purchaseToken: String? = null) {
    val editor =
        prefs(context)
            .edit()
            .putBoolean(KEY_PREMIUM, premium)
            .putLong(KEY_LAST_VERIFIED_AT, System.currentTimeMillis())
    if (purchaseToken != null) {
      editor.putString(KEY_PURCHASE_TOKEN, purchaseToken)
    }
    editor.apply()
  }

  @JvmStatic
  fun isPremium(context: Context): Boolean {
    return prefs(context).getBoolean(KEY_PREMIUM, false)
  }

  @JvmStatic
  fun getPurchaseToken(context: Context): String? {
    return prefs(context).getString(KEY_PURCHASE_TOKEN, null)
  }

  @JvmStatic
  fun clearPremium(context: Context) {
    prefs(context)
        .edit()
        .putBoolean(KEY_PREMIUM, false)
        .remove(KEY_PURCHASE_TOKEN)
        .putLong(KEY_LAST_VERIFIED_AT, System.currentTimeMillis())
        .apply()
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
