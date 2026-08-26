package com.typebase.app

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/**
 * Native mirror of the JS touch intelligence engine. Spatial mistouch correction:
 * geometry, velocity, keyboard neighbors, and letter bigrams — no dictionary commits.
 */
class TouchIntelligence {
  data class KeyGeometry(
      val id: String,
      val value: String,
      val left: Float,
      val top: Float,
      val right: Float,
      val bottom: Float,
      val centerX: Float,
      val centerY: Float,
  )

  data class HitAnalysis(
      val localX: Float,
      val localY: Float,
      val geometricKeyId: String?,
      val geometricLetter: String?,
      val predictedKeyId: String?,
      val predictedLetter: String?,
      val reranked: Boolean,
      val appliedRerank: Boolean,
      val confidentFastPath: Boolean,
      val scoreMargin: Float,
      val msSinceLastTap: Long,
      val velocityPxPerSec: Float,
      val wordPrefix: String,
      val previousKeyLetter: String?,
  )

  data class HitResult(
      val key: KeyGeometry?,
      val analysis: HitAnalysis?,
  )

  data class Context(
      val enabled: Boolean = true,
      val previousKeyLetter: String? = null,
      val wordPrefix: String = "",
      val lastTapX: Float = 0f,
      val lastTapY: Float = 0f,
      val lastTapAtMs: Long = 0L,
      val lastTapLetter: String? = null,
  )

  private var context = Context()
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  private var keys = emptyList<KeyGeometry>()
  private var keyByLetter = emptyMap<String, KeyGeometry>()
  private var neighborMap: Map<String, Set<String>> = emptyMap()
  private var neighborRadius = 0f

  fun updateConfig(
      touchIntelligence: JSONObject?,
      hitSlopHorizontal: Float,
      hitSlopVertical: Float,
      keys: List<KeyGeometry>,
  ) {
    this.hitSlopHorizontal = hitSlopHorizontal
    this.hitSlopVertical = hitSlopVertical
    this.keys = keys
    this.keyByLetter =
        keys
            .mapNotNull { key ->
              val letter = key.value.lowercase()
              if (letter.length == 1 && letter[0].isLetter()) letter to key else null
            }
            .toMap()
    this.neighborRadius = computeNeighborRadius(keys)
    this.neighborMap = buildNeighborMap(keys, neighborRadius)

    if (touchIntelligence == null) {
      context = Context(enabled = false)
      return
    }

    val incomingPrefix = touchIntelligence.optString("wordPrefix", "")
    context =
        Context(
            enabled = touchIntelligence.optBoolean("enabled", true),
            previousKeyLetter =
                touchIntelligence.optString("previousKeyLetter", "")
                    .takeIf { it.isNotEmpty() },
            wordPrefix = mergeWordPrefix(incomingPrefix, context.wordPrefix),
            lastTapX = touchIntelligence.optDouble("lastTapX", 0.0).toFloat(),
            lastTapY = touchIntelligence.optDouble("lastTapY", 0.0).toFloat(),
            lastTapAtMs = touchIntelligence.optLong("lastTapAtMs", 0L),
            lastTapLetter = context.lastTapLetter,
        )
  }

  fun updateTypingContext(
      previousKeyLetter: String?,
      wordPrefix: String,
  ) {
    val mergedPrefix = mergeWordPrefix(wordPrefix, context.wordPrefix)
    context =
        context.copy(
            previousKeyLetter = previousKeyLetter,
            wordPrefix = mergedPrefix,
        )
  }

  fun recordTap(letter: String, localX: Float, localY: Float, timestampMs: Long) {
    val normalized = letter.trim().lowercase()
    if (normalized.length != 1) {
      return
    }
    if (!normalized[0].isLetter()) {
      context =
          context.copy(
              wordPrefix = "",
              previousKeyLetter = null,
              lastTapLetter = null,
              lastTapX = localX,
              lastTapY = localY,
              lastTapAtMs = timestampMs,
          )
      return
    }
    val appended = context.wordPrefix + normalized
    val mergedPrefix = mergeWordPrefix(appended, context.wordPrefix)
    context =
        context.copy(
            lastTapX = localX,
            lastTapY = localY,
            lastTapAtMs = timestampMs,
            lastTapLetter = normalized,
            previousKeyLetter = normalized,
            wordPrefix = mergedPrefix,
        )
  }

