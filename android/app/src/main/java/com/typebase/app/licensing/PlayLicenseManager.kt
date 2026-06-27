package com.typebase.app.licensing

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.google.android.vending.licensing.AESObfuscator
import com.google.android.vending.licensing.LicenseChecker
import com.google.android.vending.licensing.LicenseCheckerCallback
import com.google.android.vending.licensing.Policy
import com.typebase.app.BuildConfig

object PlayLicenseManager {
  private val mainHandler = Handler(Looper.getMainLooper())

  private val licenseSalt =
      byteArrayOf(
          0x4a.toByte(),
          0x2f.toByte(),
          0x8c.toByte(),
          0x11.toByte(),
          0x5e.toByte(),
          0x93.toByte(),
          0x27.toByte(),
          0x6b.toByte(),
          0x1d.toByte(),
          0x44.toByte(),
          0x9a.toByte(),
          0x0f.toByte(),
          0x73.toByte(),
          0xb8.toByte(),
          0x25.toByte(),
          0x61.toByte(),
          0xc3.toByte(),
          0x07.toByte(),
          0xde.toByte(),
          0x52.toByte(),
      )

  fun isLicensedCached(context: Context): Boolean {
    if (BuildConfig.DEBUG) {
      return true
    }
    return PlayLicenseStore.isLicensed(context)
  }

  fun ensureLicensed(context: Context, callback: (String) -> Unit) {
    if (BuildConfig.DEBUG) {
      callback("licensed")
      return
    }

    if (PlayLicenseStore.isLicensed(context)) {
      callback("licensed")
      return
    }

    val publicKey = BuildConfig.PLAY_LICENSE_PUBLIC_KEY.trim()
    if (publicKey.isEmpty()) {
      callback("needs_network")
      return
    }

    val appContext = context.applicationContext
    val deviceId =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown_device"
    val obfuscator = AESObfuscator(licenseSalt, appContext.packageName, deviceId)
    val policy = FirstInstallPolicy(appContext, obfuscator)
    val checker = LicenseChecker(appContext, policy, publicKey)

    checker.checkAccess(
        object : LicenseCheckerCallback {
          override fun allow(reason: Int) {
            PlayLicenseStore.setLicensed(appContext, true)
            deliver(callback, "licensed")
          }

          override fun dontAllow(reason: Int) {
            PlayLicenseStore.setLicensed(appContext, false)
            deliver(callback, "unlicensed")
          }

          override fun applicationError(errorCode: Int) {
            deliver(callback, "needs_network")
          }
        },
    )
  }

  fun openPlayStoreListing(context: Context) {
    val appContext = context.applicationContext
    val deviceId =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown_device"
    val obfuscator = AESObfuscator(licenseSalt, appContext.packageName, deviceId)
    val policy = FirstInstallPolicy(appContext, obfuscator)
    val publicKey = BuildConfig.PLAY_LICENSE_PUBLIC_KEY.trim()
    if (publicKey.isEmpty()) {
      return
    }
    val checker = LicenseChecker(appContext, policy, publicKey)
    checker.followLastLicensingUrl(appContext)
  }

  private fun deliver(callback: (String) -> Unit, result: String) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      callback(result)
    } else {
      mainHandler.post { callback(result) }
    }
  }
}
