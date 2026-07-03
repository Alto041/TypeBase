package com.typebase.app

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Log
import java.io.File
import org.json.JSONObject

object KeyTapSoundPlayer {
  private const val TAG = "KeyTapSoundPlayer"
  private const val PREFS_NAME = "typebase_keyboard"
  private const val LAYOUT_KEY = "keyboard_layout"
  private const val TAP_SOUND_DIR = "keyboard_tap_sounds"

  @Volatile private var enabled: Boolean = false

  @Volatile private var loadedFile: String? = null

  @Volatile private var soundId: Int = 0

  private var soundPool: SoundPool? = null

  fun sync(context: Context) {
    val appContext = context.applicationContext
    val layoutJson =
        appContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(LAYOUT_KEY, null)
            ?: return

    try {
      val layout = JSONObject(layoutJson)
      KeyboardInputBridge.syncLayoutSettings(layoutJson)
      val nextEnabled = layout.optBoolean("customTapSoundEnabled", false)
      val fileName =
          layout.optString("customTapSoundFile", "").trim().takeIf { it.isNotEmpty() }

      // Meme SFX (named `myinstants_*`) must never be used as a key tap sound.
      // An earlier build accidentally installed selected sounds here; guard so
      // they can never play on keypress even if the setting is still stale.
      val isMemeSound = fileName?.startsWith("myinstants_") == true

      if (!nextEnabled || fileName == null || isMemeSound) {
        release()
        enabled = false
        loadedFile = null
        return
      }

      val soundFile = File(appContext.filesDir, "$TAP_SOUND_DIR/$fileName")
      if (!soundFile.exists() || !soundFile.isFile) {
        release()
        enabled = false
        loadedFile = null
        return
      }

      if (enabled && loadedFile == soundFile.absolutePath && soundId != 0) {
        return
      }

      release()
      val pool = createSoundPool()
      val id = pool.load(soundFile.absolutePath, 1)
      if (id == 0) {
        pool.release()
        enabled = false
        loadedFile = null
        return
      }

      soundPool = pool
      soundId = id
      enabled = true
      loadedFile = soundFile.absolutePath
    } catch (error: Exception) {
      Log.w(TAG, "Failed to sync custom tap sound", error)
      release()
      enabled = false
      loadedFile = null
    }
  }

  fun play(context: Context) {
    val pool = soundPool
    val id = soundId
    if (!enabled || pool == null || id == 0) {
      return
    }
    pool.play(id, 0.45f, 0.45f, 1, 0, 1f)
  }

  private fun createSoundPool(): SoundPool {
    val attributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
    return SoundPool.Builder().setMaxStreams(4).setAudioAttributes(attributes).build()
  }

  private fun release() {
    soundPool?.release()
    soundPool = null
    soundId = 0
  }
}