  private fun mergeWordPrefix(incoming: String, current: String): String {
    val next = incoming.trim().lowercase()
    val existing = current.trim().lowercase()
    return when {
      next.isEmpty() -> existing
      next.length >= existing.length -> next
      else -> existing
    }
  }

  fun hitTest(localX: Float, localY: Float, timestampMs: Long): KeyGeometry? =
      hitTestWithAnalysis(localX, localY, timestampMs).key

  /** Geometric-only hit test — matches JS fast-path hit testing during burst typing. */
  fun geometricHitTest(localX: Float, localY: Float): KeyGeometry? =
      geometricHit(localX, localY)

  fun hitTestWithAnalysis(localX: Float, localY: Float, timestampMs: Long): HitResult {
    if (keys.isEmpty()) {
      return HitResult(null, null)
    }

    val msSinceLastTap =
        if (context.lastTapAtMs > 0L) timestampMs - context.lastTapAtMs else -1L
    val velocity = deriveVelocity(localX, localY, timestampMs)
    val velocityPxPerSec = velocity?.let { hypot(it.first, it.second) } ?: 0f

    if (!context.enabled) {
      val geometric = geometricHit(localX, localY)
      return HitResult(
          geometric,
          buildHitAnalysis(
              localX = localX,
              localY = localY,
              geometric = geometric,
              chosen = geometric,
              reranked = false,
              appliedRerank = false,
              confidentFastPath = true,
              scoreMargin = 0f,
              msSinceLastTap = msSinceLastTap,
              velocityPxPerSec = velocityPxPerSec,
          ),
      )
    }

    val initialCandidates = collectCandidates(localX, localY, null)
    if (initialCandidates.isEmpty()) {
      return HitResult(null, null)
    }

    val geometric = geometricHit(localX, localY, initialCandidates)
    val speed = velocityPxPerSec
    val strictInsideHit = geometric != null && pointInside(geometric, localX, localY)
    val touchAmbiguity = computeTouchAmbiguity(geometric, localX, localY)

    if (
        geometric != null &&
            strictInsideHit &&
            isConfidentStrictHit(geometric, localX, localY) &&
            speed < 900f
    ) {
      return HitResult(
          geometric,
          buildHitAnalysis(
              localX = localX,
              localY = localY,
              geometric = geometric,
              chosen = geometric,
              reranked = false,
              appliedRerank = false,
              confidentFastPath = true,
              scoreMargin = 0f,
              msSinceLastTap = msSinceLastTap,
              velocityPxPerSec = velocityPxPerSec,
          ),
      )
    }

    val candidates = collectCandidates(localX, localY, geometric)
    if (candidates.isEmpty()) {
      return HitResult(
          geometric,
          buildHitAnalysis(
              localX = localX,
              localY = localY,
              geometric = geometric,
              chosen = geometric,
              reranked = false,
              appliedRerank = false,
              confidentFastPath = false,
              scoreMargin = 0f,
              msSinceLastTap = msSinceLastTap,
              velocityPxPerSec = velocityPxPerSec,
          ),
      )
    }

    val rawHitLetter = geometric?.value?.lowercase()?.takeIf { it.length == 1 }
    val timingScale = timingFactor(msSinceLastTap)

    var bestKey: KeyGeometry? = null
    var bestScore = Float.NEGATIVE_INFINITY
    var geometricScoreValue = Float.NEGATIVE_INFINITY

    for (key in candidates) {
      val score =
          scoreCandidate(
              key,
              localX,
              localY,
              velocity,
              rawHitLetter,
              timingScale,
              touchAmbiguity,
          )
      if (key.id == geometric?.id) {
        geometricScoreValue = score
      }
      if (score > bestScore) {
        bestScore = score
        bestKey = key
      }
    }

    if (bestKey == null) {
      return HitResult(
          geometric,
          buildHitAnalysis(
              localX = localX,
              localY = localY,
              geometric = geometric,
              chosen = geometric,
              reranked = false,
              appliedRerank = false,
              confidentFastPath = false,
              scoreMargin = 0f,
              msSinceLastTap = msSinceLastTap,
              velocityPxPerSec = velocityPxPerSec,
          ),
      )
    }

    var chosen: KeyGeometry? = geometric ?: bestKey
    var appliedRerank = false

    val requiredMargin = MIN_RERANK_MARGIN * (1f - touchAmbiguity * 0.95f)

    if (
        geometric != null &&
            bestKey.id != geometric.id &&
            isNeighborKey(geometric, bestKey) &&
            bestScore - geometricScoreValue >= requiredMargin
    ) {
      chosen = bestKey
      appliedRerank = true
    }

    val finalReranked = geometric != null && chosen?.id != geometric.id

    return HitResult(
        chosen,
        buildHitAnalysis(
            localX = localX,
            localY = localY,
            geometric = geometric,
            chosen = chosen,
            reranked = finalReranked,
            appliedRerank = appliedRerank,
            confidentFastPath = false,
            scoreMargin = bestScore - geometricScoreValue,
            msSinceLastTap = msSinceLastTap,
            velocityPxPerSec = velocityPxPerSec,
        ),
    )
  }

