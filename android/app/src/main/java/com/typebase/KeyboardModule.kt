package com.typebase

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

class KeyboardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "KeyboardModule"

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
    UiThreadUtil.runOnUiThread {
      val connection = KeyboardInputBridge.getInputConnection() ?: return@runOnUiThread
      val selected = connection.getSelectedText(0)
      if (selected != null && selected.isNotEmpty()) {
        connection.commitText("", 1)
        return@runOnUiThread
      }
      connection.deleteSurroundingText(1, 0)
    }
  }

  @ReactMethod
  fun insertNewline() {
    val connection = KeyboardInputBridge.getInputConnection() ?: return
    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
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
        val connection = KeyboardInputBridge.getInputConnection()
        if (connection == null) {
          promise.resolve(false)
          return@runOnUiThread
        }
        val before = connection.getTextBeforeCursor(1000, 0)?.toString().orEmpty()
        if (before.isEmpty()) {
          promise.resolve(false)
          return@runOnUiThread
        }
        var end = before.length
        while (end > 0 && before[end - 1].isWhitespace()) {
          end--
        }
        var start = end
        while (start > 0 && !before[start - 1].isWhitespace()) {
          start--
        }
        val deleteCount = before.length - start
        if (deleteCount > 0) {
          connection.deleteSurroundingText(deleteCount, 0)
        }
        promise.resolve(deleteCount > 0)
      } catch (error: Exception) {
        promise.reject("DELETE_WORD_BACKWARD_FAILED", error)
      }
    }
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
    UiThreadUtil.runOnUiThread {
      val view =
          KeyboardInputBridge.inputService?.window?.window?.decorView
              ?: reactApplicationContext.currentActivity?.window?.decorView
              ?: return@runOnUiThread

      val feedbackConstant =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.CONFIRM
          } else {
            HapticFeedbackConstants.KEYBOARD_TAP
          }

      view.performHapticFeedback(
          feedbackConstant,
          HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
      )
    }
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
    private const val DEFAULT_GESTURE_SETTINGS =
        """{"swipeTyping":true,"spaceCursorSwipe":true,"backspaceWordSwipe":true,"backspaceSentenceHold":false,"commaLauncher":true,"trackpadMode":true,"launcherAppPackage":"com.typebase"}"""
    private const val DEFAULT_AUTOCORRECT_SETTINGS =
        """{"enabled":true,"autoApplyOnSpace":false}"""
  }
}
