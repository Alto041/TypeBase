package com.typebase.app.billing

/** Pending navigation flags set from the IME and consumed by the companion app. */
object PremiumNavigation {
  @Volatile var pendingOpenUpgrade: Boolean = false

  fun markOpenUpgrade() {
    pendingOpenUpgrade = true
  }

  fun consumeOpenUpgrade(): Boolean {
    val pending = pendingOpenUpgrade
    pendingOpenUpgrade = false
    return pending
  }
}