  private fun isNeighborKey(geometric: KeyGeometry, candidate: KeyGeometry): Boolean {
    val geoLetter = letterForKey(geometric) ?: return false
    val candidateLetter = letterForKey(candidate) ?: return false
    return neighborMap[geoLetter]?.contains(candidateLetter) == true
  }

  private fun letterForKey(key: KeyGeometry?): String? {
    val value = key?.value?.lowercase()?.trim().orEmpty()
    return value.takeIf { it.length == 1 && it[0].isLetter() }
  }

  private fun buildHitAnalysis(
      localX: Float,
      localY: Float,
      geometric: KeyGeometry?,
      chosen: KeyGeometry?,
      reranked: Boolean,
      appliedRerank: Boolean,
      confidentFastPath: Boolean,
      scoreMargin: Float,
      msSinceLastTap: Long,
      velocityPxPerSec: Float,
  ): HitAnalysis? {
    val predictedLetter = letterForKey(chosen) ?: return null
    return HitAnalysis(
        localX = localX,
        localY = localY,
        geometricKeyId = geometric?.id,
        geometricLetter = letterForKey(geometric),
        predictedKeyId = chosen?.id,
        predictedLetter = predictedLetter,
        reranked = reranked,
        appliedRerank = appliedRerank,
        confidentFastPath = confidentFastPath,
        scoreMargin = scoreMargin,
        msSinceLastTap = msSinceLastTap,
        velocityPxPerSec = velocityPxPerSec,
        wordPrefix = context.wordPrefix,
        previousKeyLetter = context.previousKeyLetter,
    )
  }

  private fun geometricHit(
      localX: Float,
      localY: Float,
      candidates: List<KeyGeometry> = keys,
  ): KeyGeometry? {
    var strictMatch: KeyGeometry? = null
    var smallestArea = Float.MAX_VALUE

    for (index in candidates.indices.reversed()) {
      val key = candidates[index]
      if (!pointInside(key, localX, localY)) {
        continue
      }
      val area = (key.right - key.left) * (key.bottom - key.top)
      if (area < smallestArea) {
        smallestArea = area
        strictMatch = key
      }
    }
    if (strictMatch != null) {
      return strictMatch
    }

    var gapMatch: KeyGeometry? = null
    var nearestCenter = Float.MAX_VALUE
    for (key in candidates) {
      if (!pointInSlop(key, localX, localY)) {
        continue
      }
      val centerDistance = hypot(localX - key.centerX, localY - key.centerY)
      if (centerDistance < nearestCenter) {
        nearestCenter = centerDistance
        gapMatch = key
      }
    }
    if (gapMatch != null) {
      return gapMatch
    }

    val maxSnap = max(hitSlopHorizontal, hitSlopVertical) + 4f
    var snapMatch: KeyGeometry? = null
    var nearestEdge = Float.MAX_VALUE
    for (key in candidates) {
      val edgeDistance = distanceToRect(key, localX, localY)
      if (edgeDistance < nearestEdge) {
        nearestEdge = edgeDistance
        snapMatch = key
      }
    }
    return if (snapMatch != null && nearestEdge <= maxSnap) snapMatch else null
  }

