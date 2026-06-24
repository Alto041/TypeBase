package com.typebase.app

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

object SwipeWordDictionary {
  private const val LEARNED_WORDS_KEY = "learned_words"
  private const val SWIPE_CANDIDATE_LIMIT = 650

  @Volatile private var loaded = false
  private val loadLock = Any()

  private val words = ArrayList<String>(10_000)
  private val staticRank = HashMap<String, Int>(10_000)

  private data class Pt(val x: Double, val y: Double)
  private data class Key(
      val letter: Char,
      val x: Double,
      val y: Double,
      val width: Double,
      val height: Double,
      val centerX: Double,
      val centerY: Double,
  )

  fun ensureLoaded(context: Context) {
    if (loaded) {
      return
    }
    synchronized(loadLock) {
      if (loaded) {
        return
      }
      context.assets.open("english_words.txt").bufferedReader().useLines { lines ->
        for (line in lines) {
          val word = line.trim().lowercase()
          if (word.length !in 2..16) {
            continue
          }
          if (!word.all { it in 'a'..'z' }) {
            continue
          }
          val rank = words.size
          words.add(word)
          staticRank[word] = rank
        }
      }
      loaded = true
    }
  }

  fun isKnownWord(word: String): Boolean =
    staticRank.containsKey(word.trim().lowercase())

  fun getSwipeCandidates(
    context: Context,
    prefs: SharedPreferences,
    pattern: String,
    maxCandidates: Int,
  ): WritableArray {
    ensureLoaded(context)

    val normalized = pattern.lowercase()
    if (normalized.isEmpty() || normalized[0] !in 'a'..'z') {
      return Arguments.createArray()
    }

    val first = normalized[0]
    val maxEdits = traceEditBudget(normalized)
    val seen = HashSet<String>()
    val results = ArrayList<Pair<String, Int>>()

    fun push(word: String, rank: Int, requireTraceMatch: Boolean): Boolean {
      if (seen.contains(word)) {
        return false
      }
      if (word.length !in 2..16) {
        return false
      }
      if (requireTraceMatch && !wordMatchesTrace(word, normalized, maxEdits)) {
        return false
      }
      seen.add(word)
      results.add(word to rank)
      return results.size >= maxCandidates
    }

    val learned = readLearnedWords(prefs)
    val learnedByCount =
        learned.entries
            .asSequence()
            .filter { (word, count) -> count > 0 && word.isNotEmpty() && word[0] == first }
            .sortedByDescending { it.value }
            .toList()

    for ((word, count) in learnedByCount) {
      val static = staticRank[word]
      val rank =
          if (static != null) {
            max(0, static - learnedRankBoost(count))
          } else {
            max(0, 2500 - learnedRankBoost(count))
          }
      if (push(word, rank, false)) {
        return toWritableArray(results)
      }
    }

    // First pass: candidates that agree with the noisy crossed-key trace.
    for (rank in words.indices) {
      val word = words[rank]
      if (word[0] != first) {
        continue
      }
      if (push(word, rank, true)) {
        break
      }
    }

    if (results.size >= maxCandidates) {
      return toWritableArray(results)
    }

    // Second pass: broad first-letter candidates for path-shape scoring.
    // Gesture traces often miss intermediate keys, so the decoder must not
    // depend solely on the crossed-key string.
    for (rank in words.indices) {
      val word = words[rank]
      if (word[0] != first) {
        continue
      }
      if (push(word, rank, false)) {
        break
      }
    }

    return toWritableArray(results)
  }

  fun decodeSwipeGesture(
      context: Context,
      prefs: SharedPreferences,
      pointsJson: String,
      layoutsJson: String,
      isUppercase: Boolean,
  ): String? {
    ensureLoaded(context)
    val rawPoints = parsePoints(pointsJson)
    val keys = parseKeys(layoutsJson)
    if (rawPoints.size < 2 || keys.size < 20) {
      return null
    }

    val keyMap = keys.associateBy { it.letter }
    val scale = keyboardScale(keys)
    val path = resamplePath(rawPoints, resampleCountFor(rawPoints.size))
    val pattern = buildTracePattern(rawPoints, path, keys)
    val startLetter = nearestLetter(rawPoints.first(), keys) ?: return null
    val candidatePattern =
        if (pattern.length >= 2 && pattern[0] == startLetter) pattern
        else if (pattern.length >= 2) "$startLetter${pattern.substring(1)}"
        else startLetter.toString()
    val gestureTurns = extractTurns(path, keys)
    val gestureLength = pathLength(rawPoints)
    val learned = readLearnedWords(prefs)
    val candidates = broadCandidates(candidatePattern, learned, SWIPE_CANDIDATE_LIMIT)

    var bestWord: String? = null
    var bestScore = Double.POSITIVE_INFINITY
    for ((word, rank) in candidates) {
      val score =
          scoreCandidate(
              word,
              candidatePattern,
              rawPoints,
              path,
              gestureTurns,
              keyMap,
              scale,
              gestureLength,
              rank,
              learned[word] ?: 0,
          ) ?: continue
      if (score < bestScore) {
        bestScore = score
        bestWord = word
      }
    }

    val result = bestWord ?: return null
    return if (isUppercase) result.replaceFirstChar { it.uppercase() } else result
  }

