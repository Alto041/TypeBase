package com.typebase.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicBoolean

class VoiceRecorderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VoiceRecorderModule"

  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  private val isRecording = AtomicBoolean(false)

  private fun sendEvent(eventName: String, params: WritableMap?) {
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
  }

  @ReactMethod
  fun hasMicPermission(promise: Promise) {
    val granted =
        ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun openAppForMicPermission(promise: Promise) {
    try {
      val intent =
          Intent(reactApplicationContext, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(MainActivity.EXTRA_REQUEST_MIC, true)
          }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_APP_FAILED", error)
    }
  }

  @ReactMethod
  fun startRecording(promise: Promise) {
    if (isRecording.get()) {
      promise.resolve(true)
      return
    }

    if (ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.RECORD_AUDIO,
    ) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission required")
      return
    }

    val minBufferSize =
        AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
      promise.reject("AUDIO_INIT_FAILED", "Invalid audio buffer size")
      return
    }

    val bufferSize = maxOf(minBufferSize, CHUNK_BYTES)

    try {
      val record =
          AudioRecord(
              MediaRecorder.AudioSource.VOICE_RECOGNITION,
              SAMPLE_RATE,
              CHANNEL_CONFIG,
              AUDIO_FORMAT,
              bufferSize,
          )

      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        promise.reject("AUDIO_INIT_FAILED", "AudioRecord failed to initialize")
        return
      }

      audioRecord = record
      isRecording.set(true)
      record.startRecording()

      recordingThread =
          Thread {
                val buffer = ByteArray(CHUNK_BYTES)
                while (isRecording.get()) {
                  val read = record.read(buffer, 0, buffer.size)
                  if (read > 0) {
                    val chunk = buffer.copyOf(read)
                    val params = Arguments.createMap()
                    params.putString("data", Base64.encodeToString(chunk, Base64.NO_WRAP))
                    sendEvent(EVENT_AUDIO_CHUNK, params)
                  } else if (read < 0) {
                    break
                  }
                }
              }
              .also { it.start() }

      promise.resolve(true)
    } catch (error: SecurityException) {
      promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission required", error)
    } catch (error: Exception) {
      promise.reject("START_RECORDING_FAILED", error)
    }
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    isRecording.set(false)

    try {
      recordingThread?.join(500)
    } catch (_: InterruptedException) {
    }
    recordingThread = null

    audioRecord?.let { record ->
      try {
        if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          record.stop()
        }
      } catch (_: Exception) {
      }
      record.release()
    }
    audioRecord = null
    promise.resolve(true)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  companion object {
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val CHUNK_BYTES = 4096 * 2
    private const val EVENT_AUDIO_CHUNK = "VoiceRecorderAudioChunk"
  }
}
