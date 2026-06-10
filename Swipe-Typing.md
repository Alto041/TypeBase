```package com.nboard.ime

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View

class SwipeTrailView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    data class TrailPoint(
        val x: Float,
        val y: Float,
        val timestampMs: Long
    )

    private val points = ArrayList<TrailPoint>(MAX_POINTS)
    private val corePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()
    private val density = resources.displayMetrics.density

    init {
        visibility = INVISIBLE
        alpha = 1f
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val measuredWidth = when (MeasureSpec.getMode(widthMeasureSpec)) {
            MeasureSpec.EXACTLY -> MeasureSpec.getSize(widthMeasureSpec)
            else -> 0
        }
        val measuredHeight = when (MeasureSpec.getMode(heightMeasureSpec)) {
            MeasureSpec.EXACTLY -> MeasureSpec.getSize(heightMeasureSpec)
            else -> 0
        }
        setMeasuredDimension(measuredWidth, measuredHeight)
    }

    fun updateTrail(newPoints: List<TrailPoint>) {
        if (newPoints.size < 2) {
            clearNow()
            return
        }
        points.clear()
        if (newPoints.size > MAX_POINTS) {
            points.addAll(newPoints.takeLast(MAX_POINTS))
        } else {
            points.addAll(newPoints)
        }
        animate().cancel()
        alpha = 1f
        visibility = VISIBLE
        invalidate()
    }

    fun fadeOutTrail() {
        if (points.isEmpty() && visibility != VISIBLE) {
            return
        }
        animate().cancel()
        animate()
            .alpha(0f)
            .setDuration(FADE_OUT_DURATION_MS)
            .withEndAction { clearNow() }
            .start()
    }

    private fun clearNow() {
        points.clear()
        alpha = 1f
        visibility = INVISIBLE
        invalidate()
    }

    override fun onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas)
        if (points.size < 2) {
            return
        }
        val now = SystemClock.elapsedRealtime()
        trimExpiredPoints(now)
        if (points.size < 2) {
            clearNow()
            return
        }

        val newestAge = (now - points.last().timestampMs).coerceAtLeast(0L)
        val life = (1f - newestAge.toFloat() / TRAIL_WINDOW_MS).coerceIn(0f, 1f)
        if (life <= 0f) {
            clearNow()
            return
        }

        rebuildSmoothPath(points)
        glowPaint.color = Color.argb((life * 90f).toInt().coerceIn(18, 90), 247, 190, 0)
        glowPaint.strokeWidth = dp(9f)
        corePaint.color = Color.argb((life * 205f).toInt().coerceIn(28, 205), 247, 190, 0)
        corePaint.strokeWidth = dp(5f)
        canvas.drawPath(path, glowPaint)
        canvas.drawPath(path, corePaint)

        if (points.isNotEmpty()) {
            postInvalidateOnAnimation()
        }
    }

    private fun rebuildSmoothPath(activePoints: List<TrailPoint>) {
        path.reset()
        if (activePoints.isEmpty()) {
            return
        }
        val first = activePoints.first()
        path.moveTo(first.x, first.y)
        if (activePoints.size == 2) {
            val second = activePoints[1]
            path.lineTo(second.x, second.y)
            return
        }
        for (index in 1 until activePoints.size) {
            val previous = activePoints[index - 1]
            val current = activePoints[index]
            val midX = (previous.x + current.x) * 0.5f
            val midY = (previous.y + current.y) * 0.5f
            path.quadTo(previous.x, previous.y, midX, midY)
        }
        val last = activePoints.last()
        path.lineTo(last.x, last.y)
    }

    private fun trimExpiredPoints(nowMs: Long) {
        while (points.size > 2) {
            val second = points[1]
            if (nowMs - second.timestampMs <= TRAIL_WINDOW_MS) {
                break
            }
            points.removeAt(0)
        }
    }

    private fun dp(value: Float): Float = value * density

    companion object {
        private const val MAX_POINTS = 140
        private const val TRAIL_WINDOW_MS = 280L
        private const val FADE_OUT_DURATION_MS = 170L
    }
}```