  private fun collectCandidates(
      localX: Float,
      localY: Float,
      geometric: KeyGeometry?,
  ): List<KeyGeometry> {
    val maxSnap = max(hitSlopHorizontal, hitSlopVertical) + 4f
    val candidates = LinkedHashMap<String, KeyGeometry>()

    fun addCandidate(key: KeyGeometry?) {
      if (key != null) {
        candidates[key.id] = key
      }
    }

    for (key in keys) {
      if (
          pointInside(key, localX, localY) ||
              pointInSlop(key, localX, localY) ||
              distanceToRect(key, localX, localY) <= maxSnap
      ) {
        addCandidate(key)
      }
    }

    val geometricLetter =
        geometric?.value?.lowercase()?.takeIf { it.length == 1 && it[0].isLetter() }
    if (geometricLetter != null) {
      for (neighbor in neighborMap[geometricLetter].orEmpty()) {
        addCandidate(keyByLetter[neighbor])
      }
    }

    return candidates.values.toList()
  }

  private fun scoreCandidate(
      key: KeyGeometry,
      localX: Float,
      localY: Float,
      velocity: Pair<Float, Float>?,
      rawHitLetter: String?,
      timingScale: Float,
      ambiguity: Float,
  ): Float {
    val geo = geometricScore(key, localX, localY)
    if (!geo.isFinite()) {
      return Float.NEGATIVE_INFINITY
    }

    val candidateLetter = key.value.lowercase().takeIf { it.length == 1 && it[0].isLetter() }
    val geoWeight = WEIGHT_GEOMETRIC * (1f - ambiguity * 0.65f)
    val velocityWeight = WEIGHT_VELOCITY * (1f + ambiguity * 0.4f)
    val neighborWeight = WEIGHT_NEIGHBOR * (1f + ambiguity * 0.55f)
    val bigramWeight = WEIGHT_BIGRAM * (1f + ambiguity * 0.55f)
    val includeRawHit = ambiguity < 0.08f
    val references =
        listOfNotNull(
            context.previousKeyLetter,
            if (includeRawHit) rawHitLetter else null,
            context.lastTapLetter,
        )

    val score =
        geo * geoWeight +
            velocityScore(key, localX, localY, velocity) * velocityWeight +
            neighborScore(candidateLetter, references) * neighborWeight +
            bigramScore(candidateLetter) * bigramWeight

    return score * timingScale
  }

  /** 0 = confident center; 1 = gap / key-edge / between-neighbor touch. */
  private fun computeTouchAmbiguity(
      geometric: KeyGeometry?,
      localX: Float,
      localY: Float,
  ): Float {
    if (geometric == null) {
      return 1f
    }
    if (!pointInside(geometric, localX, localY)) {
      return 1f
    }
    val halfW = max((geometric.right - geometric.left) / 2f, 1f)
    val halfH = max((geometric.bottom - geometric.top) / 2f, 1f)
    val normDist = hypot((localX - geometric.centerX) / halfW, (localY - geometric.centerY) / halfH)
    if (normDist <= CONFIDENT_STRICT_CENTER_RATIO) {
      return 0f
    }
    val span = 0.5f - CONFIDENT_STRICT_CENTER_RATIO
    return min(1f, (normDist - CONFIDENT_STRICT_CENTER_RATIO) / span)
  }

