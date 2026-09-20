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
  private const val DEFAULT_TAP_SOUND_FILE = "typebase_keytap_soft.wav"
  private const val LEGACY_DEFAULT_TAP_SOUND_FILE = "1.mp3"
  private const val DEFAULT_TAP_ASSET = "sounds/Key/typebase_keytap_soft.wav"
  private const val DEFAULT_LOADED_TOKEN = "asset:$DEFAULT_TAP_ASSET"
  private const val MACINTOSH_ASSET = "sounds/mac-sfx.mp3"
  private const val MACINTOSH_LOADED_TOKEN = "asset:$MACINTOSH_ASSET"

  @Volatile private var enabled: Boolean = false
  @Volatile private var soundReady: Boolean = false

  @Volatile private var loadedFile: String? = null

  @Volatile private var soundId: Int = 0

  private var soundPool: SoundPool? = null

  fun sync(context: Context) {
    val appContext = context.applicationContext
    val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val layoutJson =
        prefs.getString(
            LAYOUT_KEY,
            """{"customTapSoundEnabled":true,"customTapSoundFile":"$DEFAULT_TAP_SOUND_FILE"}""",
        )
            ?: return

    try {
      val layout = JSONObject(layoutJson)
      KeyboardInputBridge.syncLayoutSettings(layoutJson)
      val nextEnabled = layout.optBoolean("customTapSoundEnabled", true)
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
          layout.optString("customTapSoundFile", DEFAULT_TAP_SOUND_FILE)
              .trim()
              .takeIf { it.isNotEmpty() }

      val isMemeSound = fileName?.startsWith("myinstants_") == true

      if (fileName == null || isMemeSound) {
        release()
        enabled = false
        loadedFile = null
        return
      }

      if (isBundledDefaultTapSound(fileName)) {
        loadDefaultTapSound(appContext)
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

      loadTapSoundFile(appContext, soundFile)
    } catch (error: Exception) {
      Log.w(TAG, "Failed to sync custom tap sound", error)
      release()
      enabled = false
      loadedFile = null
    }
  }

  private fun isBundledDefaultTapSound(fileName: String): Boolean {
    return fileName == DEFAULT_TAP_SOUND_FILE ||
        fileName == LEGACY_DEFAULT_TAP_SOUND_FILE ||
        fileName == "typebase_keytap_soft.mp3"
  }

  private fun tapSoundStorageDir(appContext: Context): File {
    val dir = File(appContext.filesDir, TAP_SOUND_DIR)
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  /** Prefer JS-copied file; otherwise extract bundled WAV into app files (IME-safe). */
  private fun resolveDefaultTapSoundFile(appContext: Context): File? {
    val dir = tapSoundStorageDir(appContext)
    val preferred = File(dir, DEFAULT_TAP_SOUND_FILE)
    if (preferred.exists() && preferred.isFile && preferred.length() > 64) {
      return preferred
    }

    val legacyMp3 = File(dir, "typebase_keytap_soft.mp3")
    if (legacyMp3.exists() && legacyMp3.isFile && legacyMp3.length() > 64) {
      return legacyMp3
    }

    try {
      appContext.assets.open(DEFAULT_TAP_ASSET).use { input ->
        preferred.outputStream().use { output -> input.copyTo(output) }
      }
      if (preferred.exists() && preferred.length() > 64) {
        return preferred
      }
    } catch (error: Exception) {
      Log.w(TAG, "Failed to extract default tap sound asset", error)
    }
    return null
  }

  private fun loadDefaultTapSound(appContext: Context) {
    val soundFile = resolveDefaultTapSoundFile(appContext)
    if (soundFile == null) {
      release()
      enabled = false
      loadedFile = null
      return
    }
    loadTapSoundFile(appContext, soundFile, DEFAULT_LOADED_TOKEN)
  }

  private fun loadTapSoundFile(
      appContext: Context,
      soundFile: File,
      loadedToken: String = soundFile.absolutePath,
  ) {
    if (enabled && loadedFile == loadedToken && soundId != 0) {
      return
    }

    release()
    try {
      val pool = createSoundPool()
      pool.setOnLoadCompleteListener { loadedPool, _, status ->
        if (status == 0 && loadedPool === soundPool) {
          enabled = true
          soundReady = true
        } else if (status != 0) {
          Log.w(TAG, "Tap sound load failed with status=$status for ${soundFile.name}")
        }
      }
      val id = pool.load(soundFile.absolutePath, 1)
      if (id == 0) {
        pool.release()
        enabled = false
        loadedFile = null
        return
      }

      soundPool = pool
      soundId = id
      enabled = false
      soundReady = false
      loadedFile = loadedToken
    } catch (error: Exception) {
      Log.w(TAG, "Failed to load tap sound file", error)
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
      pool.setOnLoadCompleteListener { loadedPool, _, status ->
        if (status == 0 && loadedPool === soundPool) {
          enabled = true
          soundReady = true
        }
      }
      val id = pool.load(afd, 1)
      if (id == 0) {
        pool.release()
        enabled = false
        loadedFile = null
        return
      }
      soundPool = pool
      soundId = id
      enabled = false
      soundReady = false
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
    if (pool == null || id == 0 || !soundReady) {
      return
    }
    pool.play(id, 0.55f, 0.55f, 1, 0, 1f)
  }

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
    enabled = false
    soundReady = false
    soundPool?.release()
    soundPool = null
    soundId = 0
  }
}
