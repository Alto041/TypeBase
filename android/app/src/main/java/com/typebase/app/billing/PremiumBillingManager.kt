package com.typebase.app.billing

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.ProductDetails.OneTimePurchaseOfferDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.typebase.app.MainActivity
import com.typebase.app.licensing.PlayLicenseStore

object PremiumBillingManager : PurchasesUpdatedListener {
  const val EVENT_PREMIUM_CHANGED = "premiumStatusChanged"
  const val EXTRA_OPEN_PREMIUM = "open_premium_upgrade"

  private val mainHandler = Handler(Looper.getMainLooper())
  private var billingClient: BillingClient? = null
  private var reactContext: ReactApplicationContext? = null
  private var cachedProductDetails: ProductDetails? = null
  private var pendingPurchaseCallback: ((Boolean, String?) -> Unit)? = null
  private var pendingRestoreCallback: ((Boolean, String?) -> Unit)? = null

  fun isPremiumCached(context: Context): Boolean {
    val appContext = context.applicationContext
    if (PremiumStore.isPremium(appContext)) {
      return true
    }
    return PlayLicenseStore.isLicensed(appContext)
  }

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  fun refreshEntitlement(context: Context, callback: ((Boolean) -> Unit)? = null) {
    val appContext = context.applicationContext

    if (PlayLicenseStore.isLicensed(appContext)) {
      PremiumStore.setPremium(appContext, true)
      emitPremiumChanged(true)
      callback?.let { deliver(it, true) }
      return
    }

    ensureBillingClient(appContext) { ready ->
      if (!ready) {
        val cached = PremiumStore.isPremium(appContext)
        callback?.let { deliver(it, cached) }
        return@ensureBillingClient
      }
      queryOwnedPurchases(appContext) { owned ->
        PremiumStore.setPremium(appContext, owned)
        emitPremiumChanged(owned)
        callback?.let { deliver(it, owned) }
      }
    }
  }

  fun getProductPrice(context: Context, callback: (String?) -> Unit) {
    val appContext = context.applicationContext
    ensureBillingClient(appContext) { ready ->
      if (!ready) {
        deliver(callback, null)
        return@ensureBillingClient
      }
      if (cachedProductDetails != null) {
        deliver(callback, formatPrice(cachedProductDetails))
        return@ensureBillingClient
      }
      queryProductDetails(appContext) { details ->
        cachedProductDetails = details
        deliver(callback, formatPrice(details))
      }
    }
  }