  private fun broadCandidates(
      pattern: String,
      learned: Map<String, Int>,
      maxCandidates: Int,
  ): List<Pair<String, Int>> {
    val normalized = pattern.lowercase()
    val first = normalized.firstOrNull() ?: return emptyList()
    if (first !in 'a'..'z') {
      return emptyList()
    }

    val maxEdits = traceEditBudget(normalized)
    val seen = HashSet<String>()
    val results = ArrayList<Pair<String, Int>>(maxCandidates)

    fun push(word: String, rank: Int, requireTraceMatch: Boolean): Boolean {
      if (seen.contains(word) || word.length !in 2..16) {
        return false
      }
      if (requireTraceMatch && !wordMatchesTrace(word, normalized, maxEdits)) {
        return false
      }
      seen.add(word)
      results.add(word to rank)
      return results.size >= maxCandidates
    }

    learned.entries
        .asSequence()
        .filter { (word, count) -> count > 0 && word.firstOrNull() == first }
        .sortedByDescending { it.value }
        .forEach { (word, count) ->
          val static = staticRank[word]
          val rank = if (static != null) max(0, static - learnedRankBoost(count)) else 2500
          if (push(word, rank, false)) {
            return results
          }
        }

    for (rank in words.indices) {
      val word = words[rank]
      if (word[0] == first && push(word, rank, true)) {
        return results
      }
    }

    for (rank in words.indices) {
      val word = words[rank]
      if (word[0] == first && push(word, rank, false)) {
        return results
      }
    }

    return results
  }

  private fun scoreCandidate(
      word: String,
      pattern: String,
      rawPoints: List<Pt>,
      path: List<Pt>,
      gestureTurns: List<Pt>,
      keyMap: Map<Char, Key>,
      scale: Double,
      gestureLength: Double,
      rank: Int,
      learnedUses: Int,
  ): Double? {
    val idealPath = idealPath(word, keyMap)
    if (idealPath.size < 2) {
      return null
    }
    val idealLength = pathLength(idealPath)
    val lengthPenalty = lengthPenalty(word, pattern, idealLength, gestureLength) ?: return null
    if (!passesProximityGate(word, rawPoints, keyMap)) {
      return null
    }
    val proximity = proximityScore(word, path, keyMap, scale) ?: return null
    val anchors = anchorScore(word, rawPoints, keyMap, scale) ?: return null
    val turns = turnScore(gestureTurns, extractIdealTurns(idealPath), scale)
    val dtw = dtwAverage(path, resamplePath(idealPath, path.size)) / scale
    val shape = proximity * 0.50 + dtw * 0.50
    val trace = keySequence(word)
    val exactTraceBonus = if (trace == pattern) -0.55 else 0.0
    val lengthGapPenalty = abs(word.length - pattern.length) * 0.055
    val rankPenalty = ln((rank + 10).toDouble()) / ln(10.0) * 0.045
    val learnedBonus = min(0.55, learnedUses * 0.08)

    return shape * 0.72 +
        anchors * 0.55 +
        turns * 0.42 +
        lengthPenalty * 1.15 +
        lengthGapPenalty +
        rankPenalty +
        exactTraceBonus -
        learnedBonus
  }

  private fun parsePoints(json: String): List<Pt> {
    val array = JSONArray(json)
    return List(array.length()) { index ->
      val item = array.getJSONObject(index)
      Pt(item.optDouble("x"), item.optDouble("y"))
    }
  }

