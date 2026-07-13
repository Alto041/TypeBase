package com.typebase.app.licensing

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
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

  /**
   * Fast gate for UI / IME. Allows Play-installed copies even before the first
   * successful LVL response so reviewers and legit users are never locked out
   * by transient verification failures.
   */
  fun canUseApp(context: Context): Boolean {
    if (BuildConfig.DEBUG) {
      return true
    }
    if (PlayLicenseStore.isLicensed(context)) {
      return true
    }
    // Hard-locked sideload: cache says unlicensed and installer is not Play.
    if (PlayLicenseStore.isUnlicensed(context) && !isInstalledFromPlay(context)) {
      return false
    }
    return isInstalledFromPlay(context)
  }

  fun isLicensedCached(context: Context): Boolean {
    if (BuildConfig.DEBUG) {
      return true
    }
    return PlayLicenseStore.isLicensed(context) || canUseApp(context)
  }

  fun ensureLicensed(context: Context, callback: (String) -> Unit) {
    if (BuildConfig.DEBUG) {
      callback("licensed")
      return
    }

    val appContext = context.applicationContext
    val fromPlay = isInstalledFromPlay(appContext)

    if (PlayLicenseStore.isLicensed(appContext)) {
      callback("licensed")
      return
    }

    // Play installs open immediately; verify in the background when possible.
    if (fromPlay) {
      deliver(callback, "licensed")
      runLicenseCheck(appContext, provisionalPlayInstall = true, callback = null)
      return
    }

    // Sideload with a prior definitive NOT_LICENSED stays locked.
    if (PlayLicenseStore.isUnlicensed(appContext)) {
      deliver(callback, "unlicensed")
      return
    }

    val publicKey = BuildConfig.PLAY_LICENSE_PUBLIC_KEY.trim()
    if (publicKey.isEmpty()) {
      // Soft-fail: do not hard-lock when key is missing from a build.
      deliver(callback, "licensed")
      return
    }

    runLicenseCheck(appContext, provisionalPlayInstall = false, callback)
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

  fun isInstalledFromPlay(context: Context): Boolean {
    val installer = installerPackageName(context) ?: return false
    return installer == "com.android.vending" ||
        installer == "com.google.android.feedback" ||
        installer == "com.android.vending.billing.test"
  }

  private fun runLicenseCheck(
      appContext: Context,
      provisionalPlayInstall: Boolean,
      callback: ((String) -> Unit)?,
  ) {
    val publicKey = BuildConfig.PLAY_LICENSE_PUBLIC_KEY.trim()
    if (publicKey.isEmpty()) {
      if (callback != null) {
        deliver(callback, "licensed")
      }
      return
    }

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
            PlayLicenseStore.clearUnlicensed(appContext)
            if (callback != null) {
              deliver(callback, "licensed")
            }
          }

          override fun dontAllow(reason: Int) {
            if (reason == Policy.RETRY) {
              // Transient — keep provisional Play access; do not gate.
              if (callback != null) {
                deliver(callback, "licensed")
              }
              return
            }

            // Definitive NOT_LICENSED.
            if (provisionalPlayInstall || isInstalledFromPlay(appContext)) {
              // Play installs keep working (review / account edge cases).
              if (callback != null) {
                deliver(callback, "licensed")
              }
              return
            }

            PlayLicenseStore.setLicensed(appContext, false)
            PlayLicenseStore.setUnlicensed(appContext, true)
            if (callback != null) {
              deliver(callback, "unlicensed")
            }
          }

          override fun applicationError(errorCode: Int) {
            // Soft-fail: never hard-lock on LVL bind/network/permission errors.
            if (callback != null) {
              deliver(callback, "licensed")
            }
          }
        },
    )
  }

  private fun installerPackageName(context: Context): String? {
    return try {
      val pm = context.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        pm.getInstallSourceInfo(context.packageName).installingPackageName
      } else {
        @Suppress("DEPRECATION")
        pm.getInstallerPackageName(context.packageName)
      }
    } catch (_: PackageManager.NameNotFoundException) {
      null
    } catch (_: Exception) {
      null
    }
  }

  private fun deliver(callback: (String) -> Unit, result: String) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      callback(result)
    } else {
      mainHandler.post { callback(result) }
    }
  }
}
