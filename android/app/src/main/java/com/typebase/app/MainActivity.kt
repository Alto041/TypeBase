package com.typebase.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    normalizeDevLauncherUrl(intent)
    super.onCreate(null)
    if (intent?.getBooleanExtra(EXTRA_REQUEST_MIC, false) == true) {
      requestMicPermissionIfNeeded()
    }
    if (intent?.getBooleanExtra(EXTRA_REQUEST_MEDIA_IMAGES, false) == true) {
      requestMediaImagesPermissionIfNeeded()
    }
  }

  override fun onResume() {
    KeyboardInputBridge.setMainAppInForeground(true)
    super.onResume()
    reclaimReactHostForActivity()
  }

  override fun onPause() {
    KeyboardInputBridge.setMainAppInForeground(false)
    super.onPause()
  }

  /** Re-bind the shared React host to this Activity after the IME resumed it with a null Activity. */
  private fun reclaimReactHostForActivity() {
    val app = application as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      app.reactHost?.onHostResume(this)
    }
  }

  override fun onNewIntent(intent: Intent) {
    normalizeDevLauncherUrl(intent)
    super.onNewIntent(intent)
    if (intent.getBooleanExtra(EXTRA_REQUEST_MIC, false)) {
      requestMicPermissionIfNeeded()
    }
    if (intent.getBooleanExtra(EXTRA_REQUEST_MEDIA_IMAGES, false)) {
      requestMediaImagesPermissionIfNeeded()
    }
  }

  /**
   * expo run:android opens the dev client with a LAN Metro URL (e.g. 192.168.x.x:8081).
   * USB debugging needs 127.0.0.1:8081 with `adb reverse tcp:8081 tcp:8081`.
   */
  private fun normalizeDevLauncherUrl(intent: Intent?) {
    if (!BuildConfig.DEBUG) {
      return
    }
    val data = intent?.data ?: return
    if (data.host != "expo-development-client") {
      return
    }

    val metroUrl = data.getQueryParameter("url") ?: return
    val normalizedMetroUrl =
        metroUrl.replace(Regex("""https?://[^/:]+:8081"""), "http://127.0.0.1:8081")
    if (normalizedMetroUrl == metroUrl) {
      return
    }

    val builder = data.buildUpon().clearQuery()
    for (key in data.queryParameterNames) {
      val value =
          when (key) {
            "url" -> normalizedMetroUrl
            else -> data.getQueryParameter(key)
          }
      if (value != null) {
        builder.appendQueryParameter(key, value)
      }
    }
    intent.data = builder.build()
  }

  private fun requestMicPermissionIfNeeded() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          arrayOf(Manifest.permission.RECORD_AUDIO),
          MIC_PERMISSION_REQUEST,
      )
    }
  }

  private fun requestMediaImagesPermissionIfNeeded() {
    val permission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          Manifest.permission.READ_MEDIA_IMAGES
        } else {
          Manifest.permission.READ_EXTERNAL_STORAGE
        }

    if (ContextCompat.checkSelfPermission(this, permission) !=
        PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          arrayOf(permission),
          MEDIA_IMAGES_PERMISSION_REQUEST,
      )
    }
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
        this,
        BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
        object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
    )
  }

  companion object {
    const val EXTRA_REQUEST_MIC = "request_mic"
    const val EXTRA_REQUEST_MEDIA_IMAGES = "request_media_images"
    private const val MIC_PERMISSION_REQUEST = 1001
    private const val MEDIA_IMAGES_PERMISSION_REQUEST = 1002
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }
    super.invokeDefaultOnBackPressed()
  }
}