  private fun parseKeys(json: String): List<Key> {
    val array = JSONArray(json)
    val keys = ArrayList<Key>(array.length())
    for (index in 0 until array.length()) {
      val item = array.getJSONObject(index)
      val letter = item.optString("letter").firstOrNull() ?: continue
      keys.add(
          Key(
              letter.lowercaseChar(),
              item.optDouble("x"),
              item.optDouble("y"),
              item.optDouble("width"),
              item.optDouble("height"),
              item.optDouble("centerX"),
              item.optDouble("centerY"),
          ))
    }
    return keys
  }

  private fun keyboardScale(keys: List<Key>): Double {
    val maxX = keys.maxOfOrNull { it.x + it.width } ?: 0.0
    val maxY = keys.maxOfOrNull { it.y + it.height } ?: 0.0
    return max(hypot(maxX, maxY) * 0.35, 48.0)
  }

  private fun resampleCountFor(pointCount: Int): Int =
      min(60, max(36, (pointCount * 0.55).toInt()))

  private fun distance(a: Pt, b: Pt): Double = hypot(a.x - b.x, a.y - b.y)

  private fun pathLength(points: List<Pt>): Double {
    var total = 0.0
    for (i in 1 until points.size) {
      total += distance(points[i - 1], points[i])
    }
    return total
  }