  private fun geometricScore(key: KeyGeometry, x: Float, y: Float): Float {
    if (pointInside(key, x, y)) {
      val halfW = max((key.right - key.left) / 2f, 1f)
      val halfH = max((key.bottom - key.top) / 2f, 1f)
      val normDist = hypot((x - key.centerX) / halfW, (y - key.centerY) / halfH)
      return 1f - normDist * 0.32f
    }

    val edgeDistance = distanceToRect(key, x, y)
    val maxSlop = max(hitSlopHorizontal, hitSlopVertical) + 4f
    if (edgeDistance > maxSlop) {
      return Float.NEGATIVE_INFINITY
    }
    return max(0f, 0.58f - (edgeDistance / maxSlop) * 0.45f)
  }

  private fun velocityScore(
      key: KeyGeometry,
      x: Float,
      y: Float,
      velocity: Pair<Float, Float>?,
  ): Float {
    if (velocity == null) {
      return 0.5f
    }
    val speed = hypot(velocity.first, velocity.second)
    if (speed < 120f) {
      return 0.5f
    }
    val leadMs = min(0.11f, speed / 6000f)
    val predictedX = x + velocity.first * leadMs
    val predictedY = y + velocity.second * leadMs
    val keySize = max(key.right - key.left, key.bottom - key.top)
    val dist = hypot(predictedX - key.centerX, predictedY - key.centerY)
    return max(0f, 1f - dist / (keySize * 1.25f))
  }

  private fun neighborScore(candidateLetter: String?, references: List<String>): Float {
    if (candidateLetter == null) {
      return 0.45f
    }
    for (reference in references) {
      if (reference == candidateLetter) {
        return 1f
      }
      if (neighborMap[reference]?.contains(candidateLetter) == true) {
        return 0.86f
      }
    }
    return 0.42f
  }

  private fun bigramScore(candidateLetter: String?): Float {
    if (candidateLetter == null) {
      return 0.45f
    }
    var best = 0.45f
    context.previousKeyLetter?.let { previous ->
      best = max(best, letterBigramWeight(previous, candidateLetter))
    }
    val prefixLast = context.wordPrefix.trim().lowercase().lastOrNull()
    if (prefixLast != null && prefixLast.isLetter() && prefixLast.toString() != context.previousKeyLetter) {
      best = max(best, letterBigramWeight(prefixLast.toString(), candidateLetter))
    }
    return best
  }

  private fun deriveVelocity(
      localX: Float,
      localY: Float,
      timestampMs: Long,
  ): Pair<Float, Float>? {
    if (context.lastTapAtMs <= 0L) {
      return null
    }
    val dt = timestampMs - context.lastTapAtMs
    if (dt <= 0L || dt > 900L) {
      return null
    }
    val dtSeconds = dt / 1000f
    return Pair(
        (localX - context.lastTapX) / dtSeconds,
        (localY - context.lastTapY) / dtSeconds,
    )
  }

  private fun timingFactor(msSinceLastTap: Long): Float {
    if (msSinceLastTap < 0L) {
      return 1f
    }
    return when {
      msSinceLastTap < 130L -> 1.22f
      msSinceLastTap < 260L -> 1.08f
      msSinceLastTap > 900L -> 0.9f
      else -> 1f
    }
  }

  private fun isConfidentStrictHit(key: KeyGeometry, x: Float, y: Float): Boolean {
    if (!pointInside(key, x, y)) {
      return false
    }
    val halfW = max((key.right - key.left) / 2f, 1f)
    val halfH = max((key.bottom - key.top) / 2f, 1f)
    val normDist = hypot((x - key.centerX) / halfW, (y - key.centerY) / halfH)
    return normDist <= CONFIDENT_STRICT_CENTER_RATIO
  }

  private fun pointInside(key: KeyGeometry, x: Float, y: Float): Boolean {
    return x >= key.left && x <= key.right && y >= key.top && y <= key.bottom
  }

  private fun pointInSlop(key: KeyGeometry, x: Float, y: Float): Boolean {
    return x >= key.left - hitSlopHorizontal &&
        x <= key.right + hitSlopHorizontal &&
        y >= key.top - hitSlopVertical &&
        y <= key.bottom + hitSlopVertical
  }

