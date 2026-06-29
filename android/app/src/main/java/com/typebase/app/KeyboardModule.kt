package com.typebase.app

import android.Manifest
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.R
import android.view.inputmethod.InputContentInfo
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
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
import org.json.JSONArray
import org.json.JSONObject

class KeyboardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var removePrefersNumpadListener: (() -> Unit)? = null
  private var removeKeyboardVisibilityListener: (() -> Unit)? = null
  private var removeKeyboardSessionStartListener: (() -> Unit)? = null
  private var removeOrientationChangeListener: (() -> Unit)? = null
  private var removeSupportsNewlineListener: (() -> Unit)? = null
  private var removeInitialCapsModeListener: (() -> Unit)? = null
  private var removeNativeFastPathKeyListener: (() -> Unit)? = null
  private var removeControllerInputListener: (() -> Unit)? = null
  private var removeControllerConnectionListener: (() -> Unit)? = null
  private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null
  private val backspaceHandler = Handler(Looper.getMainLooper())
  private var backspaceHoldRunnable: Runnable? = null
  private var backspaceTickRunnable: Runnable? = null

  override fun getName(): String = "KeyboardModule"

  override fun initialize() {
    super.initialize()
    Thread {
          SwipeWordDictionary.ensureLoaded(reactApplicationContext)
        }
        .start()
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

    removeKeyboardSessionStartListener =
        KeyboardInputBridge.addKeyboardSessionStartListener {
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardSessionStart", null)
          }
        }

    removeOrientationChangeListener =
        KeyboardInputBridge.addOrientationChangeListener { landscape ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardOrientationChange", landscape)
          }
        }

    removeSupportsNewlineListener =
        KeyboardInputBridge.addSupportsNewlineListener { supports ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardInputSupportsNewline", supports)
          }
        }
    removeInitialCapsModeListener =
        KeyboardInputBridge.addInitialCapsModeListener { mode ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardInputInitialCapsMode", mode)
          }
        }
    removeNativeFastPathKeyListener =
        KeyboardInputBridge.addNativeFastPathKeyListener { id, type, value, text, shiftConsumed ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            val event = Arguments.createMap()
            event.putString("id", id)
            event.putString("type", type)
            event.putString("value", value)
            event.putString("text", text)
            event.putBoolean("shiftConsumed", shiftConsumed)
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardNativeFastPathKey", event)
          }
        }
    removeControllerInputListener =
        KeyboardInputBridge.addControllerInputListener { json ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardControllerInput", json)
          }
        }
    removeControllerConnectionListener =
        KeyboardInputBridge.addControllerConnectionListener { connected ->
          if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("keyboardControllerConnection", connected)
          }
        }
    try {
      val layoutJson =
          learnedWordsPrefs()
              .getString(KEYBOARD_LAYOUT_KEY, DEFAULT_KEYBOARD_LAYOUT)
              ?: DEFAULT_KEYBOARD_LAYOUT
      KeyboardInputBridge.syncLayoutSettings(layoutJson)
      KeyTapSoundPlayer.sync(reactApplicationContext)
    } catch (_: Exception) {
      // Layout sync is optional during module init.
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

          // Proactively snapshot any image currently on the system clipboard.
          // We do this inside the OnPrimaryClipChanged callback (while any
          // transient content URI grants from the copying app are still valid).
          // This ensures copied images appear in the SuggestionBar's quick paste
          // pill without requiring the user to first open the full clipboard panel.
          val capturedImageJson = tryCaptureCurrentClipboardImage()
          if (capturedImageJson != null && reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("clipboardImageCaptured", capturedImageJson)
          }
        }
    clipboardManager.addPrimaryClipChangedListener(clipboardListener!!)
  }

  override fun invalidate() {
    removePrefersNumpadListener?.invoke()
    removePrefersNumpadListener = null
    removeKeyboardVisibilityListener?.invoke()
    removeKeyboardVisibilityListener = null
    removeKeyboardSessionStartListener?.invoke()
    removeKeyboardSessionStartListener = null
    removeOrientationChangeListener?.invoke()
    removeOrientationChangeListener = null
    removeSupportsNewlineListener?.invoke()
    removeSupportsNewlineListener = null
    removeInitialCapsModeListener?.invoke()
    removeInitialCapsModeListener = null
    removeNativeFastPathKeyListener?.invoke()
    removeNativeFastPathKeyListener = null
    removeControllerInputListener?.invoke()
    removeControllerInputListener = null
    removeControllerConnectionListener?.invoke()
    removeControllerConnectionListener = null
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

  @ReactMethod
  fun getInputSupportsNewline(promise: Promise) {
    promise.resolve(KeyboardInputBridge.currentInputSupportsNewline())
  }

  @ReactMethod
  fun getInputInitialCapsMode(promise: Promise) {
    promise.resolve(KeyboardInputBridge.getInitialCapsMode())
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

  private fun writeLearnedWordsSync(json: JSONObject): Boolean {
    return learnedWordsPrefs()
        .edit()
        .putString(LEARNED_WORDS_KEY, json.toString())
        .commit()
  }

  @ReactMethod
  fun recordLearnedWord(word: String, promise: Promise) {
    try {
      val normalized = word.trim().lowercase()
      if (normalized.length < 2 || !normalized.all { it.isLetter() }) {
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
          val saved = tryCaptureCurrentClipboardImage()
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
  fun hasMediaImagesPermission(promise: Promise) {
    try {
      promise.resolve(hasMediaImagesPermissionInternal())
    } catch (error: Exception) {
      promise.reject("MEDIA_PERMISSION_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun openAppForMediaImagesPermission(promise: Promise) {
    try {
      if (hasMediaImagesPermissionInternal()) {
        promise.resolve(true)
        return
      }
      val intent =
          Intent(reactApplicationContext, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(MainActivity.EXTRA_REQUEST_MEDIA_IMAGES, true)
          }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_MEDIA_PERMISSION_FAILED", error)
    }
  }

  @ReactMethod
  fun importRecentScreenshots(sinceMs: Double, maxCount: Int, promise: Promise) {
    try {
      if (!hasMediaImagesPermissionInternal()) {
        promise.resolve("[]")
        return
      }
      val resolver = reactApplicationContext.contentResolver
      val collection =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
          } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
          }

      val pathColumn =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.RELATIVE_PATH
          } else {
            MediaStore.Images.Media.DATA
          }
      val projection =
          arrayOf(
              MediaStore.Images.Media._ID,
              MediaStore.Images.Media.DISPLAY_NAME,
              MediaStore.Images.Media.MIME_TYPE,
              MediaStore.Images.Media.DATE_ADDED,
              MediaStore.Images.Media.DATE_MODIFIED,
              pathColumn,
          )

      val sinceSeconds = (sinceMs / 1000.0).toLong().coerceAtLeast(0L)
      val selection =
          "(${MediaStore.Images.Media.DATE_ADDED} >= ? OR ${MediaStore.Images.Media.DATE_MODIFIED} >= ?)"
      val selectionArgs = arrayOf(sinceSeconds.toString(), sinceSeconds.toString())
      val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"
      val imported = JSONArray()
      val limit = maxCount.coerceIn(1, 8)

      resolver
          .query(collection, projection, selection, selectionArgs, sortOrder)
          ?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val mimeIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE)
            val pathIndex = cursor.getColumnIndex(pathColumn)

            while (cursor.moveToNext() && imported.length() < limit) {
              val name = cursor.getString(nameIndex).orEmpty()
              val relativePath = if (pathIndex >= 0) cursor.getString(pathIndex).orEmpty() else ""
              if (!looksLikeScreenshot(name, relativePath)) {
                continue
              }

              val mimeType = cursor.getString(mimeIndex) ?: "image/png"
              val id = cursor.getLong(idIndex)
              val uri = Uri.withAppendedPath(collection, id.toString())
              val saved = saveClipboardImage(uri, mimeType) ?: continue
              imported.put(JSONObject(saved))
            }
          }

      promise.resolve(imported.toString())
    } catch (_: SecurityException) {
      // Media permission is not granted; keep keyboard behavior silent and non-blocking.
      promise.resolve("[]")
    } catch (error: Exception) {
      promise.reject("IMPORT_RECENT_SCREENSHOTS_FAILED", error)
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
  fun getRecentEmojis(promise: Promise) {
    try {
      val raw = learnedWordsPrefs().getString(RECENT_EMOJIS_KEY, "[]") ?: "[]"
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_RECENT_EMOJIS_FAILED", error)
    }
  }

  @ReactMethod
  fun setRecentEmojis(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(RECENT_EMOJIS_KEY, json).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_RECENT_EMOJIS_FAILED", error)
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
  fun clearLearnedWords(promise: Promise) {
    try {
      promise.resolve(writeLearnedWordsSync(JSONObject()))
    } catch (error: Exception) {
      promise.reject("CLEAR_LEARNED_WORDS_FAILED", error)
    }
  }

  @ReactMethod
  fun preloadSwipeWordDictionary(promise: Promise) {
    try {
      SwipeWordDictionary.ensureLoaded(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PRELOAD_SWIPE_WORD_DICT_FAILED", error)
    }
  }

  @ReactMethod
  fun getSwipeCandidates(pattern: String, maxCandidates: Int, promise: Promise) {
    try {
      val results =
          SwipeWordDictionary.getSwipeCandidates(
              reactApplicationContext,
              learnedWordsPrefs(),
              pattern,
              maxCandidates.coerceIn(1, 2000),
          )
      promise.resolve(results)
    } catch (error: Exception) {
      promise.reject("GET_SWIPE_CANDIDATES_FAILED", error)
    }
  }

  @ReactMethod
  fun isKnownSwipeWord(word: String, promise: Promise) {
    try {
      SwipeWordDictionary.ensureLoaded(reactApplicationContext)
      promise.resolve(SwipeWordDictionary.isKnownWord(word))
    } catch (error: Exception) {
      promise.reject("IS_KNOWN_SWIPE_WORD_FAILED", error)
    }
  }

  @ReactMethod
  fun decodeSwipeGesture(
      pointsJson: String,
      layoutsJson: String,
      isUppercase: Boolean,
      promise: Promise,
  ) {
    try {
      val word =
          SwipeWordDictionary.decodeSwipeGesture(
              reactApplicationContext,
              learnedWordsPrefs(),
              pointsJson,
              layoutsJson,
              isUppercase,
          )
      promise.resolve(word ?: "")
    } catch (error: Exception) {
      promise.reject("DECODE_SWIPE_GESTURE_FAILED", error)
    }
  }

  @ReactMethod
  fun insertText(text: String) {
    KeyboardInputBridge.getInputConnection()?.commitText(text, 1)
  }

  @ReactMethod
  fun insertKeyText(text: String) {
    KeyboardInputBridge.getInputConnection()?.commitText(text, 1)
    performKeyHapticInternal()
  }

  @ReactMethod
  fun setNativeKeyFastPathConfig(json: String) {
    KeyboardInputBridge.setNativeKeyFastPathConfig(json)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun consumeNativeFastPathPointer(pointerId: Int): Boolean {
    return KeyboardInputBridge.consumeNativeFastPathPointer(pointerId)
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

    // Google Docs, Keep, and many multi-line editors ignore deleteSurroundingText.
    if (KeyboardInputBridge.shouldPreferDeleteKeyEvent()) {
      sendDeleteKeyEvent(connection)
      return
    }

    val before = connection.getTextBeforeCursor(4, 0)?.toString().orEmpty()
    if (before.isEmpty()) {
      sendDeleteKeyEvent(connection)
      return
    }

    connection.deleteSurroundingTextInCodePoints(1, 0)
    val after = connection.getTextBeforeCursor(4, 0)?.toString().orEmpty()
    if (after == before) {
      sendDeleteKeyEvent(connection)
    }
  }

  private fun sendDeleteKeyEvent(connection: InputConnection) {
    val eventTime = SystemClock.uptimeMillis()
    connection.sendKeyEvent(
        KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL, 0, 0),
    )
    connection.sendKeyEvent(
        KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL, 0, 0),
    )
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
    connection.commitText("\n", 1)
  }

  @ReactMethod
  fun submitEnterKey() {
    val connection = KeyboardInputBridge.getInputConnection() ?: return
    if (
        KeyboardInputBridge.currentInputSupportsNewline() &&
            !KeyboardInputBridge.shouldForceSubmitEnter()
    ) {
      connection.commitText("\n", 1)
      return
    }
    KeyboardInputBridge.performEnterAction(connection)
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
  fun setFloatingKeyboard(enabled: Boolean) {
    KeyboardInputBridge.setFloatingKeyboard(enabled)
  }

  @ReactMethod
  fun setTouchpadGestureConsuming(active: Boolean) {
    KeyboardInputBridge.setTouchpadGestureConsuming(active)
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
  fun getKeyboardLayoutSettings(promise: Promise) {
    try {
      val raw =
          learnedWordsPrefs().getString(KEYBOARD_LAYOUT_KEY, DEFAULT_KEYBOARD_LAYOUT)
              ?: DEFAULT_KEYBOARD_LAYOUT
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_KEYBOARD_LAYOUT_FAILED", error)
    }
  }

  @ReactMethod
  fun setKeyboardLayoutSettings(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(KEYBOARD_LAYOUT_KEY, json).commit()
      KeyboardInputBridge.syncLayoutSettings(json)
      KeyTapSoundPlayer.sync(reactApplicationContext)
      if (saved && reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("keyboardLayoutChanged", json)
      }
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_KEYBOARD_LAYOUT_FAILED", error)
    }
  }

  @ReactMethod
  fun getCustomLetterLayouts(promise: Promise) {
    try {
      val raw =
          learnedWordsPrefs().getString(CUSTOM_LETTER_LAYOUTS_KEY, "[]")
              ?: "[]"
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("GET_CUSTOM_LETTER_LAYOUTS_FAILED", error)
    }
  }

  @ReactMethod
  fun setCustomLetterLayouts(json: String, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs().edit().putString(CUSTOM_LETTER_LAYOUTS_KEY, json).commit()
      if (saved && reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("customLetterLayoutsChanged", json)
      }
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_CUSTOM_LETTER_LAYOUTS_FAILED", error)
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

  @ReactMethod
  fun getAiProvider(promise: Promise) {
    try {
      val provider =
          learnedWordsPrefs().getString(AI_PROVIDER_KEY, DEFAULT_AI_PROVIDER) ?: DEFAULT_AI_PROVIDER
      promise.resolve(provider)
    } catch (error: Exception) {
      promise.reject("GET_AI_PROVIDER_FAILED", error)
    }
  }

  @ReactMethod
  fun setAiProvider(provider: String, promise: Promise) {
    try {
      val normalized = if (provider == "on_device") "on_device" else "gemini"
      val saved = learnedWordsPrefs().edit().putString(AI_PROVIDER_KEY, normalized).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_AI_PROVIDER_FAILED", error)
    }
  }

  @ReactMethod
  fun getVoiceSttProvider(promise: Promise) {
    try {
      val provider =
          learnedWordsPrefs().getString(VOICE_STT_PROVIDER_KEY, DEFAULT_VOICE_STT_PROVIDER)
              ?: DEFAULT_VOICE_STT_PROVIDER
      promise.resolve(provider)
    } catch (error: Exception) {
      promise.reject("GET_VOICE_STT_PROVIDER_FAILED", error)
    }
  }

  @ReactMethod
  fun setVoiceSttProvider(provider: String, promise: Promise) {
    try {
      val normalized = if (provider == "android") "android" else "speechmatics"
      val saved =
          learnedWordsPrefs().edit().putString(VOICE_STT_PROVIDER_KEY, normalized).commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_VOICE_STT_PROVIDER_FAILED", error)
    }
  }

  private fun readLearnedPhrases(): JSONObject {
    val raw = learnedWordsPrefs().getString(LEARNED_PHRASES_KEY, "{}") ?: "{}"
    return JSONObject(raw)
  }

  private fun writeLearnedPhrases(json: JSONObject) {
    learnedWordsPrefs().edit().putString(LEARNED_PHRASES_KEY, json.toString()).apply()
  }

  private fun writeLearnedPhrasesSync(json: JSONObject): Boolean {
    return learnedWordsPrefs()
        .edit()
        .putString(LEARNED_PHRASES_KEY, json.toString())
        .commit()
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
      val allLettersOrSpace = normalized.all { it.isLetter() || it.isWhitespace() }
      if (words.size < 2 || words.size > 4 || !allLettersOrSpace || words.any { it.length < 2 || !it.all { ch -> ch.isLetter() } }) {
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
  fun clearLearnedPhrases(promise: Promise) {
    try {
      promise.resolve(writeLearnedPhrasesSync(JSONObject()))
    } catch (error: Exception) {
      promise.reject("CLEAR_LEARNED_PHRASES_FAILED", error)
    }
  }

  @ReactMethod
  fun clearLearnedAutocorrectData(promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs()
              .edit()
              .putString(LEARNED_WORDS_KEY, "{}")
              .putString(LEARNED_PHRASES_KEY, "{}")
              .commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("CLEAR_LEARNED_AUTOCORRECT_FAILED", error)
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
  fun getPeriodRewriteArmed(promise: Promise) {
    try {
      promise.resolve(learnedWordsPrefs().getBoolean(PERIOD_REWRITE_ARMED_KEY, false))
    } catch (error: Exception) {
      promise.reject("GET_PERIOD_REWRITE_ARMED_FAILED", error)
    }
  }

  @ReactMethod
  fun setPeriodRewriteArmed(armed: Boolean, promise: Promise) {
    try {
      val saved =
          learnedWordsPrefs()
              .edit()
              .putBoolean(PERIOD_REWRITE_ARMED_KEY, armed)
              .commit()
      promise.resolve(saved)
    } catch (error: Exception) {
      promise.reject("SET_PERIOD_REWRITE_ARMED_FAILED", error)
    }
  }

  @ReactMethod
  fun moveCursor(offset: Int, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }

        // Prefer ExtractedText for accurate current selection position.
        val extracted = connection.getExtractedText(ExtractedTextRequest().apply { token = 0 }, 0)
        val current = when {
          extracted != null && extracted.selectionStart >= 0 -> extracted.selectionStart
          extracted != null && extracted.selectionEnd >= 0 -> extracted.selectionEnd
          else -> null
        }

        if (current != null) {
          val newPos = (current + offset).coerceAtLeast(0)
          connection.setSelection(newPos, newPos)
          promise.resolve(true)
          return@runOnUiThread
        }

        // Fallback: synthesize DPAD left/right events (one per step).
        val steps = kotlin.math.abs(offset)
        val direction = if (offset >= 0) KeyEvent.KEYCODE_DPAD_RIGHT else KeyEvent.KEYCODE_DPAD_LEFT
        val eventTime = SystemClock.uptimeMillis()
        repeat(steps) {
          connection.sendKeyEvent(KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, direction, 0, 0))
          connection.sendKeyEvent(KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, direction, 0, 0))
        }
        promise.resolve(steps > 0)
      } catch (error: Exception) {
        promise.reject("MOVE_CURSOR_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun moveCursorDirection(direction: String, extendSelection: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val moved =
            moveCursorDirectionInternal(connection, direction, extendSelection) ||
                sendCursorDirectionKeyEvent(connection, direction, extendSelection)
        promise.resolve(moved)
      } catch (error: Exception) {
        promise.reject("MOVE_CURSOR_DIRECTION_FAILED", error)
      }
    }
  }

  private fun moveCursorDirectionInternal(
      connection: InputConnection,
      direction: String,
      extendSelection: Boolean,
  ): Boolean {
    val extracted =
        connection.getExtractedText(
            ExtractedTextRequest().apply {
              flags = ExtractedText.FLAG_SELECTING
              hintMaxLines = 200
              hintMaxChars = 50000
              token = 0
            },
            0,
        ) ?: return false

    val text = extracted.text?.toString() ?: return false
    val length = text.length
    val selStart = extracted.selectionStart.coerceIn(0, length)
    val selEnd = extracted.selectionEnd.coerceIn(0, length)
    if (selStart < 0 || selEnd < 0) {
      return false
    }

    val low = minOf(selStart, selEnd)
    val high = maxOf(selStart, selEnd)
    val moveFrom =
        when (direction) {
          "left", "up" -> if (extendSelection) low else selEnd
          "right", "down" -> if (extendSelection) high else selEnd
          else -> return false
        }
    val newFocus =
        stepCursorOffset(text, moveFrom, direction) ?: return false

    if (!extendSelection) {
      connection.setSelection(newFocus, newFocus)
      return true
    }

    val anchor =
        if (selStart == selEnd) {
          moveFrom
        } else {
          when (direction) {
            "left", "up" -> high
            "right", "down" -> low
            else -> moveFrom
          }
        }
    connection.setSelection(minOf(anchor, newFocus), maxOf(anchor, newFocus))
    return true
  }

  private fun stepCursorOffset(text: String, offset: Int, direction: String): Int? {
    val length = text.length
    val safeOffset = offset.coerceIn(0, length)
    return when (direction) {
      "left" -> {
        if (safeOffset <= 0) {
          0
        } else {
          Character.offsetByCodePoints(text, safeOffset, -1).coerceAtLeast(0)
        }
      }
      "right" -> {
        if (safeOffset >= length) {
          length
        } else {
          Character.offsetByCodePoints(text, safeOffset, 1).coerceAtMost(length)
        }
      }
      "up" -> stepCursorVertical(text, safeOffset, -1)
      "down" -> stepCursorVertical(text, safeOffset, 1)
      else -> null
    }
  }

  private fun stepCursorVertical(text: String, offset: Int, lineDelta: Int): Int {
    if (lineDelta == 0) {
      return offset
    }
    val lines = text.split('\n')
    if (lines.size <= 1) {
      return offset
    }

    var lineIndex = 0
    var lineStart = 0
    for (index in lines.indices) {
      val lineEnd = lineStart + lines[index].length
      if (offset <= lineEnd) {
        lineIndex = index
        break
      }
      lineStart = lineEnd + 1
      lineIndex = index + 1
    }

    val column = (offset - lineStart).coerceAtLeast(0)
    val nextLineIndex = (lineIndex + lineDelta).coerceIn(0, lines.lastIndex)
    var nextLineStart = 0
    for (index in 0 until nextLineIndex) {
      nextLineStart += lines[index].length + 1
    }
    val nextColumn = column.coerceAtMost(lines[nextLineIndex].length)
    return nextLineStart + nextColumn
  }

  private fun sendCursorDirectionKeyEvent(
      connection: InputConnection,
      direction: String,
      extendSelection: Boolean,
  ): Boolean {
    val keyCode =
        when (direction) {
          "left" -> KeyEvent.KEYCODE_DPAD_LEFT
          "right" -> KeyEvent.KEYCODE_DPAD_RIGHT
          "up" -> KeyEvent.KEYCODE_DPAD_UP
          "down" -> KeyEvent.KEYCODE_DPAD_DOWN
          else -> return false
        }
    val metaState =
        if (extendSelection) {
          KeyEvent.META_SHIFT_ON or KeyEvent.META_SHIFT_LEFT_ON
        } else {
          0
        }
    val eventTime = SystemClock.uptimeMillis()
    connection.sendKeyEvent(
        KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0, metaState),
    )
    connection.sendKeyEvent(
        KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0, metaState),
    )
    return true
  }

  @ReactMethod
  fun copySelection(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val selected = connection.getSelectedText(0)?.toString().orEmpty()
        if (selected.isEmpty()) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val manager =
            reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
                ClipboardManager
        manager.setPrimaryClip(ClipData.newPlainText("text", selected))
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("COPY_SELECTION_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun cutSelection(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val selected = connection.getSelectedText(0)?.toString().orEmpty()
        if (selected.isEmpty()) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val manager =
            reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
                ClipboardManager
        manager.setPrimaryClip(ClipData.newPlainText("text", selected))
        connection.commitText("", 1)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("CUT_SELECTION_FAILED", error)
      }
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
    performKeyHapticInternal()
  }

  @ReactMethod
  fun syncCustomTapSound() {
    KeyTapSoundPlayer.sync(reactApplicationContext)
  }

  @ReactMethod
  fun playCustomTapSound() {
    KeyTapSoundPlayer.sync(reactApplicationContext)
    KeyTapSoundPlayer.play(reactApplicationContext)
  }

  private fun performKeyHapticInternal() {
    val view =
        KeyboardInputBridge.inputService?.popupAnchorView
            ?: reactApplicationContext.currentActivity?.window?.decorView
            ?: return

    val feedback = Runnable {
      if (KeyboardInputBridge.isKeyHapticEnabled()) {
        view.performHapticFeedback(
            HapticFeedbackConstants.KEYBOARD_TAP,
            HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
        )
      }
      KeyTapSoundPlayer.play(reactApplicationContext)
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

  private fun hasMediaImagesPermissionInternal(): Boolean {
    val permission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          Manifest.permission.READ_MEDIA_IMAGES
        } else {
          Manifest.permission.READ_EXTERNAL_STORAGE
        }
    return ContextCompat.checkSelfPermission(reactApplicationContext, permission) ==
        PackageManager.PERMISSION_GRANTED
  }

  private fun looksLikeScreenshot(name: String, relativePath: String): Boolean {
    val haystack = "$relativePath/$name".lowercase()
    return haystack.contains("screenshot") ||
        haystack.contains("screen_shot") ||
        haystack.contains("screen shot") ||
        haystack.contains("screenshots/") ||
        haystack.contains("pictures/screenshots")
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

  /**
   * Attempt to read the current primary clip (if it holds an image URI) and
   * persist a copy into our private clipboard_images dir. Returns the JSON
   * description on success, or null. This is called from the clip listener
   * while grants are fresh, and also from getClipboardContent.
   */
  private fun tryCaptureCurrentClipboardImage(): String? {
    return try {
      val manager =
          reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as
              ClipboardManager
      val clip = manager.primaryClip
      if (clip == null || clip.itemCount == 0) {
        return null
      }
      val item = clip.getItemAt(0)
      val uri = item.uri ?: return null
      val mimeType =
          reactApplicationContext.contentResolver.getType(uri)
              ?: clip.description?.getMimeType(0)
              ?: "image/*"
      if (!mimeType.startsWith("image/")) {
        return null
      }
      saveClipboardImage(uri, mimeType)
    } catch (_: Exception) {
      null
    }
  }

  companion object {
    private const val PREFS_NAME = "typebase_keyboard"
    private const val LEARNED_WORDS_KEY = "learned_words"
    private const val ESSENTIALS_KEY = "essentials"
    private const val CLIPBOARD_HISTORY_KEY = "clipboard_history"
    private const val RECENT_EMOJIS_KEY = "recent_emojis"
    private const val GESTURE_SETTINGS_KEY = "gesture_settings"
    private const val AUTOCORRECT_SETTINGS_KEY = "autocorrect_settings"
    private const val LEARNED_PHRASES_KEY = "learned_phrases"
    private const val COMMA_LAUNCHER_ARMED_KEY = "comma_launcher_armed"
    private const val PERIOD_REWRITE_ARMED_KEY = "period_rewrite_armed"
    private const val API_KEYS_KEY = "api_keys"
    private const val AI_PROVIDER_KEY = "ai_provider"
    private const val DEFAULT_AI_PROVIDER = "gemini"
    private const val VOICE_STT_PROVIDER_KEY = "voice_stt_provider"
    private const val DEFAULT_VOICE_STT_PROVIDER = "speechmatics"
    private const val KEYBOARD_THEME_KEY = "keyboard_theme"
    private const val DEFAULT_KEYBOARD_THEME = "light"
    private const val KEYBOARD_DESIGN_KEY = "keyboard_design"
    private const val DEFAULT_KEYBOARD_DESIGN = "typebase"
    private const val KEYBOARD_CUSTOM_THEME_KEY = "keyboard_custom_theme"
    private const val DEFAULT_KEYBOARD_CUSTOM_THEME = "{}"
    private const val KEYBOARD_LAYOUT_KEY = "keyboard_layout"
    private const val CUSTOM_LETTER_LAYOUTS_KEY = "custom_letter_layouts"
    private const val DEFAULT_KEYBOARD_LAYOUT =
        """{"keyHeight":47,"keyGap":5,"keyRowMargin":12,"keyRadius":6,"enterKeyPreviewEnabled":true,"developerEyeEnabled":false,"letterSymbolAlternatesEnabled":false,"letterLayoutId":"en-us","keyHapticEnabled":true,"floatingKeyboardEnabled":false}"""
    private const val DEFAULT_API_KEYS =
        """{"geminiApiKey":"","speechmaticsApiKey":""}"""
    private const val DEFAULT_GESTURE_SETTINGS =
        """{"swipeTyping":true,"spaceCursorSwipe":true,"backspaceWordSwipe":true,"backspaceSentenceHold":false,"commaLauncher":true,"trackpadMode":true,"launcherAppPackage":"com.typebase.app"}"""
    private const val DEFAULT_AUTOCORRECT_SETTINGS =
        """{"enabled":true,"autoApplyOnSpace":true}"""
  }
}
