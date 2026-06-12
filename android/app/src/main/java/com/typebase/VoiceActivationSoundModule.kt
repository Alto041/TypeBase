package com.typebase

import android.media.MediaPlayer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceActivationSoundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VoiceActivationSoundModule"

  private var player: MediaPlayer? = null

  @ReactMethod
  fun preload(promise: Promise) {
    try {
      ensurePlayer()
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun play(promise: Promise) {
    try {
      val mediaPlayer = ensurePlayer()
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

  private fun ensurePlayer(): MediaPlayer {
    player?.let { return it }

    val mediaPlayer =
        MediaPlayer.create(reactApplicationContext, R.raw.voice)
            ?: throw IllegalStateException("voice sound resource missing")

    mediaPlayer.setOnCompletionListener { completed ->
      completed.seekTo(0)
    }
    player = mediaPlayer
    return mediaPlayer
  }

  override fun invalidate() {
    player?.release()
    player = null
    super.invalidate()
  }
}
