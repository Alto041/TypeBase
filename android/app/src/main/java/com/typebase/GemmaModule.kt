package com.typebase

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class GemmaModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private var llmInference: LlmInference? = null
  private var downloadCancelled = AtomicBoolean(false)

  override fun getName(): String = "GemmaModule"

  private fun modelFile(): File =
      File(reactContext.filesDir, MODEL_FILENAME)

  private fun resolveOnUiThread(promise: Promise, value: Any?) {
    UiThreadUtil.runOnUiThread { promise.resolve(value) }
  }

  private fun rejectOnUiThread(
      promise: Promise,
      code: String,
      message: String?,
      error: Throwable? = null,
  ) {
    UiThreadUtil.runOnUiThread {
      if (error != null) {
        promise.reject(code, message, error)
      } else {
        promise.reject(code, message)
      }
    }
  }

  @ReactMethod
  fun isModelDownloaded(promise: Promise) {
    promise.resolve(modelFile().exists() && modelFile().length() > MIN_MODEL_BYTES)
  }

  @ReactMethod
  fun getModelPath(promise: Promise) {
    val file = modelFile()
    if (!file.exists() || file.length() <= MIN_MODEL_BYTES) {
      promise.reject("MODEL_MISSING", "On-device model is not downloaded yet.")
      return
    }
    promise.resolve(file.absolutePath)
  }

  @ReactMethod
  fun cancelModelDownload() {
    downloadCancelled.set(true)
  }

  @ReactMethod
  fun downloadModel(promise: Promise) {
    downloadCancelled.set(false)
    executor.execute {
      try {
        val destination = modelFile()
        destination.parentFile?.mkdirs()
        val tempFile = File(destination.parentFile, "$MODEL_FILENAME.download")

        val connection = URL(MODEL_URL).openConnection() as HttpURLConnection
        connection.connectTimeout = 30_000
        connection.readTimeout = 60_000
        connection.instanceFollowRedirects = true
        connection.connect()

        val responseCode = connection.responseCode
        if (responseCode !in 200..299) {
          rejectOnUiThread(promise, "DOWNLOAD_FAILED", "HTTP $responseCode")
          return@execute
        }

        val totalBytes = connection.contentLengthLong.coerceAtLeast(0L)
        connection.inputStream.use { input ->
          FileOutputStream(tempFile).use { output ->
            val buffer = ByteArray(64 * 1024)
            var downloaded = 0L
            while (true) {
              if (downloadCancelled.get()) {
                tempFile.delete()
                rejectOnUiThread(promise, "DOWNLOAD_CANCELLED", "Download cancelled")
                return@execute
              }
              val read = input.read(buffer)
              if (read == -1) {
                break
              }
              output.write(buffer, 0, read)
              downloaded += read
              if (totalBytes > 0) {
                emitDownloadProgress(downloaded.toDouble() / totalBytes.toDouble())
              }
            }
          }
        }

        if (destination.exists()) {
          destination.delete()
        }
        if (!tempFile.renameTo(destination)) {
          tempFile.copyTo(destination, overwrite = true)
          tempFile.delete()
        }

        if (!destination.exists() || destination.length() <= MIN_MODEL_BYTES) {
          rejectOnUiThread(promise, "DOWNLOAD_FAILED", "Downloaded model file is invalid.")
          return@execute
        }

        emitDownloadProgress(1.0)
        resolveOnUiThread(promise, destination.absolutePath)
      } catch (error: Throwable) {
        rejectOnUiThread(promise, "DOWNLOAD_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun loadModel(promise: Promise) {
    executor.execute {
      try {
        val file = modelFile()
        if (!file.exists() || file.length() <= MIN_MODEL_BYTES) {
          rejectOnUiThread(
              promise,
              "MODEL_MISSING",
              "Download the on-device model first.",
          )
          return@execute
        }

        llmInference?.close()
        llmInference = null

        val options =
            LlmInference.LlmInferenceOptions.builder()
                .setModelPath(file.absolutePath)
                .setMaxTokens(1024)
                .setMaxTopK(MODEL_TOP_K)
                .build()

        val inference =
            LlmInference.createFromOptions(reactContext.applicationContext, options)
        llmInference = inference
        resolveOnUiThread(promise, "loaded")
      } catch (error: Throwable) {
        llmInference?.close()
        llmInference = null
        rejectOnUiThread(promise, "LOAD_ERROR", error.message ?: "Failed to load model", error)
      }
    }
  }

  @ReactMethod
  fun isModelLoaded(promise: Promise) {
    promise.resolve(llmInference != null)
  }

  @ReactMethod
  fun unloadModel() {
    executor.execute {
      llmInference?.close()
      llmInference = null
    }
  }

  @ReactMethod
  fun generateResponse(prompt: String, promise: Promise) {
    executor.execute {
      try {
        val inference = llmInference
        if (inference == null) {
          rejectOnUiThread(
              promise,
              "MODEL_NOT_LOADED",
              "Load the on-device model first.",
          )
          return@execute
        }

        val sessionOptions = createSessionOptions()
        LlmInferenceSession.createFromOptions(inference, sessionOptions).use { session ->
          session.addQueryChunk(prompt)
          val result = session.generateResponse()
          resolveOnUiThread(promise, result)
        }
      } catch (error: Throwable) {
        rejectOnUiThread(
            promise,
            "INFERENCE_ERROR",
            error.message ?: "On-device inference failed",
            error,
        )
      }
    }
  }

  override fun invalidate() {
    downloadCancelled.set(true)
    executor.execute {
      llmInference?.close()
      llmInference = null
    }
    executor.shutdown()
    super.invalidate()
  }

  private fun createSessionOptions(): LlmInferenceSession.LlmInferenceSessionOptions =
      LlmInferenceSession.LlmInferenceSessionOptions.builder()
          .setTemperature(MODEL_TEMPERATURE)
          .setTopK(MODEL_TOP_K)
          .setTopP(MODEL_TOP_P)
          .build()

  private fun emitDownloadProgress(progress: Double) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }
    mainHandler.post {
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("gemmaDownloadProgress", progress.coerceIn(0.0, 1.0))
    }
  }

  companion object {
    private const val MODEL_URL =
        "https://pub-8e31d16ca4f04d94b8e3e5f258fcbc2b.r2.dev/gemma3-1B-it-int4.task"
    private const val MODEL_FILENAME = "gemma3-1b-it-int4.task"
    private const val MIN_MODEL_BYTES = 100L * 1024L * 1024L
    private const val MODEL_TEMPERATURE = 0f
    private const val MODEL_TOP_K = 1
    private const val MODEL_TOP_P = 1f
  }
}