  fun purchasePremium(activity: Activity, callback: (Boolean, String?) -> Unit) {
    val appContext = activity.applicationContext
    pendingPurchaseCallback = callback
    ensureBillingClient(appContext) { ready ->
      if (!ready) {
        finishPurchase(false, "Billing is unavailable. Check Google Play and try again.")
        return@ensureBillingClient
      }
      fun launchPurchase(details: ProductDetails?) {
        if (details == null) {
          finishPurchase(false, "Premium product is not available yet.")
          return
        }
        val offer = selectOffer(details)
        if (offer == null) {
          finishPurchase(false, "Premium product is not available yet.")
          return
        }
        val offerToken = offer.offerToken
        if (offerToken.isNullOrBlank()) {
          finishPurchase(false, "Premium product is not available yet.")
          return
        }
        val productParams =
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .setOfferToken(offerToken)
                .build()
        val flowParams =
            BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(productParams))
                .build()
        val result = billingClient?.launchBillingFlow(activity, flowParams)
        if (result?.responseCode != BillingClient.BillingResponseCode.OK) {
          finishPurchase(false, result?.debugMessage ?: "Could not start purchase.")
        }
      }
      if (cachedProductDetails != null) {
        launchPurchase(cachedProductDetails)
      } else {
        queryProductDetails(appContext) { details ->
          cachedProductDetails = details
          launchPurchase(details)
        }
      }
    }
  }

  fun restorePurchases(context: Context, callback: (Boolean, String?) -> Unit) {
    val appContext = context.applicationContext
    pendingRestoreCallback = callback

    if (PlayLicenseStore.isLicensed(appContext)) {
      PremiumStore.setPremium(appContext, true)
      emitPremiumChanged(true)
      finishRestore(true, null)
      return
    }

    ensureBillingClient(appContext) { ready ->
      if (!ready) {
        finishRestore(false, "Billing is unavailable. Check Google Play and try again.")
        return@ensureBillingClient
      }
      queryOwnedPurchases(appContext) { owned ->
        PremiumStore.setPremium(appContext, owned)
        emitPremiumChanged(owned)
        if (owned) {
          finishRestore(true, null)
        } else {
          finishRestore(false, "No previous purchase found for this Google account.")
        }
      }
    }
  }

  fun openUpgradeScreen(context: Context) {
    PremiumNavigation.markOpenUpgrade()
    val intent =
        Intent(context, MainActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          putExtra(EXTRA_OPEN_PREMIUM, true)
        }
    context.startActivity(intent)
  }

  override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
    val appContext = reactContext?.applicationContext
    if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
      var premium = false
      for (purchase in purchases) {
        if (handlePurchase(purchase)) {
          premium = true
        }
      }
      if (appContext != null) {
        val resolved = premium || isPremiumCached(appContext)
        PremiumStore.setPremium(appContext, resolved)
        emitPremiumChanged(resolved)
      }
      finishPurchase(premium, if (premium) null else "Purchase was not completed.")
      finishRestore(premium, if (premium) null else "Purchase was not completed.")
      return
    }

    if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
      finishPurchase(false, null)
      finishRestore(false, null)
      return
    }

    finishPurchase(false, result.debugMessage ?: "Purchase failed.")
    finishRestore(false, result.debugMessage ?: "Restore failed.")
  }

  private fun handlePurchase(purchase: Purchase): Boolean {
    if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
      return false
    }
    if (!purchase.products.contains(PremiumConstants.PREMIUM_SKU)) {
      return false
    }
    if (!purchase.isAcknowledged) {
      val params =
          AcknowledgePurchaseParams.newBuilder()
              .setPurchaseToken(purchase.purchaseToken)
              .build()
      billingClient?.acknowledgePurchase(params) { result ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          val appContext = reactContext?.applicationContext
          if (appContext != null) {
            PremiumStore.setPremium(appContext, true, purchase.purchaseToken)
            emitPremiumChanged(true)
          }
        }
      }
    }
    val appContext = reactContext?.applicationContext
    if (appContext != null) {
      PremiumStore.setPremium(appContext, true, purchase.purchaseToken)
    }
    return true
  }

  private fun queryOwnedPurchases(context: Context, callback: (Boolean) -> Unit) {
    val client = billingClient
    if (client == null || !client.isReady) {
      deliver(callback, PremiumStore.isPremium(context))
      return
    }
    val params =
        QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
    client.queryPurchasesAsync(params) { result, purchases ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        deliver(callback, PremiumStore.isPremium(context))
        return@queryPurchasesAsync
      }
      var owned = false
      for (purchase in purchases) {
        if (handlePurchase(purchase)) {
          owned = true
        }
      }
      deliver(callback, owned)
    }
  }

  private fun queryProductDetails(context: Context, callback: (ProductDetails?) -> Unit) {
    val client = billingClient
    if (client == null || !client.isReady) {
      deliver(callback, null)
      return
    }
    val product =
        QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PremiumConstants.PREMIUM_SKU)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
    val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
    client.queryProductDetailsAsync(params) { result, productDetailsResult ->
      val detailsList = productDetailsResult.productDetailsList
      if (result.responseCode != BillingClient.BillingResponseCode.OK || detailsList.isEmpty()) {
        deliver(callback, null)
        return@queryProductDetailsAsync
      }
      deliver(callback, detailsList[0])
    }
  }

  private fun ensureBillingClient(context: Context, callback: (Boolean) -> Unit) {
    val appContext = context.applicationContext
    val existing = billingClient
    if (existing != null && existing.isReady) {
      deliver(callback, true)
      return
    }
    if (existing != null) {
      existing.startConnection(
          object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
              deliver(callback, result.responseCode == BillingClient.BillingResponseCode.OK)
            }

            override fun onBillingServiceDisconnected() {
              deliver(callback, false)
            }
          },
      )
      return
    }
    val client =
        BillingClient.newBuilder(appContext)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
            )
            .build()
    billingClient = client
    client.startConnection(
        object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) {
            deliver(callback, result.responseCode == BillingClient.BillingResponseCode.OK)
          }

          override fun onBillingServiceDisconnected() {
            billingClient = null
          }
        },
    )
  }

  private fun selectOffer(details: ProductDetails): OneTimePurchaseOfferDetails? {
    val offers = details.oneTimePurchaseOfferDetailsList
    if (!offers.isNullOrEmpty()) {
      return offers.first()
    }
    return details.oneTimePurchaseOfferDetails
  }

  private fun formatPrice(details: ProductDetails?): String? {
    if (details == null) {
      return null
    }
    return selectOffer(details)?.formattedPrice
  }

  private fun emitPremiumChanged(isPremium: Boolean) {
    val context = reactContext ?: return
    if (!context.hasActiveReactInstance()) {
      return
    }
    context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_PREMIUM_CHANGED, isPremium)
  }

  private fun finishPurchase(success: Boolean, error: String?) {
    val callback = pendingPurchaseCallback
    pendingPurchaseCallback = null
    if (callback != null) {
      deliver({ callback(success, error) }, Unit)
    }
  }

  private fun finishRestore(success: Boolean, error: String?) {
    val callback = pendingRestoreCallback
    pendingRestoreCallback = null
    if (callback != null) {
      deliver({ callback(success, error) }, Unit)
    }
  }

  private fun <T> deliver(callback: (T) -> Unit, value: T) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      callback(value)
    } else {
      mainHandler.post { callback(value) }
    }
  }
}
