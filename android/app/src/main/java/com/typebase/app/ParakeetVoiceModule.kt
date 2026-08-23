package com.typebase.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import audio.soniqo.speech.ModelManager
import audio.soniqo.speech.ModelPrecision
import audio.soniqo.speech.PipelineMode
import audio.soniqo.speech.SpeechConfig
import audio.soniqo.speech.SpeechEvent
import audio.soniqo.speech.SpeechPipeline
import audio.soniqo.speech.SttBackend
import audio.soniqo.speech.SttModel
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

class ParakeetVoiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ParakeetVoiceModule"

  private val mainHandler = Handler(Looper.getMainLooper())
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var eventJob: Job? = null
  private var pipeline: SpeechPipeline? = null

  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  private val isRecording = AtomicBoolean(false)
  private val isListening = AtomicBoolean(false)
  private val shuttingDown = AtomicBoolean(false)
  private val pipelineLock = Object()

  private fun sendEvent(eventName: String, params: WritableMap?) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }
    mainHandler.post {
      if (!reactContext.hasActiveReactInstance()) {
        return@post
      }
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, params)
    }
  }

  @ReactMethod
  fun isModelDownloaded(promise: Promise) {
    promise.resolve(
        ModelManager.areModelsReady(
            reactContext,
            precision = ModelPrecision.INT8,
            sttModel = SttModel.PARAKEET,
            sttBackend = SttBackend.ONNX,
        ),
    )
  }

  @ReactMethod
  fun downloadModels(promise: Promise) {
    moduleScope.launch {
      try {
        val dir =
            withContext(Dispatchers.IO) {
              ModelManager.ensureModels(
                  reactContext,
                  precision = ModelPrecision.INT8,
                  sttModel = SttModel.PARAKEET,
                  sttBackend = SttBackend.ONNX,
                  onProgress = { progress ->
                    val totalBytes = progress.totalBytes
                    val downloaded = progress.totalBytesDownloaded
                    val fraction =
                        if (totalBytes > 0L) {
                          (downloaded.toDouble() / totalBytes.toDouble()).coerceIn(0.0, 1.0)
                        } else if (progress.totalFiles > 0) {
                          progress.completed.toDouble() / progress.totalFiles.toDouble()
                        } else {
                          0.0
                        }
                    val params = Arguments.createMap()
                    params.putDouble("progress", fraction)
                    params.putString("file", progress.file)
                    sendEvent(EVENT_DOWNLOAD_PROGRESS, params)
                  },
              )
            }
        promise.resolve(dir)
      } catch (error: Throwable) {
        promise.reject("PARAKEET_DOWNLOAD_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    if (isListening.get()) {
      promise.resolve(true)
      return
    }

    if (ContextCompat.checkSelfPermission(
        reactContext,
        Manifest.permission.RECORD_AUDIO,
    ) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission required")
      return
    }

  if (!ModelManager.areModelsReady(
          reactContext,
          precision = ModelPrecision.INT8,
          sttModel = SttModel.PARAKEET,
          sttBackend = SttBackend.ONNX,
      )) {
      promise.reject("MODEL_MISSING", "Download the Parakeet voice model first.")
      return
    }

    moduleScope.launch(Dispatchers.Default) {
      try {
        GemmaModule.releaseForVoiceSession()

        val modelDir =
            ModelManager.modelDir(
                reactContext,
                precision = ModelPrecision.INT8,
                sttModel = SttModel.PARAKEET,
                sttBackend = SttBackend.ONNX,
            )

        val config =
            SpeechConfig(
                modelDir = modelDir,
                useNnapi = false,
                sttModel = SttModel.PARAKEET,
                sttBackend = SttBackend.ONNX,
                pipelineMode = PipelineMode.TRANSCRIBE_ONLY,
                emitPartialTranscriptions = true,
                partialTranscriptionInterval = 0.4f,
                endOfSpeechSilenceSec = 0.8f,
            )

        val speechPipeline = SpeechPipeline(config)
        pipeline = speechPipeline

        eventJob =
            moduleScope.launch(Dispatchers.Main.immediate) {
              speechPipeline.events.collect { event ->
                when (event) {
                  is SpeechEvent.SessionCreated -> sendParakeetEvent(EVENT_READY, null)
                  is SpeechEvent.PartialTranscription -> {
                    val params = Arguments.createMap()
                    params.putString("text", event.text)
                    sendParakeetEvent(EVENT_PARTIAL, params)
                  }
                  is SpeechEvent.TranscriptionCompleted -> {
                    val trimmed = event.text.trim()
                    if (trimmed.isNotEmpty()) {
                      val params = Arguments.createMap()
                      params.putString("text", trimmed)
                      sendParakeetEvent(EVENT_FINAL, params)
                    }
                  }
                  is SpeechEvent.Error -> {
                    val params = Arguments.createMap()
                    params.putString("message", event.message)
                    sendParakeetEvent(EVENT_ERROR, params)
                  }
                  else -> {}
                }
              }
            }

        speechPipeline.start()
        isListening.set(true)
        shuttingDown.set(false)
        startAudioCapture()
        withContext(Dispatchers.Main.immediate) {
          promise.resolve(true)
        }
      } catch (error: Throwable) {
        cleanupPipeline()
        withContext(Dispatchers.Main.immediate) {
          promise.reject("PARAKEET_START_FAILED", error.message, error)
        }
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    mainHandler.post {
      shuttingDown.set(true)
      stopAudioCapture()
      pipeline?.stop()
      cleanupPipeline()
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

  override fun invalidate() {
    stopAudioCapture()
    cleanupPipeline()
    moduleScope.cancel()
    super.invalidate()
  }

  private fun sendParakeetEvent(eventName: String, params: WritableMap?) {
    sendEvent(eventName, params)
  }

  private fun cleanupPipeline() {
    shuttingDown.set(true)
    isListening.set(false)
    eventJob?.cancel()
    eventJob = null
    synchronized(pipelineLock) {
      pipeline?.close()
      pipeline = null
    }
  }

  private fun startAudioCapture() {
    val minBufferSize =
        AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
      throw IllegalStateException("Invalid audio buffer size")
    }

    val bufferSize = maxOf(minBufferSize, CHUNK_BYTES)
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
      throw IllegalStateException("AudioRecord failed to initialize")
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
                  val samples = pcm16ToFloat(buffer, read)
                  synchronized(pipelineLock) {
                    if (!shuttingDown.get() && pipeline != null) {
                      pipeline?.pushAudio(samples)
                    }
                  }
                } else if (read < 0) {
                  break
                }
              }
            }
            .also { it.start() }
  }

  private fun stopAudioCapture() {
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
  }

  private fun pcm16ToFloat(buffer: ByteArray, length: Int): FloatArray {
    val sampleCount = length / 2
    val samples = FloatArray(sampleCount)
    var index = 0
    var offset = 0
    while (index < sampleCount) {
      val lo = buffer[offset].toInt() and 0xFF
      val hi = buffer[offset + 1].toInt()
      val sample = (hi shl 8) or lo
      samples[index] = sample / 32768.0f
      index += 1
      offset += 2
    }
    return samples
  }

  companion object {
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val CHUNK_BYTES = 4096 * 2

    private const val EVENT_DOWNLOAD_PROGRESS = "ParakeetDownloadProgress"
    private const val EVENT_READY = "ParakeetSttReady"
    private const val EVENT_PARTIAL = "ParakeetSttPartial"
    private const val EVENT_FINAL = "ParakeetSttFinal"
    private const val EVENT_ERROR = "ParakeetSttError"
  }
}
