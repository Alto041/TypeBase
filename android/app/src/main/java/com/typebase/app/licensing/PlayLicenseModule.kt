package com.typebase.app.licensing

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PlayLicenseModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PlayLicense"

  @ReactMethod
  fun isLicensedCached(promise: Promise) {
    try {
      promise.resolve(PlayLicenseManager.isLicensedCached(reactApplicationContext))
    } catch (error: Exception) {
      promise.reject("LICENSE_CACHE_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun ensureLicensed(promise: Promise) {
    PlayLicenseManager.ensureLicensed(reactApplicationContext) { result ->
      promise.resolve(result)
    }
  }

  @ReactMethod
  fun openPlayStoreListing(promise: Promise) {
    try {
      PlayLicenseManager.openPlayStoreListing(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_PLAY_STORE_FAILED", error)
    }
  }
}