  private fun resamplePath(points: List<Pt>, count: Int): List<Pt> {
    if (points.isEmpty()) return emptyList()
    if (points.size == 1) return List(count) { points[0] }
    val cumulative = DoubleArray(points.size)
    for (i in 1 until points.size) {
      cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i])
    }
    val total = cumulative.last()
    if (total <= 0.0) return List(count) { points[0] }
    val result = ArrayList<Pt>(count)
    for (i in 0 until count) {
      val target = total * i / max(count - 1, 1)
      var segment = 1
      while (segment < cumulative.size && cumulative[segment] < target) {
        segment += 1
      }
      val startLength = cumulative[segment - 1]
      val segmentLength = cumulative[segment] - startLength
      val t = if (segmentLength == 0.0) 0.0 else (target - startLength) / segmentLength
      val from = points[segment - 1]
      val to = points[segment]
      result.add(Pt(from.x + t * (to.x - from.x), from.y + t * (to.y - from.y)))
    }
    return result
  }

  private fun keyAt(point: Pt, keys: List<Key>, pad: Double = 6.0): Key? {
    var best: Key? = null
    var bestArea = Double.POSITIVE_INFINITY
    for (key in keys) {
      val inside =
          point.x >= key.x - pad &&
              point.x <= key.x + key.width + pad &&
              point.y >= key.y - pad &&
              point.y <= key.y + key.height + pad
      if (!inside) continue
      val area = key.width * key.height
      if (area < bestArea) {
        bestArea = area
        best = key
      }
    }
    return best
  }

  private fun nearestLetter(point: Pt, keys: List<Key>): Char? {
    keyAt(point, keys, 10.0)?.let { return it.letter }
    var best: Key? = null
    var bestDistance = Double.POSITIVE_INFINITY
    for (key in keys) {
      val d = distance(point, Pt(key.centerX, key.centerY))
      if (d < bestDistance) {
        bestDistance = d
        best = key
      }
    }
    val keySize = keys.maxOfOrNull { max(it.width, it.height) } ?: 48.0
    return if (bestDistance <= keySize * 0.85) best?.letter else null
  }

  private fun buildTracePattern(raw: List<Pt>, path: List<Pt>, keys: List<Key>): String {
    fun trace(points: List<Pt>): String {
      val out = StringBuilder()
      var last: Char? = null
      for (point in points) {
        val letter = keyAt(point, keys)?.letter
        if (letter != null && letter != last) {
          out.append(letter)
          last = letter
        }
      }
      return out.toString()
    }
    val rawTrace = trace(raw)
    val pathTrace = trace(path)
    if (rawTrace.length >= 2 && pathTrace.length >= 2) {
      return if (rawTrace.length <= pathTrace.length) rawTrace else pathTrace
    }
    return if (rawTrace.length >= 2) rawTrace else pathTrace
  }

  private fun keySequence(word: String): String {
    val out = StringBuilder()
    var previous: Char? = null
    for (char in word) {
      if (char != previous) {
        out.append(char)
        previous = char
      }
    }
    return out.toString()
  }

  private fun idealPath(word: String, keyMap: Map<Char, Key>): List<Pt> {
    val points = ArrayList<Pt>()
    var previous: Char? = null
    for (char in word) {
      if (char == previous) continue
      val key = keyMap[char] ?: return emptyList()
      points.add(Pt(key.centerX, key.centerY))
      previous = char
    }
    return points
  }

  private fun lengthPenalty(
      word: String,
      pattern: String,
      idealLength: Double,
      gestureLength: Double,
  ): Double? {
    if (idealLength <= 0.0 || gestureLength <= 0.0) return 0.35
    val longFromShort = word.length > pattern.length + 3
    if (longFromShort && idealLength > gestureLength * 1.2) {
      return null
    }
    val mismatch = abs(idealLength - gestureLength) / max(idealLength, gestureLength)
    return mismatch * 1.15 + if (longFromShort) 0.45 else 0.0
  }

  private fun nearestPathDistance(point: Pt, path: List<Pt>): Double =
      path.minOfOrNull { distance(point, it) } ?: Double.POSITIVE_INFINITY

  private fun passesProximityGate(word: String, rawPath: List<Pt>, keyMap: Map<Char, Key>): Boolean {
    val sequence = keySequence(word)
    val missBudget = when {
      sequence.length <= 4 -> 0
      sequence.length <= 7 -> 1
      else -> 2
    }
    var misses = 0
    for (index in sequence.indices) {
      val key = keyMap[sequence[index]] ?: return false
      val best = nearestPathDistance(Pt(key.centerX, key.centerY), rawPath)
      val radius = max(key.width, key.height) * if (index == 0 || index == sequence.lastIndex) 1.0 else 0.82
      if (best > radius) {
        if (index == 0 || index == sequence.lastIndex) return false
        misses += 1
        if (misses > missBudget) return false
      }
    }
    return true
  }

  private fun proximityScore(word: String, path: List<Pt>, keyMap: Map<Char, Key>, scale: Double): Double? {
    val sequence = keySequence(word)
    var total = 0.0
    for (char in sequence) {
      val key = keyMap[char] ?: return null
      val best = nearestPathDistance(Pt(key.centerX, key.centerY), path)
      val keyRadius = max(key.width, key.height) * 0.25
      total += max(0.0, best - keyRadius)
    }
    return total / max(sequence.length, 1) / scale
  }

  private fun anchorScore(word: String, rawPath: List<Pt>, keyMap: Map<Char, Key>, scale: Double): Double? {
    val sequence = keySequence(word)
    val first = keyMap[sequence.first()] ?: return null
    val last = keyMap[sequence.last()] ?: return null
    val start = rawPath.first()
    val end = rawPath.last()
    val startD = distance(start, Pt(first.centerX, first.centerY)) / scale
    val endD = distance(end, Pt(last.centerX, last.centerY)) / scale
    return startD * 0.65 + endD * 0.78
  }

  private fun angle(a: Pt, b: Pt, c: Pt): Double {
    val abx = a.x - b.x
    val aby = a.y - b.y
    val cbx = c.x - b.x
    val cby = c.y - b.y
    val ab = hypot(abx, aby)
    val cb = hypot(cbx, cby)
    if (ab == 0.0 || cb == 0.0) return 0.0
    val cos = ((abx * cbx + aby * cby) / (ab * cb)).coerceIn(-1.0, 1.0)
    return acos(cos)
  }

  private fun turnAmount(a: Pt, b: Pt, c: Pt): Double = PI - angle(a, b, c)

  private fun extractTurns(path: List<Pt>, keys: List<Key>): List<Pt> {
    if (path.size <= 4) return emptyList()
    val minSpacing = (keys.minOfOrNull { min(it.width, it.height) } ?: 48.0) * 0.45
    val turns = ArrayList<Pair<Pt, Double>>()
    for (i in 2 until path.size - 2) {
      val amount = turnAmount(path[i - 2], path[i], path[i + 2])
      if (amount < 0.48) continue
      val previous = turns.lastOrNull()
      if (previous != null && distance(previous.first, path[i]) < minSpacing) {
        if (amount > previous.second) {
          turns[turns.lastIndex] = path[i] to amount
        }
      } else {
        turns.add(path[i] to amount)
      }
    }
    return turns.sortedByDescending { it.second }.take(6).map { it.first }
  }

  private fun extractIdealTurns(ideal: List<Pt>): List<Pt> {
    if (ideal.size <= 2) return emptyList()
    val turns = ArrayList<Pt>()
    for (i in 1 until ideal.size - 1) {
      if (turnAmount(ideal[i - 1], ideal[i], ideal[i + 1]) >= 0.42) {
        turns.add(ideal[i])
      }
    }
    return if (turns.isEmpty() && ideal.size <= 5) ideal.subList(1, ideal.size - 1) else turns
  }

  private fun turnScore(gestureTurns: List<Pt>, idealTurns: List<Pt>, scale: Double): Double {
    if (idealTurns.isEmpty()) return 0.0
    if (gestureTurns.isEmpty()) return 0.5 + idealTurns.size * 0.08
    var total = 0.0
    var from = 0
    for (ideal in idealTurns) {
      var bestIndex = -1
      var best = Double.POSITIVE_INFINITY
      for (i in from until gestureTurns.size) {
        val d = distance(ideal, gestureTurns[i])
        if (d < best) {
          best = d
          bestIndex = i
        }
      }
      if (bestIndex < 0) {
        total += 0.55
      } else {
        total += best / scale
        from = bestIndex + 1
      }
    }
    return total / idealTurns.size
  }

  private fun dtwAverage(a: List<Pt>, b: List<Pt>): Double {
    if (a.isEmpty() || b.isEmpty()) return Double.POSITIVE_INFINITY
    val prev = DoubleArray(b.size + 1) { Double.POSITIVE_INFINITY }
    val curr = DoubleArray(b.size + 1) { Double.POSITIVE_INFINITY }
    prev[0] = 0.0
    for (i in 1..a.size) {
      curr[0] = Double.POSITIVE_INFINITY
      for (j in 1..b.size) {
        val cost = distance(a[i - 1], b[j - 1])
        curr[j] = cost + min(min(prev[j], curr[j - 1]), prev[j - 1])
      }
      for (j in 0..b.size) {
        prev[j] = curr[j]
        curr[j] = Double.POSITIVE_INFINITY
      }
    }
    return prev[b.size] / (a.size + b.size)
  }

  private fun toWritableArray(results: List<Pair<String, Int>>): WritableArray {
    val array = Arguments.createArray()
    for ((word, rank) in results) {
      val map = Arguments.createMap()
      map.putString("word", word)
      map.putInt("rank", rank)
      array.pushMap(map)
    }
    return array
  }

  private fun readLearnedWords(prefs: SharedPreferences): Map<String, Int> {
    val raw = prefs.getString(LEARNED_WORDS_KEY, "{}") ?: "{}"
    val json = JSONObject(raw)
    val result = HashMap<String, Int>()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val count = json.optInt(key, 0)
      if (count > 0) {
        result[key] = count
      }
    }
    return result
  }

  private fun learnedRankBoost(uses: Int): Int {
    if (uses <= 0) {
      return 0
    }
    return min(uses * 80, 4000)
  }

  private fun traceEditBudget(trace: String): Int =
      when {
        trace.length <= 3 -> 1
        trace.length <= 5 -> 2
        trace.length <= 8 -> 3
        else -> min(7, max(3, trace.length / 2))
      }

  private fun wordMatchesTrace(word: String, trace: String, maxEdits: Int): Boolean {
    if (isPatternSubsequence(word, trace)) {
      return true
    }
    return fuzzyMatchesPattern(word, trace, maxEdits)
  }

  private fun isPatternSubsequence(pattern: String, word: String): Boolean {
    if (pattern.isEmpty()) {
      return true
    }
    var patternIndex = 0
    for (char in word) {
      if (char == pattern[patternIndex]) {
        patternIndex += 1
        if (patternIndex == pattern.length) {
          return true
        }
      }
    }
    return false
  }

  private fun fuzzyMatchesPattern(pattern: String, word: String, maxEdits: Int): Boolean {
    if (isPatternSubsequence(pattern, word)) {
      return true
    }

    val rows = pattern.length + 1
    val cols = word.length + 1
    val dp = IntArray(cols)
    for (j in 0 until cols) {
      dp[j] = j
    }

    for (i in 1 until rows) {
      var prev = dp[0]
      dp[0] = i
      for (j in 1 until cols) {
        val temp = dp[j]
        val cost = if (pattern[i - 1] == word[j - 1]) 0 else 1
        dp[j] =
            min(
                min(dp[j] + 1, dp[j - 1] + 1),
                prev + cost,
            )
        prev = temp
      }
    }

    return dp[word.length] <= maxEdits
  }
}
