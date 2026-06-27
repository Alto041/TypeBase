package com.typebase.app.licensing;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.android.vending.licensing.Obfuscator;
import com.google.android.vending.licensing.Policy;
import com.google.android.vending.licensing.PreferenceObfuscator;
import com.google.android.vending.licensing.ResponseData;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import com.google.android.vending.licensing.util.URIQueryDecoder;

/**
 * Caches a successful LICENSED response permanently. After the first successful
 * Play license check, {@link #allowAccess()} stays true offline.
 */
public class FirstInstallPolicy implements Policy {

  public static final String PREFS_FILE = "typebase_play_license";
  private static final String PREF_STATE = "state";
  private static final String PREF_LICENSING_URL = "licensingUrl";

  static final String STATE_LICENSED = "licensed";
  static final String STATE_UNLICENSED = "unlicensed";
  static final String STATE_UNKNOWN = "unknown";

  private String state = STATE_UNKNOWN;
  private String licensingUrl;
  private final PreferenceObfuscator preferences;

  public FirstInstallPolicy(Context context, Obfuscator obfuscator) {
    SharedPreferences sharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE);
    preferences = new PreferenceObfuscator(sharedPreferences, obfuscator);
    state = preferences.getString(PREF_STATE, STATE_UNKNOWN);
    licensingUrl = preferences.getString(PREF_LICENSING_URL, null);
  }

  @Override
  public void processServerResponse(int response, ResponseData rawData) {
    if (response == Policy.LICENSED) {
      state = STATE_LICENSED;
      licensingUrl = null;
      preferences.putString(PREF_STATE, state);
      preferences.putString(PREF_LICENSING_URL, null);
      preferences.commit();
      return;
    }

    if (response == Policy.NOT_LICENSED) {
      state = STATE_UNLICENSED;
      licensingUrl = decodeLicensingUrl(rawData);
      preferences.putString(PREF_STATE, state);
      preferences.putString(PREF_LICENSING_URL, licensingUrl);
      preferences.commit();
    }
    // RETRY: do not cache — user can try again when online.
  }

  @Override
  public boolean allowAccess() {
    return STATE_LICENSED.equals(state);
  }

  @Override
  public String getLicensingUrl() {
    return licensingUrl;
  }

  static boolean isLicensedCached(Context context) {
    SharedPreferences sharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE);
    // Fast path before obfuscator init: mirror flag in PlayLicenseStore.
    return PlayLicenseStore.isLicensed(context);
  }

  private static String decodeLicensingUrl(ResponseData rawData) {
    if (rawData == null || rawData.extra == null) {
      return null;
    }
    Map<String, String> extras = new HashMap<>();
    try {
      URI rawExtras = new URI("?" + rawData.extra);
      URIQueryDecoder.DecodeQuery(rawExtras, extras);
    } catch (Exception ignored) {
      return null;
    }
    return extras.get("LU");
  }
}
