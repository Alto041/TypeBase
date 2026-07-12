package com.typebase.app

import android.content.Context
import android.content.res.AssetFileDescriptor
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Log
import java.io.File
import org.json.JSONObject

object KeyTapSoundPlayer {
  private const val TAG = "KeyTapSoundPlayer"
  private const val PREFS_NAME = "typebase_keyboard"
  private const val LAYOUT_KEY = "keyboard_layout"
  private const val DESIGN_KEY = "keyboard_design"
  private const val TAP_SOUND_DIR = "keyboard_tap_sounds"
  private const val MACINTOSH_ASSET = "sounds/mac-sfx.mp3"
  private const val MACINTOSH_LOADED_TOKEN = "asset:$MACINTOSH_ASSET"

  @Volatile private var enabled: Boolean = false

  @Volatile private var loadedFile: String? = null

  @Volatile private var soundId: Int = 0

  private var soundPool: SoundPool? = null

  fun sync(context: Context) {
    val appContext = context.applicationContext
    val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val layoutJson = prefs.getString(LAYOUT_KEY, null) ?: return

    try {
      val layout = JSONObject(layoutJson)
      KeyboardInputBridge.syncLayoutSettings(layoutJson)
      val nextEnabled = layout.optBoolean("customTapSoundEnabled", false)
      val design = prefs.getString(DESIGN_KEY, "typebase") ?: "typebase"

      if (!nextEnabled) {
        release()
        enabled = false
        loadedFile = null
        return
      }

      if (design == "macintosh") {
        loadMacintoshAsset(appContext)
        return
      }

      val fileName =
          layout.optString("customTapSoundFile", "").trim().takeIf { it.isNotEmpty() }

      // Meme SFX (named `myinstants_*`) must never be used as a key tap sound.
      val isMemeSound = fileName?.startsWith("myinstants_") == true

      if (fileName == null || isMemeSound) {
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

  private fun loadMacintoshAsset(appContext: Context) {
    if (enabled && loadedFile == MACINTOSH_LOADED_TOKEN && soundId != 0) {
      return
    }

    release()
    var afd: AssetFileDescriptor? = null
    try {
      afd = appContext.assets.openFd(MACINTOSH_ASSET)
      val pool = createSoundPool()
      val id = pool.load(afd, 1)
      if (id == 0) {
        pool.release()
        enabled = false
        loadedFile = null
        return
      }
      soundPool = pool
      soundId = id
      enabled = true
      loadedFile = MACINTOSH_LOADED_TOKEN
    } catch (error: Exception) {
      Log.w(TAG, "Failed to load Macintosh tap sound", error)
      release()
      enabled = false
      loadedFile = null
    } finally {
      try {
        afd?.close()
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  fun play(context: Context) {
    if (!enabled) {
      return
    }
    val pool = soundPool
    val id = soundId
    if (pool == null || id == 0) {
      return
    }
    pool.play(id, 0.45f, 0.45f, 1, 0, 1f)
  }

  /** Cheap guard — avoids posting audio work when tap sound is off. */
  fun isEnabled(): Boolean = enabled

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
