package com.typebase.app.billing

import android.app.Activity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.typebase.app.billing.PremiumNavigation

class PremiumModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  init {
    PremiumBillingManager.attachReactContext(reactContext)
  }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    PremiumBillingManager.refreshEntitlement(reactApplicationContext, null)
  }

  @ReactMethod
  fun isPremiumCached(promise: Promise) {
    try {
      promise.resolve(PremiumBillingManager.isPremiumCached(reactApplicationContext))
    } catch (error: Exception) {
      promise.reject("PREMIUM_CACHE_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun refreshEntitlement(promise: Promise) {
    PremiumBillingManager.refreshEntitlement(reactApplicationContext) { isPremium ->
      promise.resolve(isPremium)
    }
  }

  @ReactMethod
  fun getProductPrice(promise: Promise) {
    PremiumBillingManager.getProductPrice(reactApplicationContext) { price ->
      promise.resolve(price)
    }
  }

  @ReactMethod
  fun consumePendingOpenUpgrade(promise: Promise) {
    try {
      promise.resolve(PremiumNavigation.consumeOpenUpgrade())
    } catch (error: Exception) {
      promise.reject("CONSUME_OPEN_UPGRADE_FAILED", error)
    }
  }

  @ReactMethod
  fun purchasePremium(promise: Promise) {
    val activity: Activity? = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Cannot start purchase without an active screen.")
      return
    }
    PremiumBillingManager.purchasePremium(activity) { success, error ->
      if (success) {
        promise.resolve(true)
      } else if (error == null) {
        promise.resolve(false)
      } else {
        promise.reject("PURCHASE_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun restorePurchases(promise: Promise) {
    PremiumBillingManager.restorePurchases(reactApplicationContext) { success, error ->
      if (success) {
        promise.resolve(true)
      } else if (error == null) {
        promise.resolve(false)
      } else {
        promise.reject("RESTORE_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun openUpgradeScreen(promise: Promise) {
    try {
      PremiumBillingManager.openUpgradeScreen(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_UPGRADE_FAILED", error)
    }
  }

  companion object {
    const val NAME = "Premium"
  }
}
