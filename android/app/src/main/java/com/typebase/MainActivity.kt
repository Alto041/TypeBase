package com.typebase

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    if (intent?.getBooleanExtra(EXTRA_REQUEST_MIC, false) == true) {
      requestMicPermissionIfNeeded()
    }
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
    private const val MIC_PERMISSION_REQUEST = 1001
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