  private fun distanceToRect(key: KeyGeometry, x: Float, y: Float): Float {
    val dx =
        when {
          x < key.left -> key.left - x
          x > key.right -> x - key.right
          else -> 0f
        }
    val dy =
        when {
          y < key.top -> key.top - y
          y > key.bottom -> y - key.bottom
          else -> 0f
        }
    return hypot(dx, dy)
  }

  private fun computeNeighborRadius(keys: List<KeyGeometry>): Float {
    if (keys.isEmpty()) {
      return 0f
    }
    val avgKeySize =
        keys
            .map { key -> max(key.right - key.left, key.bottom - key.top) }
            .average()
            .toFloat()
    return avgKeySize * 1.35f
  }

  private fun buildNeighborMap(
      keys: List<KeyGeometry>,
      radius: Float,
  ): Map<String, Set<String>> {
    val letters =
        keys.mapNotNull { key ->
          val letter = key.value.lowercase()
          if (letter.length == 1 && letter[0].isLetter()) key to letter else null
        }
    if (letters.isEmpty()) {
      return emptyMap()
    }
    val map = mutableMapOf<String, MutableSet<String>>()
    for ((leftKey, leftLetter) in letters) {
      val neighbors = map.getOrPut(leftLetter) { mutableSetOf() }
      for ((rightKey, rightLetter) in letters) {
        if (leftLetter == rightLetter) {
          continue
        }
        val dist =
            hypot(leftKey.centerX - rightKey.centerX, leftKey.centerY - rightKey.centerY)
        if (dist <= radius) {
          neighbors.add(rightLetter)
        }
      }
    }
    return map
  }

  private fun letterBigramWeight(previous: String, next: String): Float {
    return LETTER_BIGRAM_WEIGHTS["${previous.lowercase()}${next.lowercase()}"] ?: 0.35f
  }

  companion object {
    private const val WEIGHT_GEOMETRIC = 0.42f
    private const val WEIGHT_VELOCITY = 0.12f
    private const val WEIGHT_NEIGHBOR = 0.18f
    private const val WEIGHT_BIGRAM = 0.18f
    private const val CONFIDENT_STRICT_CENTER_RATIO = 0.12f
    private const val MIN_RERANK_MARGIN = 0.002f

    private val LETTER_BIGRAM_WEIGHTS =
        mapOf(
            "ey" to 0.72f,
            "hy" to 0.7f,
            "yo" to 0.68f,
            "ay" to 0.66f,
            "he" to 0.96f,
            "in" to 0.93f,
            "er" to 0.9f,
            "an" to 0.88f,
            "re" to 0.86f,
            "on" to 0.84f,
            "at" to 0.82f,
            "en" to 0.8f,
            "nd" to 0.78f,
            "ti" to 0.76f,
            "es" to 0.74f,
            "or" to 0.72f,
            "te" to 0.7f,
            "of" to 0.68f,
            "ed" to 0.66f,
            "is" to 0.64f,
            "it" to 0.62f,
            "al" to 0.6f,
            "ar" to 0.58f,
            "st" to 0.56f,
            "to" to 0.54f,
            "nt" to 0.52f,
            "ng" to 0.5f,
            "se" to 0.48f,
            "ha" to 0.46f,
            "as" to 0.44f,
            "ou" to 0.42f,
            "io" to 0.4f,
            "le" to 0.38f,
            "ve" to 0.36f,
            "co" to 0.34f,
            "me" to 0.32f,
            "de" to 0.3f,
            "hi" to 0.28f,
            "ri" to 0.26f,
            "ro" to 0.24f,
            "ic" to 0.22f,
            "ne" to 0.2f,
            "ea" to 0.18f,
            "ra" to 0.16f,
            "ce" to 0.14f,
            "li" to 0.12f,
            "ch" to 0.1f,
            "ll" to 0.08f,
            "lo" to 0.62f,
            "lp" to 0.2f,
            "lk" to 0.18f,
            "kl" to 0.16f,
            "be" to 0.06f,
            "ma" to 0.04f,
            "si" to 0.02f,
        )
  }
}
