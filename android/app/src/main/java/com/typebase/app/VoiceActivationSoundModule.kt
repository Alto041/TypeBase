package com.typebase.app

import android.media.MediaPlayer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceActivationSoundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VoiceActivationSoundModule"

  private var voicePlayer: MediaPlayer? = null
  private var switchPlayer: MediaPlayer? = null
  private var switchOffPlayer: MediaPlayer? = null
  private var navigationPlayer: MediaPlayer? = null

  @ReactMethod
  fun preload(promise: Promise) {
    try {
      ensureVoicePlayer()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun play(promise: Promise) {
    try {
      val mediaPlayer = ensureVoicePlayer()
      if (mediaPlayer.isPlaying) {
        mediaPlayer.pause()
        mediaPlayer.seekTo(0)
      }
      mediaPlayer.start()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun playSwitch(promise: Promise) {
    try {
      val mediaPlayer = ensureSwitchPlayer()
      if (mediaPlayer.isPlaying) {
        mediaPlayer.pause()
        mediaPlayer.seekTo(0)
      }
      mediaPlayer.start()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun playSwitchOff(promise: Promise) {
    try {
      val mediaPlayer = ensureSwitchOffPlayer()
      if (mediaPlayer.isPlaying) {
        mediaPlayer.pause()
        mediaPlayer.seekTo(0)
      }
      mediaPlayer.start()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun playNavigation(promise: Promise) {
    try {
      val mediaPlayer = ensureNavigationPlayer()
      if (mediaPlayer.isPlaying) {
        mediaPlayer.pause()
        mediaPlayer.seekTo(0)
      }
      mediaPlayer.start()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  private fun ensureVoicePlayer(): MediaPlayer {
    voicePlayer?.let { return it }

    val mediaPlayer =
        MediaPlayer.create(reactApplicationContext, R.raw.voice)
            ?: throw IllegalStateException("voice sound resource missing")

    mediaPlayer.setOnCompletionListener { completed ->
      completed.seekTo(0)
    }
    voicePlayer = mediaPlayer
    return mediaPlayer
  }

  private fun ensureSwitchPlayer(): MediaPlayer {
    switchPlayer?.let { return it }

    val mediaPlayer =
        MediaPlayer.create(reactApplicationContext, R.raw.switch_on)
            ?: throw IllegalStateException("switch_on sound resource missing")

    mediaPlayer.setOnCompletionListener { completed ->
      completed.seekTo(0)
    }
    switchPlayer = mediaPlayer
    return mediaPlayer
  }

  private fun ensureSwitchOffPlayer(): MediaPlayer {
    switchOffPlayer?.let { return it }

    val mediaPlayer =
        MediaPlayer.create(reactApplicationContext, R.raw.switch_off)
            ?: throw IllegalStateException("switch_off sound resource missing")

    mediaPlayer.setOnCompletionListener { completed ->
      completed.seekTo(0)
    }
    switchOffPlayer = mediaPlayer
    return mediaPlayer
  }

  private fun ensureNavigationPlayer(): MediaPlayer {
    navigationPlayer?.let { return it }

    val mediaPlayer =
        MediaPlayer.create(reactApplicationContext, R.raw.navigation)
            ?: throw IllegalStateException("navigation sound resource missing")

    mediaPlayer.setOnCompletionListener { completed ->
      completed.seekTo(0)
    }
    navigationPlayer = mediaPlayer
    return mediaPlayer
  }

  override fun invalidate() {
    voicePlayer?.release()
    voicePlayer = null
    switchPlayer?.release()
    switchPlayer = null
    switchOffPlayer?.release()
    switchOffPlayer = null
    navigationPlayer?.release()
    navigationPlayer = null
    super.invalidate()
  }
}
