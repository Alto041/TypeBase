package com.typebase

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.inputmethod.InputConnection
import android.R
import android.view.inputmethod.InputContentInfo
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class KeyboardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var removePrefersNumpadListener: (() -> Unit)? = null
  private var removeKeyboardVisibilityListener: (() -> Unit)? = null
  private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null
  private val backspaceHandler = Handler(Looper.getMainLooper())
  private var backspaceHoldRunnable: Runnable? = null
  private var backspaceTickRunnable: Runnable? = null

  override fun getName(): String = "KeyboardModule"

  override fun initialize() {
    super.initialize()
    removePrefersNumpadListener =
        KeyboardInputBridge.addPrefersNumpadListener { prefers ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardPrefersNumpad", prefers)
          }
        }
    removeKeyboardVisibilityListener =
        KeyboardInputBridge.addKeyboardVisibilityListener { shown ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            val event = if (shown) "keyboardShown" else "keyboardHidden"
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, null)
          }
        }
    val clipboardManager =
        reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
            ClipboardManager
    clipboardListener =
        ClipboardManager.OnPrimaryClipChangedListener {
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("clipboardChanged", null)
          }
        }
    clipboardManager.addPrimaryClipChangedListener(clipboardListener!!)
  }

  override fun invalidate() {
    removePrefersNumpadListener?.invoke()
    removePrefersNumpadListener = null
    removeKeyboardVisibilityListener?.invoke()
    removeKeyboardVisibilityListener = null
    clipboardListener?.let { listener ->
      val clipboardManager =
          reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
              ClipboardManager
      clipboardManager.removePrimaryClipChangedListener(listener)
    }
    clipboardListener = null
    stopBackspaceRepeatInternal()
    super.invalidate()
  }

  @ReactMethod
  fun getPrefersNumpad(promise: Promise) {
    promise.resolve(KeyboardInputBridge.prefersNumpad())
  }

  private fun learnedWordsPrefs() =
      reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun readLearnedWords(): JSONObject {
    val raw = learnedWordsPrefs().getString(LEARNED_WORDS_KEY, "{}") ?: "{}"
    return JSONObject(raw)
  }

  private fun writeLearnedWords(json: JSONObject) {
    learnedWordsPrefs().edit().putString(LEARNED_WORDS_KEY, json.toString()).apply()
  }

  @ReactMethod
  fun recordLearnedWord(word: String, promise: Promise) {
    try {
      val normalized = word.trim().lowercase()
      if (normalized.length < 2 || !normalized.matches(Regex("[a-z]+"))) {
        promise.resolve(0)
        return
      }

      val json = readLearnedWords()
      val nextCount = json.optInt(normalized, 0) + 1
      json.put(normalized, nextCount)
      writeLearnedWords(json)
      promise.resolve(nextCount)
    } catch (error: Exception) {
      promise.reject("RECORD_LEARNED_WORD_FAILED", error)
    }
  }

  @ReactMethod
  fun getEssentials(promise: Promise) {
    try {
      val raw = learnedWordsPrefs().getString(ESSENTIALS_KEY, "[]") ?: "[]"
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_ESSENTIALS_FAILED", error)
    }
  }

  @ReactMethod
  fun setEssentials(json: String, promise: Promise) {
    try {
      learnedWordsPrefs().edit().putString(ESSENTIALS_KEY, json).apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SET_ESSENTIALS_FAILED", error)
    }
  }

  @ReactMethod
  fun getClipboardText(promise: Promise) {
    try {
      val manager =
          reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
              ClipboardManager
      val clip = manager.primaryClip
      if (clip == null || clip.itemCount == 0) {
        promise.resolve("")
        return
      }
      val text = clip.getItemAt(0).coerceToText(reactApplicationContext)?.toString().orEmpty()
      promise.resolve(text)
    } catch (error: Exception) {
      promise.reject("GET_CLIPBOARD_FAILED", error)
    }
  }

  @ReactMethod
  fun getClipboardContent(promise: Promise) {
    try {
      val manager =
          reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
              ClipboardManager
      val clip = manager.primaryClip
      if (clip == null || clip.itemCount == 0) {
        promise.resolve("""{"kind":"none"}""")
        return
      }

      val item = clip.getItemAt(0)
      val uri = item.uri
      if (uri != null) {
        val mimeType =
            reactApplicationContext.contentResolver.getType(uri)
                ?: clip.description?.getMimeType(0)
                ?: "image/*"
        if (mimeType.startsWith("image/")) {
          val saved = saveClipboardImage(uri, mimeType)
          if (saved != null) {
            promise.resolve(saved)
            return
          }
        }
      }

      val text = item.coerceToText(reactApplicationContext)?.toString()?.trim().orEmpty()
      if (text.isNotEmpty()) {
        promise.resolve("""{"kind":"text","text":${JSONObject.quote(text)}}""")
        return
      }

      promise.resolve("""{"kind":"none"}""")
    } catch (error: Exception) {
      promise.reject("GET_CLIPBOARD_CONTENT_FAILED", error)
    }
  }

  @ReactMethod
  fun insertClipboardImage(imagePath: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
        promise.resolve(false)
        return
      }

      val file = File(imagePath)
      if (!file.exists()) {
        promise.resolve(false)
        return
      }

      val mimeType = guessImageMimeType(file)
      val authority = "${reactApplicationContext.packageName}.clipboard"
      val contentUri = FileProvider.getUriForFile(reactApplicationContext, authority, file)
      val connection = KeyboardInputBridge.getInputConnection()
      if (connection == null) {
        promise.resolve(false)
        return
      }

      val description = ClipDescription("clipboard image", arrayOf(mimeType))
      val inputContentInfo = InputContentInfo(contentUri, description, null)
      val committed =
          connection.commitContent(
              inputContentInfo,
              InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION,
              null,
          )
      promise.resolve(committed)
    } catch (error: Exception) {
      promise.reject("INSERT_CLIPBOARD_IMAGE_FAILED", error)
    }
  }

  @ReactMethod
  fun deleteClipboardImageFile(imagePath: String, promise: Promise) {
    try {
      val file = File(imagePath)
      promise.resolve(!file.exists() || file.delete())
    } catch (error: Exception) {
      promise.reject("DELETE_CLIPBOARD_IMAGE_FAILED", error)
    }
  }

  @ReactMethod
  fun getClipboardHistory(promise: Promise) {
    try {
      val raw = learnedWordsPrefs().getString(CLIPBOARD_HISTORY_KEY, "[]") ?: "[]"
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_CLIPBOARD_HISTORY_FAILED", error)
    }
  }

  @ReactMethod
  fun setClipboardHistory(json: String, promise: Promise) {
    try {
      learnedWordsPrefs().edit().putString(CLIPBOARD_HISTORY_KEY, json).apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SET_CLIPBOARD_HISTORY_FAILED", error)
    }
  }

  @ReactMethod
  fun getLearnedWordCounts(promise: Promise) {
    try {
      val json = readLearnedWords()
      val map: WritableMap = Arguments.createMap()
      val keys = json.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        map.putInt(key, json.optInt(key, 0))
      }
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("GET_LEARNED_WORD_COUNTS_FAILED", error)
    }
  }

  @ReactMethod
  fun insertText(text: String) {
    KeyboardInputBridge.getInputConnection()?.commitText(text, 1)
  }

  @ReactMethod
  fun getTextBeforeCursor(length: Int, promise: Promise) {
    try {
      val text =
          KeyboardInputBridge.getInputConnection()
              ?.getTextBeforeCursor(length.coerceAtLeast(0), 0)
              ?.toString()
              .orEmpty()
      promise.resolve(text)
    } catch (error: Exception) {
      promise.reject("GET_TEXT_BEFORE_CURSOR_FAILED", error)
    }
  }

  @ReactMethod
  fun replaceWordPrefix(prefixLength: Int, word: String) {
    val connection = KeyboardInputBridge.getInputConnection() ?: return
    val safePrefixLength = prefixLength.coerceAtLeast(0)
    if (safePrefixLength > 0) {
      connection.deleteSurroundingText(safePrefixLength, 0)
    }
    connection.commitText(word, 1)
  }

  @ReactMethod
  fun deleteBackward() {
    performDeleteBackward()
  }

  @ReactMethod
  fun startBackspaceRepeat(holdDelayMs: Int, intervalMs: Int) {
    UiThreadUtil.runOnUiThread {
      stopBackspaceRepeatInternal()
      val holdDelay = holdDelayMs.coerceAtLeast(0).toLong()
      val interval = intervalMs.coerceIn(16, 500).toLong()

      val holdRunnable = Runnable {
        backspaceHoldRunnable = null
        performDeleteBackward()
        val tickRunnable =
            object : Runnable {
              override fun run() {
                if (backspaceTickRunnable !== this) {
                  return
                }
                performDeleteBackward()
                backspaceHandler.postDelayed(this, interval)
              }
            }
        backspaceTickRunnable = tickRunnable
        backspaceHandler.postDelayed(tickRunnable, interval)
      }
      backspaceHoldRunnable = holdRunnable
      backspaceHandler.postDelayed(holdRunnable, holdDelay)
    }
  }

  @ReactMethod
  fun stopBackspaceRepeat() {
    UiThreadUtil.runOnUiThread { stopBackspaceRepeatInternal() }
  }

  private fun performDeleteBackward() {
    val connection = KeyboardInputBridge.getInputConnection() ?: return
    val selected = connection.getSelectedText(0)
    if (selected != null && selected.isNotEmpty()) {
      connection.commitText("", 1)
      return
    }
    connection.deleteSurroundingText(1, 0)
  }

  private fun stopBackspaceRepeatInternal() {
    backspaceHoldRunnable?.let { backspaceHandler.removeCallbacks(it) }
    backspaceTickRunnable?.let { backspaceHandler.removeCallbacks(it) }
    backspaceHoldRunnable = null
    backspaceTickRunnable = null
  }

  @ReactMethod
  fun insertNewline() {
    val connection = KeyboardInputBridge.getInputConnection() ?: return
    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
  }

  @ReactMethod
  fun undo(promise: Promise) {
    try {
      val connection = KeyboardInputBridge.getInputConnection()
      if (connection == null) {
        promise.resolve(false)
        return
      }
      val ok = connection.performContextMenuAction(R.id.undo)
      promise.resolve(ok)
    } catch (error: Exception) {
      promise.reject("UNDO_FAILED", error)
    }
  }

  @ReactMethod
  fun redo(promise: Promise) {
    try {
      val connection = KeyboardInputBridge.getInputConnection()
      if (connection == null) {
        promise.resolve(false)
        return
      }
      val ok = connection.performContextMenuAction(R.id.redo)
      promise.resolve(ok)
    } catch (error: Exception) {
      promise.reject("REDO_FAILED", error)
    }
  }

  @ReactMethod
  fun dismissKeyboard() {
    KeyboardInputBridge.requestHideSelf()
  }

  @ReactMethod
  fun openInputMethodSettings() {
    val intent =
        Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactApplicationContext.startActivity(intent)
  }

  @ReactMethod
  fun setKeyboardHeight(heightDp: Int) {
    KeyboardInputBridge.setKeyboardHeightDp(heightDp)
  }

  @ReactMethod
  fun getKeyboardColorScheme(promise: Promise) {
    try {
      val scheme =
          learnedWordsPrefs().getString(KEYBOARD_THEME_KEY, DEFAULT_KEYBOARD_THEME)
              ?: DEFAULT_KEYBOARD_THEME
      promise.resolve(scheme)
    } catch (error: Exception) {
      promise.reject("GET_KEYBOARD_THEME_FAILED", error)
    }
  }

  @ReactMethod
  fun setKeyboardColorScheme(scheme: String, promise: Promise) {
    try {
      val normalized = if (scheme == "dark") "dark" else "light"
      val saved =
          learnedWordsPrefs()
              .edit()
              .putString(KEYBOARD_THEME_KEY, normalized)
              .commit()
      if (saved && reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("keyboardThemeChanged", normalized)
      }
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_KEYBOARD_THEME_FAILED", error)
    }
  }

  @ReactMethod
  fun getKeyboardDesign(promise: Promise) {
    try {
      val design =
          learnedWordsPrefs().getString(KEYBOARD_DESIGN_KEY, DEFAULT_KEYBOARD_DESIGN)
              ?: DEFAULT_KEYBOARD_DESIGN
      promise.resolve(design)
    } catch (error: Exception) {
      promise.reject("GET_KEYBOARD_DESIGN_FAILED", error)
    }
  }

  @ReactMethod
  fun setKeyboardDesign(design: String, promise: Promise) {
    try {
      val normalized =
          when (design) {
            "quivox" -> "quivox"
            "custom" -> "custom"
            else -> "typebase"
          }
      val saved =
          learnedWordsPrefs()
              .edit()
              .putString(KEYBOARD_DESIGN_KEY, normalized)
              .commit()
      if (saved && reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("keyboardDesignChanged", normalized)
      }
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_KEYBOARD_DESIGN_FAILED", error)
    }
  }

  @ReactMethod
  fun getKeyboardCustomTheme(promise: Promise) {
    try {
      val raw =
          learnedWordsPrefs().getString(KEYBOARD_CUSTOM_THEME_KEY, DEFAULT_KEYBOARD_CUSTOM_THEME)
              ?: DEFAULT_KEYBOARD_CUSTOM_THEME
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_KEYBOARD_CUSTOM_THEME_FAILED", error)
    }
  }

  @ReactMethod
  fun setKeyboardCustomTheme(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(KEYBOARD_CUSTOM_THEME_KEY, json).commit()
      if (saved && reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("keyboardCustomThemeChanged", json)
      }
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_KEYBOARD_CUSTOM_THEME_FAILED", error)
    }
  }

  @ReactMethod
  fun getGestureSettings(promise: Promise) {
    try {
      val raw = learnedWordsPrefs().getString(GESTURE_SETTINGS_KEY, DEFAULT_GESTURE_SETTINGS) ?: DEFAULT_GESTURE_SETTINGS
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_GESTURE_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun setGestureSettings(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(GESTURE_SETTINGS_KEY, json).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_GESTURE_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun getAutocorrectSettings(promise: Promise) {
    try {
      val raw =
          learnedWordsPrefs().getString(AUTOCORRECT_SETTINGS_KEY, DEFAULT_AUTOCORRECT_SETTINGS)
              ?: DEFAULT_AUTOCORRECT_SETTINGS
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_AUTOCORRECT_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun setAutocorrectSettings(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(AUTOCORRECT_SETTINGS_KEY, json).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_AUTOCORRECT_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun getApiKeys(promise: Promise) {
    try {
      val raw =
          learnedWordsPrefs().getString(API_KEYS_KEY, DEFAULT_API_KEYS) ?: DEFAULT_API_KEYS
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_API_KEYS_FAILED", error)
    }
  }

  @ReactMethod
  fun setApiKeys(json: String, promise: Promise) {
    try {
      val saved = learnedWordsPrefs().edit().putString(API_KEYS_KEY, json).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_API_KEYS_FAILED", error)
    }
  }

  private fun readLearnedPhrases(): JSONObject {
    val raw = learnedWordsPrefs().getString(LEARNED_PHRASES_KEY, "{}") ?: "{}"
    return JSONObject(raw)
  }

  private fun writeLearnedPhrases(json: JSONObject) {
    learnedWordsPrefs().edit().putString(LEARNED_PHRASES_KEY, json.toString()).apply()
  }

  @ReactMethod
  fun getLearnedPhraseCounts(promise: Promise) {
    try {
      val json = readLearnedPhrases()
      val map: WritableMap = Arguments.createMap()
      val keys = json.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        map.putInt(key, json.optInt(key, 0))
      }
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("GET_LEARNED_PHRASE_COUNTS_FAILED", error)
    }
  }

  @ReactMethod
  fun recordLearnedPhrase(phrase: String, promise: Promise) {
    try {
      val normalized = phrase.trim().lowercase().replace(Regex("\\s+"), " ")
      val words = normalized.split(" ")
      if (words.size < 2 || words.size > 4 || !normalized.matches(Regex("[a-z ]+"))) {
        promise.resolve(0)
        return
      }

      val json = readLearnedPhrases()
      val nextCount = json.optInt(normalized, 0) + 1
      json.put(normalized, nextCount)
      writeLearnedPhrases(json)
      promise.resolve(nextCount)
    } catch (error: Exception) {
      promise.reject("RECORD_LEARNED_PHRASE_FAILED", error)
    }
  }

  @ReactMethod
  fun getCommaLauncherArmed(promise: Promise) {
    try {
      promise.resolve(learnedWordsPrefs().getBoolean(COMMA_LAUNCHER_ARMED_KEY, false))
    } catch (error: Exception) {
      promise.reject("GET_COMMA_LAUNCHER_ARMED_FAILED", error)
    }
  }

  @ReactMethod
  fun setCommaLauncherArmed(armed: Boolean, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs()
              .edit()
              .putBoolean(COMMA_LAUNCHER_ARMED_KEY, armed)
              .commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_COMMA_LAUNCHER_ARMED_FAILED", error)
    }
  }

  @ReactMethod
  fun moveCursor(offset: Int, promise: Promise) {
    try {
      val connection = KeyboardInputBridge.getInputConnection()
      if (connection == null) {
        promise.resolve(false)
        return
      }
      val beforeLen = connection.getTextBeforeCursor(100000, 0)?.length ?: 0
      val afterLen = connection.getTextAfterCursor(100000, 0)?.length ?: 0
      val target = (beforeLen + offset).coerceIn(0, beforeLen + afterLen)
      connection.setSelection(target, target)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("MOVE_CURSOR_FAILED", error)
    }
  }

  @ReactMethod
  fun deleteWordBackward(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val deleted = deleteWordBackwardInternal()
        promise.resolve(deleted)
      } catch (error: Exception) {
        promise.reject("DELETE_WORD_BACKWARD_FAILED", error)
      }
    }
  }

  private fun deleteWordBackwardInternal(): Boolean {
    val connection = KeyboardInputBridge.getInputConnection() ?: return false
    val before = connection.getTextBeforeCursor(1000, 0)?.toString().orEmpty()
    if (before.isEmpty()) {
      return false
    }

    var end = before.length
    while (end > 0 && before[end - 1].isWhitespace()) {
      end--
    }
    if (end == 0) {
      return false
    }

    var start = end
    while (start > 0 && !before[start - 1].isWhitespace()) {
      start--
    }

    val deleteCount = before.length - start
    if (deleteCount <= 0) {
      return false
    }

    connection.deleteSurroundingText(deleteCount, 0)
    return true
  }

  @ReactMethod
  fun deleteSentenceBackward(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val before = connection.getTextBeforeCursor(4000, 0)?.toString().orEmpty()
        if (before.isEmpty()) {
          promise.resolve(false)
          return@runOnUiThread
        }
        var end = before.length
        while (end > 0 && before[end - 1].isWhitespace()) {
          end--
        }
        var boundary = end
        var index = end - 1
        while (index >= 0) {
          val char = before[index]
          if (char == '.' || char == '!' || char == '?' || char == '\n') {
            boundary = index + 1
            while (boundary < end && before[boundary].isWhitespace()) {
              boundary++
            }
            break
          }
          index--
        }
        if (boundary == end) {
          boundary = 0
        }
        val deleteCount = before.length - boundary
        if (deleteCount > 0) {
          connection.deleteSurroundingText(deleteCount, 0)
        }
        promise.resolve(deleteCount > 0)
      } catch (error: Exception) {
        promise.reject("DELETE_SENTENCE_BACKWARD_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun getLaunchableApps(promise: Promise) {
    try {
      val context = KeyboardInputBridge.inputService ?: reactApplicationContext
      val packageManager = context.packageManager
      val launcherIntent =
          Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
          }
      val activities =
          packageManager.queryIntentActivities(
              launcherIntent,
              PackageManager.MATCH_DEFAULT_ONLY,
          )
      val seenPackages = linkedSetOf<String>()
      val apps = Arguments.createArray()

      activities
          .sortedBy { it.loadLabel(packageManager).toString().lowercase() }
          .forEach { resolveInfo ->
            val packageName = resolveInfo.activityInfo.packageName
            if (seenPackages.add(packageName)) {
              val app = Arguments.createMap()
              app.putString("packageName", packageName)
              app.putString("label", resolveInfo.loadLabel(packageManager).toString())
              apps.pushMap(app)
            }
          }

      promise.resolve(apps)
    } catch (error: Exception) {
      promise.reject("GET_LAUNCHABLE_APPS_FAILED", error)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      val context = KeyboardInputBridge.inputService ?: reactApplicationContext
      val intent = context.packageManager.getLaunchIntentForPackage(packageName)
      if (intent == null) {
        promise.resolve(false)
        return
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LAUNCH_APP_FAILED", error)
    }
  }

  @ReactMethod
  fun performKeyHaptic() {
    val view =
        KeyboardInputBridge.inputService?.window?.window?.decorView
            ?: reactApplicationContext.currentActivity?.window?.decorView
            ?: return

    val feedback = Runnable {
      view.performHapticFeedback(
          HapticFeedbackConstants.KEYBOARD_TAP,
          HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
      )
    }

    if (UiThreadUtil.isOnUiThread()) {
      feedback.run()
    } else {
      UiThreadUtil.runOnUiThread(feedback)
    }
  }

  private fun clipboardImagesDir(): File {
    val dir = File(reactApplicationContext.filesDir, "clipboard_images")
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  private fun extensionForMimeType(mimeType: String): String {
    return when (mimeType.lowercase()) {
      "image/jpeg", "image/jpg" -> "jpg"
      "image/png" -> "png"
      "image/webp" -> "webp"
      "image/gif" -> "gif"
      else -> "img"
    }
  }

  private fun guessImageMimeType(file: File): String {
    return when (file.extension.lowercase()) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "webp" -> "image/webp"
      "gif" -> "image/gif"
      else -> "image/*"
    }
  }

  private fun sha256Hex(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
    return digest.joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun saveClipboardImage(uri: Uri, mimeType: String): String? {
    val resolver = reactApplicationContext.contentResolver
    val bytes =
        resolver.openInputStream(uri)?.use { stream -> stream.readBytes() }
            ?: return null
    if (bytes.isEmpty()) {
      return null
    }

    val hash = sha256Hex(bytes)
    val extension = extensionForMimeType(mimeType)
    val file = File(clipboardImagesDir(), "$hash.$extension")
    if (!file.exists()) {
      FileOutputStream(file).use { output -> output.write(bytes) }
    }

    return """{"kind":"image","imagePath":${JSONObject.quote(file.absolutePath)},"imageHash":${JSONObject.quote(hash)},"mimeType":${JSONObject.quote(mimeType)}}"""
  }

  companion object {
    private const val PREFS_NAME = "typebase_keyboard"
    private const val LEARNED_WORDS_KEY = "learned_words"
    private const val ESSENTIALS_KEY = "essentials"
    private const val CLIPBOARD_HISTORY_KEY = "clipboard_history"
    private const val GESTURE_SETTINGS_KEY = "gesture_settings"
    private const val AUTOCORRECT_SETTINGS_KEY = "autocorrect_settings"
    private const val LEARNED_PHRASES_KEY = "learned_phrases"
    private const val COMMA_LAUNCHER_ARMED_KEY = "comma_launcher_armed"
    private const val API_KEYS_KEY = "api_keys"
    private const val KEYBOARD_THEME_KEY = "keyboard_theme"
    private const val DEFAULT_KEYBOARD_THEME = "light"
    private const val KEYBOARD_DESIGN_KEY = "keyboard_design"
    private const val DEFAULT_KEYBOARD_DESIGN = "typebase"
    private const val KEYBOARD_CUSTOM_THEME_KEY = "keyboard_custom_theme"
    private const val DEFAULT_KEYBOARD_CUSTOM_THEME = "{}"
    private const val DEFAULT_API_KEYS =
        """{"geminiApiKey":"","speechmaticsApiKey":""}"""
    private const val DEFAULT_GESTURE_SETTINGS =
        """{"swipeTyping":true,"spaceCursorSwipe":true,"backspaceWordSwipe":true,"backspaceSentenceHold":false,"commaLauncher":true,"trackpadMode":true,"launcherAppPackage":"com.typebase"}"""
    private const val DEFAULT_AUTOCORRECT_SETTINGS =
        """{"enabled":true,"autoApplyOnSpace":false}"""
  }
}
