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
  private const val DEFAULT_TAP_SOUND_FILE = "electronic_1_blip.wav"
  private const val LEGACY_DEFAULT_TAP_SOUND_FILE = "1.mp3"
  private val LEGACY_TAP_SOUND_ALIASES =
      mapOf(
          "keytap_soft.wav" to "electronic_1_blip.wav",
          "keytap_soft_low.wav" to "electronic_2_glass.wav",
          "keytap_soft_high.wav" to "electronic_3_pulse.wav",
      )
  private val BUNDLED_TAP_ASSETS =
      mapOf(
          "electronic_1_blip.wav" to "sounds/electronic_1_blip.wav",
          "electronic_2_glass.wav" to "sounds/electronic_2_glass.wav",
          "electronic_3_pulse.wav" to "sounds/electronic_3_pulse.wav",
          "typebase_keytap_soft.wav" to "sounds/Key/typebase_keytap_soft.wav",
      )
  private const val MACINTOSH_ASSET = "sounds/mac-sfx.mp3"
  private const val MACINTOSH_LOADED_TOKEN = "asset:$MACINTOSH_ASSET"
  /** Left/right gain for key taps (SoundPool). */
  private const val TAP_VOLUME = 0.32f
  /** Slightly slower playback reads softer than full-speed click. */
  private const val TAP_PLAYBACK_RATE = 0.96f

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

      if (isBundledTapSound(fileName)) {
        loadBundledTapSound(appContext, fileName)
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

  private fun resolveBundledTapSoundName(fileName: String): String {
    return LEGACY_TAP_SOUND_ALIASES[fileName] ?: fileName
  }

  private fun isBundledTapSound(fileName: String): Boolean {
    val resolved = resolveBundledTapSoundName(fileName)
    if (BUNDLED_TAP_ASSETS.containsKey(resolved)) {
      return true
    }
    return fileName == LEGACY_DEFAULT_TAP_SOUND_FILE || fileName == "typebase_keytap_soft.mp3"
  }

  private fun bundledAssetPath(fileName: String): String? {
    if (fileName == "typebase_keytap_soft.mp3") {
      return BUNDLED_TAP_ASSETS["typebase_keytap_soft.wav"]
    }
    val resolved = resolveBundledTapSoundName(fileName)
    return BUNDLED_TAP_ASSETS[resolved]
  }

  private fun tapSoundStorageDir(appContext: Context): File {
    val dir = File(appContext.filesDir, TAP_SOUND_DIR)
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  /** Prefer JS-copied file; otherwise extract bundled WAV into app files (IME-safe). */
  private fun resolveBundledTapSoundFile(appContext: Context, fileName: String): File? {
    val resolvedName = resolveBundledTapSoundName(fileName)
    val dir = tapSoundStorageDir(appContext)
    val preferred = File(dir, resolvedName)
    if (preferred.exists() && preferred.isFile && preferred.length() > 64) {
      return preferred
    }

    if (fileName == "typebase_keytap_soft.mp3") {
      val legacyMp3 = File(dir, "typebase_keytap_soft.mp3")
      if (legacyMp3.exists() && legacyMp3.isFile && legacyMp3.length() > 64) {
        return legacyMp3
      }
    }

    val assetPath = bundledAssetPath(fileName) ?: return null
    try {
      appContext.assets.open(assetPath).use { input ->
        preferred.outputStream().use { output -> input.copyTo(output) }
      }
      if (preferred.exists() && preferred.length() > 64) {
        return preferred
      }
    } catch (error: Exception) {
      Log.w(TAG, "Failed to extract bundled tap sound asset ($fileName)", error)
    }
    return null
  }

  private fun loadBundledTapSound(appContext: Context, fileName: String) {
    val resolvedName = resolveBundledTapSoundName(fileName)
    val soundFile = resolveBundledTapSoundFile(appContext, fileName)
    if (soundFile == null) {
      release()
      enabled = false
      loadedFile = null
      return
    }
    val assetPath = bundledAssetPath(resolvedName) ?: soundFile.absolutePath
    val loadedToken = "asset:$assetPath"
    loadTapSoundFile(appContext, soundFile, loadedToken)
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
    pool.play(id, TAP_VOLUME, TAP_VOLUME, 1, 0, TAP_PLAYBACK_RATE)
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
