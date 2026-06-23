package com.typebase.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
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
  private val mainHandler = Handler(Looper.getMainLooper())
  private var speechRecognizer: SpeechRecognizer? = null
  private val isAndroidSttListening = AtomicBoolean(false)

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
  fun isAndroidSpeechRecognitionAvailable(promise: Promise) {
    promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactApplicationContext))
  }

  @ReactMethod
  fun startAndroidSpeechRecognition(promise: Promise) {
    if (ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.RECORD_AUDIO,
    ) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission required")
      return
    }

    if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
      promise.reject("ANDROID_STT_UNAVAILABLE", "Android speech recognition unavailable")
      return
    }

    mainHandler.post {
      try {
        stopAndroidSpeechRecognitionInternal()

        val recognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
        speechRecognizer = recognizer
        isAndroidSttListening.set(true)

        recognizer.setRecognitionListener(
            object : RecognitionListener {
              override fun onReadyForSpeech(params: Bundle?) {
                sendAndroidSttEvent(EVENT_ANDROID_STT_READY, null)
              }

              override fun onBeginningOfSpeech() {
                sendAndroidSttEvent(EVENT_ANDROID_STT_BEGIN, null)
              }

              override fun onRmsChanged(rmsdB: Float) {}

              override fun onBufferReceived(buffer: ByteArray?) {}

              override fun onEndOfSpeech() {
                sendAndroidSttEvent(EVENT_ANDROID_STT_END, null)
              }

              override fun onError(error: Int) {
                val params = Arguments.createMap()
                params.putInt("code", error)
                params.putString("message", androidSttErrorMessage(error))
                sendAndroidSttEvent(EVENT_ANDROID_STT_ERROR, params)
                stopAndroidSpeechRecognitionInternal()
              }

              override fun onResults(results: Bundle?) {
                val text = bestSpeechRecognitionText(results)
                if (text.isNotBlank()) {
                  val params = Arguments.createMap()
                  params.putString("text", text)
                  sendAndroidSttEvent(EVENT_ANDROID_STT_FINAL, params)
                }
                stopAndroidSpeechRecognitionInternal()
              }

              override fun onPartialResults(partialResults: Bundle?) {
                val text = bestSpeechRecognitionText(partialResults)
                if (text.isNotBlank()) {
                  val params = Arguments.createMap()
                  params.putString("text", text)
                  sendAndroidSttEvent(EVENT_ANDROID_STT_PARTIAL, params)
                }
              }

              override fun onEvent(eventType: Int, params: Bundle?) {}
            })

        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
              putExtra(
                  RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                  RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
              )
              putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
              putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
              putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactApplicationContext.packageName)
            }

        recognizer.startListening(intent)
        promise.resolve(true)
      } catch (error: SecurityException) {
        stopAndroidSpeechRecognitionInternal()
        promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission required", error)
      } catch (error: Exception) {
        stopAndroidSpeechRecognitionInternal()
        promise.reject("ANDROID_STT_START_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun stopAndroidSpeechRecognition(promise: Promise) {
    mainHandler.post {
      stopAndroidSpeechRecognitionInternal()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  private fun sendAndroidSttEvent(eventName: String, params: WritableMap?) {
    sendEvent(eventName, params)
  }

  private fun stopAndroidSpeechRecognitionInternal() {
    if (!isAndroidSttListening.getAndSet(false) && speechRecognizer == null) {
      return
    }

    speechRecognizer?.let { recognizer ->
      try {
        recognizer.stopListening()
      } catch (_: Exception) {
      }
      try {
        recognizer.cancel()
      } catch (_: Exception) {
      }
      try {
        recognizer.destroy()
      } catch (_: Exception) {
      }
    }
    speechRecognizer = null
  }

  private fun bestSpeechRecognitionText(results: Bundle?): String {
    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
    return matches?.firstOrNull().orEmpty().trim()
  }

  private fun androidSttErrorMessage(error: Int): String {
    return when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
      SpeechRecognizer.ERROR_CLIENT -> "Speech recognition client error"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
      SpeechRecognizer.ERROR_NETWORK -> "Network error"
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
      SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer busy"
      SpeechRecognizer.ERROR_SERVER -> "Speech recognition server error"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected"
      else -> "Speech recognition error"
    }
  }

  companion object {
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val CHUNK_BYTES = 4096 * 2
    private const val EVENT_AUDIO_CHUNK = "VoiceRecorderAudioChunk"
    private const val EVENT_ANDROID_STT_READY = "VoiceRecorderAndroidSttReady"
    private const val EVENT_ANDROID_STT_BEGIN = "VoiceRecorderAndroidSttBegin"
    private const val EVENT_ANDROID_STT_END = "VoiceRecorderAndroidSttEnd"
    private const val EVENT_ANDROID_STT_PARTIAL = "VoiceRecorderAndroidSttPartial"
    private const val EVENT_ANDROID_STT_FINAL = "VoiceRecorderAndroidSttFinal"
    private const val EVENT_ANDROID_STT_ERROR = "VoiceRecorderAndroidSttError"
  }
}