```package com.nboard.ime

import android.os.SystemClock
import android.view.KeyEvent
import android.view.View

internal fun NboardImeService.moveCursorLeft() {
    val inputConnection = currentInputConnection ?: return
    inputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT))
    inputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_LEFT))
}

internal fun NboardImeService.moveCursorRight() {
    val inputConnection = currentInputConnection ?: return
    inputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT))
    inputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_RIGHT))
}

internal fun NboardImeService.shouldHandleSwipeTyping(): Boolean {
    if (!swipeTypingEnabled) {
        return false
    }
    if (isNumbersMode || isEmojiMode || isClipboardOpen || isAiMode || isGenerating || isVoiceListening || isVoiceStopping) {
        return false
    }
    return true
}

internal fun NboardImeService.isVoiceInputLongPressAvailable(): Boolean {
    if (!voiceInputEnabled) {
        return false
    }
    if (isNumbersMode || isEmojiMode || isClipboardOpen || isAiMode || isGenerating) {
        return false
    }
    return currentInputConnection != null
}

internal fun NboardImeService.beginSwipeTyping(anchorView: View, token: String, rawX: Float, rawY: Float): Boolean {
    if (token.isBlank()) {
        return false
    }
    if (!shouldHandleSwipeTyping()) {
        return false
    }
    val now = SystemClock.elapsedRealtime()
    activeSwipeTypingSession = SwipeTypingSession(
        ownerView = anchorView,
        rawStartX = rawX,
        rawStartY = rawY,
        tokens = mutableListOf(token),
        dwellDurationsMs = mutableListOf(0L),
        trailPoints = mutableListOf(),
        lastTokenEnteredAtMs = now,
        isSwiping = false
    )
    if (swipeTrailEnabled) {
        appendSwipeTrailPoint(rawX, rawY, force = true)
    } else if (isSwipeTrailViewInitialized()) {
        swipeTrailView.fadeOutTrail()
    }
    return true
}

internal fun NboardImeService.cancelSwipeTyping() {
    if (isSwipeTrailViewInitialized()) {
        swipeTrailView.fadeOutTrail()
    }
    activeSwipeTypingSession = null
}

internal fun NboardImeService.updateSwipeTyping(rawX: Float, rawY: Float): Boolean {
    val session = activeSwipeTypingSession ?: return false
    if (!shouldHandleSwipeTyping()) {
        cancelSwipeTyping()
        return false
    }
    val dx = rawX - session.rawStartX
    val dy = rawY - session.rawStartY
    val distance = kotlin.math.hypot(dx.toDouble(), dy.toDouble()).toFloat()
    if (!session.isSwiping && distance >= dp(SWIPE_TYPING_DEADZONE_DP).toFloat()) {
        session.isSwiping = true
    }
    if (!session.isSwiping) {
        return false
    }

    appendSwipeTrailPoint(rawX, rawY, force = false)

    val token = findSwipeTokenAt(rawX, rawY) ?: return true
    val last = session.tokens.lastOrNull()
    if (token != last) {
        val now = SystemClock.elapsedRealtime()
        val lastIndex = session.dwellDurationsMs.lastIndex
        if (lastIndex >= 0) {
            val delta = (now - session.lastTokenEnteredAtMs).coerceAtLeast(0L)
            session.dwellDurationsMs[lastIndex] = session.dwellDurationsMs[lastIndex] + delta
        }
        session.tokens.add(token)
        session.dwellDurationsMs.add(0L)
        session.lastTokenEnteredAtMs = now
        performKeyHaptic(session.ownerView)
    }
    return true
}

internal fun NboardImeService.finishSwipeTypingAndCommit(): Boolean {
    val session = activeSwipeTypingSession ?: return false
    activeSwipeTypingSession = null
    if (isSwipeTrailViewInitialized()) {
        swipeTrailView.fadeOutTrail()
    }
    if (!session.isSwiping) {
        return false
    }
    val now = SystemClock.elapsedRealtime()
    val lastIndex = session.dwellDurationsMs.lastIndex
    if (lastIndex >= 0) {
        val delta = (now - session.lastTokenEnteredAtMs).coerceAtLeast(0L)
        session.dwellDurationsMs[lastIndex] = session.dwellDurationsMs[lastIndex] + delta
    }

    val intentTokens = extractSwipeIntentTokens(session)
    if (intentTokens.size < 2) {
        return false
    }
    val resolved = resolveSwipeWord(intentTokens, session).orEmpty()
    if (resolved.isBlank()) {
        return false
    }
    commitSwipeWord(resolved)
    return true
}

internal fun NboardImeService.appendSwipeTrailPoint(rawX: Float, rawY: Float, force: Boolean) {
    if (!swipeTrailEnabled) {
        return
    }
    val session = activeSwipeTypingSession ?: return
    if (!isKeyRowsContainerInitialized() || !isSwipeTrailViewInitialized()) {
        return
    }
    val location = IntArray(2)
    keyRowsContainer.getLocationOnScreen(location)
    val localX = rawX - location[0]
    val localY = rawY - location[1]
    if (!force) {
        val last = session.trailPoints.lastOrNull()
        if (last != null) {
            val dx = localX - last.x
            val dy = localY - last.y
            val minDistance = dp(SWIPE_TRAIL_MIN_STEP_DP).toFloat()
            if ((dx * dx + dy * dy) < (minDistance * minDistance)) {
                return
            }
        }
    }
    session.trailPoints.add(
        SwipeTrailView.TrailPoint(
            x = localX,
            y = localY,
            timestampMs = SystemClock.elapsedRealtime()
        )
    )
    if (session.trailPoints.size > SWIPE_TRAIL_MAX_POINTS) {
        session.trailPoints.removeAt(0)
    }
    swipeTrailView.updateTrail(session.trailPoints)
}

internal fun NboardImeService.findSwipeTokenAt(rawX: Float, rawY: Float): String? {
    val hitSlop = dp(SWIPE_KEY_HIT_SLOP_DP).toFloat()
    var bestToken: String? = null
    var bestDistanceSquared = Float.MAX_VALUE
    val location = IntArray(2)
    swipeLetterKeyByView.forEach { (view, token) ->
        if (!view.isShown || view.width <= 0 || view.height <= 0) {
            return@forEach
        }
        view.getLocationOnScreen(location)
        val left = location[0].toFloat() - hitSlop
        val top = location[1].toFloat() - hitSlop
        val right = location[0].toFloat() + view.width + hitSlop
        val bottom = location[1].toFloat() + view.height + hitSlop
        if (rawX in left..right && rawY in top..bottom) {
            val centerX = location[0] + view.width / 2f
            val centerY = location[1] + view.height / 2f
            val dx = rawX - centerX
            val dy = rawY - centerY
            val distanceSquared = dx * dx + dy * dy
            if (distanceSquared < bestDistanceSquared) {
                bestDistanceSquared = distanceSquared
                bestToken = token
            }
        }
    }
    return bestToken
}

internal fun NboardImeService.extractSwipeIntentTokens(session: SwipeTypingSession): List<String> {
    if (session.tokens.isEmpty()) {
        return emptyList()
    }
    val reduced = mutableListOf<String>()
    val lastIndex = session.tokens.lastIndex
    session.tokens.forEachIndexed { index, rawToken ->
        val token = normalizeWord(rawToken)
        if (token.length != 1 || !token.first().isLetter()) {
            return@forEachIndexed
        }
        val dwell = session.dwellDurationsMs.getOrNull(index) ?: 0L
        val keep = index == 0 || index == lastIndex || dwell >= SWIPE_DWELL_COMMIT_MS
        if (keep) {
            if (reduced.lastOrNull() != token) {
                reduced.add(token)
            }
        }
    }

    if (reduced.size < 3 && session.tokens.size >= 3) {
        val middleRange = 1 until session.tokens.lastIndex
        val bestMiddle = middleRange
            .maxByOrNull { session.dwellDurationsMs.getOrNull(it) ?: 0L }
            ?.let { session.tokens[it] }
            ?.let(::normalizeWord)
            ?.takeIf { it.length == 1 && it.first().isLetter() }
        if (!bestMiddle.isNullOrBlank()) {
            val first = reduced.firstOrNull()
            val last = reduced.lastOrNull()
            if (first != null && last != null && bestMiddle != first && bestMiddle != last) {
                reduced.clear()
                reduced.add(first)
                reduced.add(bestMiddle)
                reduced.add(last)
            }
        }
    }
    return reduced
}

internal fun NboardImeService.resolveSwipeWord(tokens: List<String>, session: SwipeTypingSession): String? {
    if (tokens.isEmpty()) {
        return null
    }
    val normalizedPath = tokens
        .map { normalizeWord(it) }
        .filter { it.length == 1 && it.first().isLetter() }
        .joinToString("")
    if (normalizedPath.length < 2) {
        return null
    }

    val foldedPath = foldWord(normalizedPath)
    val collapsedPath = collapseRepeats(foldedPath, maxRepeat = 1)
    val pathFirst = collapsedPath.firstOrNull() ?: return null
    val pathLast = collapsedPath.lastOrNull() ?: return null

    val inputConnection = currentInputConnection
    val beforeCursor = inputConnection
        ?.getTextBeforeCursor(PREDICTION_CONTEXT_WINDOW, 0)
        ?.toString()
        .orEmpty()
    val sentenceContext = extractPredictionSentenceContext(beforeCursor)
    val (previousWord2, previousWord1) = extractPreviousWordsForPrediction(sentenceContext, "")
    val contextLanguage = detectContextLanguage(beforeCursor)

    val candidates = LinkedHashSet<String>()
    learnedWordFrequency.entries
        .asSequence()
        .filter { (word, _) -> word.firstOrNull() == pathFirst }
        .sortedByDescending { it.value }
        .take(SWIPE_LEARNED_SCAN_LIMIT)
        .forEach { (word, _) -> candidates.add(word) }

    listOf(
        KeyboardLanguageMode.FRENCH to frenchLexicon,
        KeyboardLanguageMode.ENGLISH to englishLexicon
    ).forEach { (language, lexicon) ->
        if (!isLanguageEnabled(language)) {
            return@forEach
        }
        lexicon.byFirst[pathFirst]
            .orEmpty()
            .asSequence()
            .take(SWIPE_LEXICON_SCAN_LIMIT)
            .forEach { candidates.add(it) }
    }

    var bestWord: String? = null
    var bestScore = Int.MAX_VALUE
    var secondBestScore = Int.MAX_VALUE

    candidates.forEach { candidate ->
        val normalizedCandidate = normalizeWord(candidate)
        if (normalizedCandidate.length < 2) {
            return@forEach
        }
        val foldedCandidate = foldWord(normalizedCandidate)
        if (foldedCandidate.isBlank() || foldedCandidate.firstOrNull() != pathFirst) {
            return@forEach
        }

        val collapsedCandidate = collapseRepeats(foldedCandidate, maxRepeat = 1)
        val distanceLimit = (SWIPE_DISTANCE_BASE_LIMIT + collapsedPath.length / 2).coerceAtMost(10)
        val shapeDistance = levenshteinDistanceBounded(collapsedPath, collapsedCandidate, distanceLimit)
        if (shapeDistance == Int.MAX_VALUE) {
            return@forEach
        }

        var score = shapeDistance * 14
        score += kotlin.math.abs(collapsedCandidate.length - collapsedPath.length) * 3
        val rawDistanceLimit = (distanceLimit + 2).coerceAtMost(12)
        val rawDistance = levenshteinDistanceBounded(foldedPath, foldedCandidate, rawDistanceLimit)
        score += if (rawDistance == Int.MAX_VALUE) 28 else rawDistance * 7
        score += swipeBigramMismatchPenalty(collapsedPath, collapsedCandidate)
        score -= commonPrefixLength(collapsedPath, collapsedCandidate) * 3
        if (collapsedCandidate.lastOrNull() != pathLast) {
            score += 12
        }
        if (!isSubsequence(collapsedPath, collapsedCandidate)) {
            score += 16
        }

        val dominantMiddle = dominantSwipeMiddleToken(session)
        if (!dominantMiddle.isNullOrBlank() && !collapsedCandidate.contains(dominantMiddle)) {
            score += 8
        }

        val unigram = learnedWordFrequency[normalizedCandidate] ?: 0
        if (unigram > 0) {
            score -= minOf(90, unigram * 8)
        }

        if (!previousWord1.isNullOrBlank()) {
            val bigram = learnedBigramFrequency[predictionBigramKey(previousWord1, normalizedCandidate)] ?: 0
            if (bigram > 0) {
                score -= minOf(120, bigram * 20)
            }
        }
        if (!previousWord2.isNullOrBlank() && !previousWord1.isNullOrBlank()) {
            val trigram = learnedTrigramFrequency[
                predictionTrigramKey(previousWord2, previousWord1, normalizedCandidate)
            ] ?: 0
            if (trigram > 0) {
                score -= minOf(170, trigram * 24)
            }
        }

        if (FRENCH_WORDS.contains(normalizedCandidate) || ENGLISH_WORDS.contains(normalizedCandidate)) {
            score -= 6
        }
        detectWordLanguage(normalizedCandidate)?.let { language ->
            score += languageBiasPenalty(language, contextLanguage) * 6
        }

        if (score < bestScore) {
            secondBestScore = bestScore
            bestScore = score
            bestWord = normalizedCandidate
        } else if (score < secondBestScore) {
            secondBestScore = score
        }
    }

    if (!bestWord.isNullOrBlank()) {
        val margin = secondBestScore - bestScore
        val confident = when {
            bestScore <= SWIPE_CONFIDENT_SCORE -> true
            margin >= SWIPE_MIN_SCORE_MARGIN -> true
            else -> false
        }
        if (confident) {
            return bestWord
        }
    }
    return null
}

internal fun NboardImeService.dominantSwipeMiddleToken(session: SwipeTypingSession): String? {
    if (session.tokens.size < 3) {
        return null
    }
    val middleRange = 1 until session.tokens.lastIndex
    val bestMiddleIndex = middleRange.maxByOrNull { index ->
        session.dwellDurationsMs.getOrNull(index) ?: 0L
    } ?: return null
    return normalizeWord(session.tokens[bestMiddleIndex])
        .takeIf { it.length == 1 && it.first().isLetter() }
}

internal fun NboardImeService.swipeBigramMismatchPenalty(path: String, candidate: String): Int {
    if (path.length < 2 || candidate.length < 2) {
        return 0
    }
    var penalty = 0
    for (index in 0 until path.lastIndex) {
        val from = path[index]
        val to = path[index + 1]
        val firstPos = candidate.indexOf(from)
        if (firstPos < 0) {
            penalty += 6
            continue
        }
        val secondPos = candidate.indexOf(to, firstPos + 1)
        if (secondPos < 0) {
            penalty += 5
            continue
        }
        val gap = secondPos - firstPos - 1
        penalty += (gap * 2).coerceAtMost(6)
    }
    return penalty
}

internal fun NboardImeService.detectWordLanguage(word: String): KeyboardLanguageMode? {
    val folded = foldWord(word)
    val inFrench = frenchLexicon.words.contains(word) || frenchLexicon.foldedWords.contains(folded)
    val inEnglish = englishLexicon.words.contains(word) || englishLexicon.foldedWords.contains(folded)
    return when {
        inFrench && !inEnglish -> KeyboardLanguageMode.FRENCH
        inEnglish && !inFrench -> KeyboardLanguageMode.ENGLISH
        else -> null
    }
}

internal fun NboardImeService.isSubsequence(pattern: String, source: String): Boolean {
    if (pattern.isEmpty()) {
        return true
    }
    var patternIndex = 0
    source.forEach { char ->
        if (patternIndex < pattern.length && pattern[patternIndex] == char) {
            patternIndex++
        }
    }
    return patternIndex == pattern.length
}```