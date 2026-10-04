package com.typebase.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Low-rate accelerometer step-rhythm detector while the IME is visible. No GPS, mic, or network.
 * Tuned to ignore desk fidgeting; needs sustained, regular step cadence.
 */
class WalkMotionDetector(
    context: Context,
    private val onWalkingChanged: (Boolean) -> Unit,
) : SensorEventListener {
  private val sensorManager =
      context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val linearAccelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
  private val accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
  private val activeSensor = linearAccelSensor ?: accelerometerSensor
  private val usesGravityRemoved = linearAccelSensor != null

  private val gravityEstimate = FloatArray(3)

  private var running = false
  private var walking = false
  private var lastPeakAt = 0L
  private var lastRhythmPeakAt = 0L
  private var stillSinceAt = 0L
  private var lastSampleAt = 0L

  private val magnitudeHistory = ArrayDeque<Pair<Long, Float>>()
  /** Peak time + magnitude at that peak (for rhythm + strength checks). */
  private val peakSamples = ArrayDeque<Pair<Long, Float>>()
  private var suppressEnterUntilMs = 0L

  fun start() {
    if (running || activeSensor == null) {
      return
    }
    running = true
    resetInternal()
    gravityEstimate[0] = 0f
    gravityEstimate[1] = 0f
    gravityEstimate[2] = 0f
    sensorManager.registerListener(
        this,
        activeSensor,
        SensorManager.SENSOR_DELAY_UI,
    )
  }

  fun stop() {
    if (!running) {
      return
    }
    running = false
    sensorManager.unregisterListener(this)
    resetInternal()
    setWalking(false)
  }

  private fun resetInternal() {
    magnitudeHistory.clear()
    peakSamples.clear()
    lastPeakAt = 0L
    lastRhythmPeakAt = 0L
    stillSinceAt = 0L
    lastSampleAt = 0L
    suppressEnterUntilMs = 0L
  }

  /** Hand motion while typing mimics steps — pause enter detection and clear peaks. */
  fun noteTypingActivity(now: Long = System.currentTimeMillis()) {
    suppressEnterUntilMs = now + TYPING_SUPPRESS_ENTER_MS
    if (!walking) {
      peakSamples.clear()
      lastPeakAt = 0L
    }
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event == null || !running) {
      return
    }
    val now = System.currentTimeMillis()
    if (now - lastSampleAt < SAMPLE_MIN_INTERVAL_MS) {
      return
    }
    lastSampleAt = now

    val x = event.values[0]
    val y = event.values[1]
    val z = event.values[2]
    val lx: Float
    val ly: Float
    val lz: Float
    if (usesGravityRemoved) {
      lx = x
      ly = y
      lz = z
    } else {
      val alpha = 0.93f
      gravityEstimate[0] = alpha * gravityEstimate[0] + (1f - alpha) * x
      gravityEstimate[1] = alpha * gravityEstimate[1] + (1f - alpha) * y
      gravityEstimate[2] = alpha * gravityEstimate[2] + (1f - alpha) * z
      lx = x - gravityEstimate[0]
      ly = y - gravityEstimate[1]
      lz = z - gravityEstimate[2]
    }
    val vectorMag = sqrt(lx * lx + ly * ly + lz * lz)
    val axisPeak = max(max(abs(lx), abs(ly)), abs(lz))
    val magnitude = max(vectorMag, axisPeak)

    magnitudeHistory.addLast(now to magnitude)
    while (magnitudeHistory.isNotEmpty() && now - magnitudeHistory.first().first > HISTORY_MS) {
      magnitudeHistory.removeFirst()
    }

    detectClassicPeak(now, magnitude)

    if (!walking) {
      if (shouldEnterWalk(now)) {
        setWalking(true)
      }
      return
    }

    if (now - lastRhythmPeakAt > STILL_BEFORE_EXIT_MS) {
      if (stillSinceAt == 0L) {
        stillSinceAt = now
      } else if (now - stillSinceAt >= EXIT_WALK_MS) {
        peakSamples.clear()
        lastPeakAt = 0L
        stillSinceAt = 0L
        setWalking(false)
      }
    } else {
      stillSinceAt = 0L
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  private fun trimPeakWindow(now: Long) {
    while (peakSamples.isNotEmpty() && now - peakSamples.first().first > PEAK_WINDOW_MS) {
      peakSamples.removeFirst()
    }
  }

  private fun peakIntervalAllows(now: Long): Boolean {
    if (lastPeakAt <= 0L) {
      return true
    }
    val interval = now - lastPeakAt
    if (interval < MIN_PEAK_INTERVAL_MS) {
      return false
    }
    val hz = 1000f / interval.toFloat()
    if (hz > MAX_STEP_HZ) {
      return false
    }
    if (interval > MAX_PEAK_INTERVAL_MS) {
      peakSamples.clear()
    }
    return true
  }

  private fun registerPeak(now: Long, peakMagnitude: Float): Boolean {
    if (!peakIntervalAllows(now)) {
      return false
    }
    lastPeakAt = now
    lastRhythmPeakAt = now
    peakSamples.addLast(now to peakMagnitude)
    trimPeakWindow(now)
    stillSinceAt = 0L
    return true
  }

  private fun recentPeakMagnitudes(): List<Float> {
    if (peakSamples.size < MIN_PEAKS_TO_ENTER) {
      return emptyList()
    }
    return peakSamples.takeLast(MIN_PEAKS_TO_ENTER).map { it.second }
  }

  private fun peakIntervalsRegular(): Boolean {
    if (peakSamples.size < MIN_PEAKS_TO_ENTER) {
      return false
    }
    val times = peakSamples.map { it.first }
    val intervals = ArrayList<Long>(times.size - 1)
    var prev = times.first()
    for (i in 1 until times.size) {
      val next = times[i]
      intervals.add(next - prev)
      prev = next
    }
    if (intervals.isEmpty()) {
      return false
    }
    val mean = intervals.sum().toDouble() / intervals.size.toDouble()
    if (mean < MIN_PEAK_INTERVAL_MS || mean > MAX_PEAK_INTERVAL_MS) {
      return false
    }
    var variance = 0.0
    for (interval in intervals) {
      val delta = interval - mean
      variance += delta * delta
    }
    variance /= intervals.size.toDouble()
    val stdDev = sqrt(variance)
    return stdDev <= mean * MAX_INTERVAL_CV
  }

  private fun shouldEnterWalk(now: Long): Boolean {
    if (now < suppressEnterUntilMs) {
      return false
    }
    trimPeakWindow(now)
    if (peakSamples.size < MIN_PEAKS_TO_ENTER) {
      return false
    }
    val first = peakSamples.first().first
    val last = peakSamples.last().first
    if (last - first < MIN_RHYTHM_SPAN_MS) {
      return false
    }
    if (now - last > RECENT_PEAK_MS) {
      return false
    }
    val mags = recentPeakMagnitudes()
    if (mags.size < MIN_PEAKS_TO_ENTER) {
      return false
    }
    val meanMag = mags.sum() / mags.size.toFloat()
    if (meanMag < MIN_MEAN_PEAK_MAGNITUDE) {
      return false
    }
    return peakIntervalsRegular()
  }

  private fun detectClassicPeak(now: Long, magnitude: Float): Boolean {
    val n = magnitudeHistory.size
    if (n < 3) {
      return false
    }
    val before = magnitudeHistory[n - 3].second
    val peak = magnitudeHistory[n - 2].second
    val after = magnitudeHistory[n - 1].second
    if (peak < MIN_PEAK_MAGNITUDE) {
      return false
    }
    if (peak <= before + MIN_PEAK_DELTA) {
      return false
    }
    if (after >= peak - PEAK_SHOULDER) {
      return false
    }
    if (magnitude >= peak - PEAK_SHOULDER) {
      return false
    }
    return registerPeak(now, peak)
  }

  private fun setWalking(next: Boolean) {
    if (next == walking) {
      return
    }
    walking = next
    onWalkingChanged(next)
  }

  fun isWalking(): Boolean = walking

  companion object {
    private const val SAMPLE_MIN_INTERVAL_MS = 100L
    private const val HISTORY_MS = 6000L
    private const val MIN_PEAK_MAGNITUDE = 0.18f
    private const val MIN_PEAK_DELTA = 0.13f
    private const val PEAK_SHOULDER = 0.07f
    private const val MIN_MEAN_PEAK_MAGNITUDE = 0.2f
    private const val PEAK_WINDOW_MS = 5200L
    private const val MIN_PEAKS_TO_ENTER = 6
    private const val MIN_RHYTHM_SPAN_MS = 2200L
    private const val RECENT_PEAK_MS = 2200L
    private const val MIN_PEAK_INTERVAL_MS = 450L
    private const val MAX_PEAK_INTERVAL_MS = 2600L
    private const val MAX_STEP_HZ = 2.5f
    /** Reject irregular bursts (desk taps / fidget). */
    private const val MAX_INTERVAL_CV = 0.32f
    /** Ignore step-like peaks while the user is actively typing. */
    private const val TYPING_SUPPRESS_ENTER_MS = 2800L
    private const val STILL_BEFORE_EXIT_MS = 900L
    private const val EXIT_WALK_MS = 1600L
  }
}
