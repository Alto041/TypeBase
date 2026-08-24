package com.typebase.app

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/**
 * Native mirror of the JS touch intelligence engine. Scores nearby keys using
 * touch position, inter-tap velocity, spatial neighbors, and typing context.
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

  data class Context(
      val enabled: Boolean = true,
      val previousKeyLetter: String? = null,
      val wordPrefix: String = "",
      val likelyNextLetters: List<String> = emptyList(),
      val lastTapX: Float = 0f,
      val lastTapY: Float = 0f,
      val lastTapAtMs: Long = 0L,
      val lastTapLetter: String? = null,
  )

  private var context = Context()
  private var hitSlopHorizontal = 0f
  private var hitSlopVertical = 0f
  private var keys = emptyList<KeyGeometry>()
  private var neighborMap: Map<String, Set<String>> = emptyMap()

  fun updateConfig(
      touchIntelligence: JSONObject?,
      hitSlopHorizontal: Float,
      hitSlopVertical: Float,
      keys: List<KeyGeometry>,
  ) {
    this.hitSlopHorizontal = hitSlopHorizontal
    this.hitSlopVertical = hitSlopVertical
    this.keys = keys
    this.neighborMap = buildNeighborMap(keys)

    if (touchIntelligence == null) {
      context = Context(enabled = false)
      return
    }

    context =
        Context(
            enabled = touchIntelligence.optBoolean("enabled", true),
            previousKeyLetter =
                touchIntelligence.optString("previousKeyLetter", "")
                    .takeIf { it.isNotEmpty() },
            wordPrefix = touchIntelligence.optString("wordPrefix", ""),
            likelyNextLetters = parseLikelyNextLetters(touchIntelligence),
            lastTapX = touchIntelligence.optDouble("lastTapX", 0.0).toFloat(),
            lastTapY = touchIntelligence.optDouble("lastTapY", 0.0).toFloat(),
            lastTapAtMs = touchIntelligence.optLong("lastTapAtMs", 0L),
            lastTapLetter = context.lastTapLetter,
        )
  }

  fun updateTypingContext(
      previousKeyLetter: String?,
      wordPrefix: String,
      likelyNextLetters: List<String> = emptyList(),
  ) {
    context =
        context.copy(
            previousKeyLetter = previousKeyLetter,
            wordPrefix = wordPrefix,
            likelyNextLetters = likelyNextLetters,
        )
  }

  fun recordTap(letter: String, localX: Float, localY: Float, timestampMs: Long) {
    val normalized = letter.trim().lowercase()
    if (normalized.length != 1 || !normalized[0].isLetter()) {
      return
    }
    val nextPrefix =
        if (normalized[0].isLetter()) {
          context.wordPrefix + normalized
        } else {
          ""
        }
    context =
        context.copy(
            lastTapX = localX,
            lastTapY = localY,
            lastTapAtMs = timestampMs,
            lastTapLetter = normalized,
            previousKeyLetter = normalized,
            wordPrefix = nextPrefix,
        )
  }

  fun hitTest(localX: Float, localY: Float, timestampMs: Long): KeyGeometry? {
    if (keys.isEmpty()) {
      return null
    }
    if (!context.enabled) {
      return geometricHit(localX, localY)
    }

    val initialCandidates = collectCandidates(localX, localY, null)
    if (initialCandidates.isEmpty()) {
      return null
    }

    val geometric = geometricHit(localX, localY, initialCandidates)
    val velocity = deriveVelocity(localX, localY, timestampMs)
    val speed = velocity?.let { hypot(it.first, it.second) } ?: 0f
    val hasWordContext = context.wordPrefix.trim().length >= 2

    if (
        !hasWordContext &&
            geometric != null &&
            isConfidentStrictHit(geometric, localX, localY) &&
            speed < 900f
    ) {
      return geometric
    }

    val candidates = collectCandidates(localX, localY, geometric)
    if (candidates.isEmpty()) {
      return geometric
    }

    val rawHitLetter = geometric?.value?.lowercase()?.takeIf { it.length == 1 }
    val msSinceLastTap =
        if (context.lastTapAtMs > 0L) timestampMs - context.lastTapAtMs else -1L
    val timingScale = timingFactor(msSinceLastTap)

    var bestKey: KeyGeometry? = null
    var bestScore = Float.NEGATIVE_INFINITY
    var geometricScoreValue = Float.NEGATIVE_INFINITY
    var bestLanguageScore = Float.NEGATIVE_INFINITY
    var geometricLanguageScore = Float.NEGATIVE_INFINITY

    for (key in candidates) {
      val candidateLetter = key.value.lowercase().takeIf { it.length == 1 && it[0].isLetter() }
      val language = languageScore(candidateLetter)
      val score =
          scoreCandidate(
              key,
              localX,
              localY,
              velocity,
              rawHitLetter,
              timingScale,
          )
      if (key.id == geometric?.id) {
        geometricScoreValue = score
        geometricLanguageScore = language
      }
      if (language > bestLanguageScore) {
        bestLanguageScore = language
      }
      if (score > bestScore) {
        bestScore = score
        bestKey = key
      }
    }

    if (bestKey == null) {
      return geometric
    }

    val reranked = geometric != null && bestKey.id != geometric.id
    val contextOverride =
        hasWordContext &&
            reranked &&
            bestLanguageScore - geometricLanguageScore >= CONTEXT_OVERRIDE_MARGIN
    if (
        !contextOverride &&
            geometric != null &&
            bestKey.id != geometric.id &&
            bestScore - geometricScoreValue < MIN_RERANK_MARGIN
    ) {
      return geometric
    }

    return bestKey
  }

  private fun parseLikelyNextLetters(touchIntelligence: JSONObject): List<String> {
    val array = touchIntelligence.optJSONArray("likelyNextLetters") ?: return emptyList()
    val letters = mutableListOf<String>()
    for (index in 0 until array.length()) {
      val letter = array.optString(index, "").trim().lowercase()
      if (letter.length == 1 && letter[0].isLetter()) {
        letters.add(letter)
      }
    }
    return letters
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
    val keyByLetter =
        keys.mapNotNull { key ->
          val letter = key.value.lowercase()
          if (letter.length == 1 && letter[0].isLetter()) letter to key else null
        }.toMap()

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
  ): Float {
    val geo = geometricScore(key, localX, localY)
    if (!geo.isFinite()) {
      return Float.NEGATIVE_INFINITY
    }

    val candidateLetter = key.value.lowercase().takeIf { it.length == 1 && it[0].isLetter() }
    val references =
        listOfNotNull(
            context.previousKeyLetter,
            rawHitLetter,
            context.lastTapLetter,
        )

    val score =
        geo * WEIGHT_GEOMETRIC +
            velocityScore(key, localX, localY, velocity) * WEIGHT_VELOCITY +
            neighborScore(candidateLetter, references) * WEIGHT_NEIGHBOR +
            bigramScore(candidateLetter) * WEIGHT_BIGRAM +
            likelyNextLetterScore(candidateLetter) * WEIGHT_WORD_CONTINUATION

    return score * timingScale
  }

  private fun languageScore(candidateLetter: String?): Float {
    return bigramScore(candidateLetter) * 0.35f +
        likelyNextLetterScore(candidateLetter) * 0.65f
  }

  private fun effectiveLikelyNextLetters(): List<String> {
    val prefix = context.wordPrefix.trim().lowercase()
    if (prefix.length < 2) {
      return emptyList()
    }
    if (context.likelyNextLetters.isNotEmpty()) {
      return context.likelyNextLetters
    }
    return fallbackLikelyNextLetters(prefix)
  }

  private fun fallbackLikelyNextLetters(prefix: String): List<String> {
    return when (prefix) {
      "he" -> listOf("y", "l", "r", "a", "d")
      "th" -> listOf("e", "a", "i", "o")
      "ha" -> listOf("v", "s", "t", "p")
      "ho" -> listOf("w", "u", "l", "p")
      "hi" -> listOf("s", "m", "t", "g")
      "yo" -> listOf("u", "o", "a")
      "wh" -> listOf("a", "o", "e", "i")
      "in" -> listOf("g", "t", "s", "c")
      "re" -> listOf("a", "e", "s", "c")
      "ou" -> listOf("r", "l", "t", "n")
      else -> emptyList()
    }
  }

  private fun likelyNextLetterScore(candidateLetter: String?): Float {
    val likelyNextLetters = effectiveLikelyNextLetters()
    if (candidateLetter == null || likelyNextLetters.isEmpty()) {
      return 0.4f
    }
    val index = likelyNextLetters.indexOf(candidateLetter.lowercase())
    if (index < 0) {
      return 0.32f
    }
    return max(0.55f, 1f - index * 0.12f)
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

  private fun buildNeighborMap(keys: List<KeyGeometry>): Map<String, Set<String>> {
    val letters =
        keys.mapNotNull { key ->
          val letter = key.value.lowercase()
          if (letter.length == 1 && letter[0].isLetter()) key to letter else null
        }
    if (letters.isEmpty()) {
      return emptyMap()
    }
    val avgKeySize =
        letters.map { (key, _) -> max(key.right - key.left, key.bottom - key.top) }.average()
            .toFloat()
    val neighborRadius = avgKeySize * 1.35f
    val map = mutableMapOf<String, MutableSet<String>>()
    for ((leftKey, leftLetter) in letters) {
      val neighbors = map.getOrPut(leftLetter) { mutableSetOf() }
      for ((rightKey, rightLetter) in letters) {
        if (leftLetter == rightLetter) {
          continue
        }
        val dist =
            hypot(leftKey.centerX - rightKey.centerX, leftKey.centerY - rightKey.centerY)
        if (dist <= neighborRadius) {
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
    private const val WEIGHT_GEOMETRIC = 0.34f
    private const val WEIGHT_VELOCITY = 0.1f
    private const val WEIGHT_NEIGHBOR = 0.1f
    private const val WEIGHT_BIGRAM = 0.12f
    private const val WEIGHT_WORD_CONTINUATION = 0.26f
    private const val CONFIDENT_STRICT_CENTER_RATIO = 0.22f
    private const val MIN_RERANK_MARGIN = 0.018f
    private const val CONTEXT_OVERRIDE_MARGIN = 0.08f

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
            "be" to 0.06f,
            "ma" to 0.04f,
            "si" to 0.02f,
        )
  }
}
