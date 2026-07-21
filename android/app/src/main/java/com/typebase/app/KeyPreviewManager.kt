package com.typebase.app

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.TextView
import kotlin.math.min

/**
 * Key previews drawn as rounded rectangle overlays inside the IME keyboard container.
 * Supports multiple simultaneous previews for multi-touch typing.
 */
class KeyPreviewManager(private val fallbackContext: Context) {

    private val activePreviews = HashMap<Int, TextView>()
    private val dismissRunnables = HashMap<Int, Runnable>()
    private val shownAtMs = HashMap<Int, Long>()
    /** Keys whose finger already lifted; show must still honor a delayed dismiss. */
    private val hideRequested = HashSet<Int>()
    private val viewPool = ArrayDeque<TextView>()
    private val handler = Handler(Looper.getMainLooper())
    private var geistTypeface: Typeface? = null
    private var labelTypeface: Typeface? = null
    private var fontAssetPath: String = DEFAULT_FONT_ASSET
    private var backgroundColorArgb = Color.parseColor(DARK_PREVIEW_BACKGROUND)
    private var textColorArgb = Color.parseColor(DARK_PREVIEW_TEXT)
    private var keyCornerRadiusDp = DEFAULT_KEY_CORNER_RADIUS_DP.toFloat()
    private var previewContainer: FrameLayout? = null
    /** Incremented on hide so deferred layout shows cannot resurrect after finger lift. */
    private val showSeq = HashMap<Int, Int>()

    private data class PendingLayoutShow(
        val seq: Int,
        val anchor: View,
        val listener: ViewTreeObserver.OnGlobalLayoutListener,
    )

    private val pendingLayoutShows = HashMap<Int, PendingLayoutShow>()

    private fun popupContext(): Context =
        KeyboardInputBridge.inputService ?: fallbackContext

    private var removePreviewContainerListener: (() -> Unit)? = null

    fun init() {
        runOnMainThread {
            removePreviewContainerListener?.invoke()
            removePreviewContainerListener =
                KeyboardInputBridge.addPreviewContainerChangedListener(
                    previewContainerChangedListener,
                )
            attachPreviewContainer()
        }
    }

    fun onPreviewContainerChanged() {
        runOnMainThread {
            attachPreviewContainer()
        }
    }

    private val previewContainerChangedListener = { onPreviewContainerChanged() }

    private fun attachPreviewContainer() {
        val container =
            KeyboardInputBridge.getPopupAnchorView() as? FrameLayout ?: return
        if (container === previewContainer) {
            return
        }
        detachPreviewViewsFromOldContainer()
        previewContainer = container
        warmPreviewPool(container, POOL_WARM_SIZE)
        container.context.let { loadLabelTypeface(it) }
        applyThemeToPreviewView()
    }

    private fun detachPreviewViewsFromOldContainer() {
        for (tag in dismissRunnables.keys.toList()) {
            cancelDismiss(tag)
        }
        for (tv in activePreviews.values) {
            (tv.parent as? ViewGroup)?.removeView(tv)
        }
        activePreviews.clear()
        shownAtMs.clear()
        hideRequested.clear()
        while (viewPool.isNotEmpty()) {
            val tv = viewPool.removeFirst()
            (tv.parent as? ViewGroup)?.removeView(tv)
        }
    }

    fun setTheme(
        backgroundColor: String,
        textColor: String,
        fontAsset: String? = null,
        cornerRadiusDp: Float = DEFAULT_KEY_CORNER_RADIUS_DP.toFloat(),
    ) {
        runOnMainThread {
            backgroundColorArgb = parseColorOrFallback(backgroundColor, backgroundColorArgb)
            textColorArgb = parseColorOrFallback(textColor, textColorArgb)
            keyCornerRadiusDp = cornerRadiusDp.coerceAtLeast(0f)
            val nextFont = fontAsset?.trim().orEmpty()
            if (nextFont.isNotEmpty() && nextFont != fontAssetPath) {
                fontAssetPath = nextFont
                labelTypeface = null
                geistTypeface = null
            }
            previewContainer?.context?.let { loadLabelTypeface(it) }
            applyThemeToPreviewView()
        }
    }

    fun show(reactTag: Int, anchor: View, label: String) {
        runOnMainThread {
            // New press cancels any pending release for this key.
            hideRequested.remove(reactTag)
            showAtAnchor(reactTag, anchor, label)
        }
    }

    /**
     * Finger-up hide — Gboard-style: tiny hold for flash taps, then a quick fade.
     */
    fun hide(reactTag: Int) {
        runOnMainThread {
            cancelDismiss(reactTag)
            hideRequested.add(reactTag)
            val tv = activePreviews[reactTag]
            if (tv == null) {
                // Show still in flight; dismiss as soon as it appears.
                return@runOnMainThread
            }
            scheduleFadeDismiss(reactTag, tv)
        }
    }

    fun hideAll() {
        runOnMainThread {
            val tags = (
                activePreviews.keys +
                    pendingLayoutShows.keys +
                    dismissRunnables.keys +
                    shownAtMs.keys
                ).toSet()
            for (tag in tags) {
                showSeq[tag] = (showSeq[tag] ?: 0) + 1
                cancelPendingLayoutShow(tag)
                cancelDismiss(tag)
                hideRequested.remove(tag)
                activePreviews[tag]?.animate()?.cancel()
                releasePreview(tag)
            }
        }
    }

    fun hideAllDelayed(delayMs: Long = DEFAULT_HIDE_AFTER_RELEASE_MS) {
        runOnMainThread {
            val tags = (
                activePreviews.keys +
                    pendingLayoutShows.keys +
                    dismissRunnables.keys
                ).toSet()
            for (tag in tags) {
                val tv = activePreviews[tag]
                if (tv != null) {
                    hideRequested.add(tag)
                    scheduleFadeDismiss(tag, tv, delayMs)
                } else {
                    hideDelayed(tag, delayMs)
                }
            }
        }
    }

    fun hideDelayed(reactTag: Int, delayMs: Long = DEFAULT_HIDE_AFTER_RELEASE_MS) {
        hideRequested.add(reactTag)
        cancelDismiss(reactTag)
        val waitMs = delayMs.coerceAtLeast(0L)
        dismissRunnables[reactTag] = Runnable {
            dismissRunnables.remove(reactTag)
            val tv = activePreviews[reactTag]
            if (tv != null) {
                scheduleFadeDismiss(reactTag, tv, 0L)
            } else {
                hideRequested.remove(reactTag)
                showSeq[reactTag] = (showSeq[reactTag] ?: 0) + 1
                cancelPendingLayoutShow(reactTag)
                releasePreview(reactTag)
            }
        }.also { handler.postDelayed(it, waitMs) }
    }

    private fun scheduleFadeDismiss(
        reactTag: Int,
        tv: TextView,
        startDelayOverrideMs: Long? = null,
    ) {
        cancelDismiss(reactTag)
        hideRequested.add(reactTag)
        tv.animate().cancel()

        val shownAt = shownAtMs[reactTag]
        val elapsed =
            if (shownAt != null) SystemClock.uptimeMillis() - shownAt else 0L
        val startDelay =
            startDelayOverrideMs
                ?: (FLASH_MIN_VISIBLE_MS - elapsed)
                    .coerceAtLeast(0L)
                    .coerceAtMost(FLASH_MIN_VISIBLE_MS)

        dismissRunnables[reactTag] = Runnable {
            dismissRunnables.remove(reactTag)
            if (!activePreviews.containsKey(reactTag)) {
                hideRequested.remove(reactTag)
                return@Runnable
            }
            tv.animate()
                .alpha(0f)
                .setDuration(FADE_OUT_MS)
                .withEndAction {
                    tv.alpha = 1f
                    hideRequested.remove(reactTag)
                    showSeq[reactTag] = (showSeq[reactTag] ?: 0) + 1
                    cancelPendingLayoutShow(reactTag)
                    releasePreview(reactTag)
                }
                .start()
        }.also {
            if (startDelay <= 0L) {
                it.run()
            } else {
                handler.postDelayed(it, startDelay)
            }
        }
    }

    fun destroy() {
        runOnMainThread {
            handler.removeCallbacksAndMessages(null)
            dismissRunnables.clear()
            for (tag in pendingLayoutShows.keys.toList()) {
                cancelPendingLayoutShow(tag)
            }
            for (tag in activePreviews.keys.toList()) {
                activePreviews[tag]?.animate()?.cancel()
            }
            showSeq.clear()
            shownAtMs.clear()
            hideRequested.clear()
            removePreviewContainerListener?.invoke()
            removePreviewContainerListener = null
            detachPreviewViewsFromOldContainer()
            previewContainer = null
            geistTypeface = null
            labelTypeface = null
        }
    }

    private fun warmPreviewPool(container: FrameLayout, count: Int) {
        repeat(count) {
            val tv = createPreviewTextView(container.context)
            tv.visibility = View.GONE
            container.addView(
                tv,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
            viewPool.addLast(tv)
        }
    }

    private fun obtainPreviewView(container: FrameLayout, reactTag: Int): TextView {
        activePreviews[reactTag]?.let { return it }

        val tv =
            if (viewPool.isNotEmpty()) {
                viewPool.removeFirst()
            } else {
                createPreviewTextView(container.context).also {
                    container.addView(
                        it,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.WRAP_CONTENT,
                            FrameLayout.LayoutParams.WRAP_CONTENT,
                        ),
                    )
                }
            }

        activePreviews[reactTag] = tv
        return tv
    }

    private fun releasePreview(reactTag: Int) {
        val tv = activePreviews.remove(reactTag) ?: return
        shownAtMs.remove(reactTag)
        hideRequested.remove(reactTag)
        tv.animate().cancel()
        tv.alpha = 1f
        tv.visibility = View.GONE
        viewPool.addLast(tv)
    }

    private fun showAtAnchor(reactTag: Int, anchor: View, label: String) {
        val container = previewContainer
            ?: KeyboardInputBridge.getPopupAnchorView() as? FrameLayout
            ?: return
        previewContainer = container

        if (anchor.width <= 0 || anchor.height <= 0) {
            cancelPendingLayoutShow(reactTag)
            val seq = showSeq[reactTag] ?: 0
            val observer = anchor.viewTreeObserver
            val listener =
                object : ViewTreeObserver.OnGlobalLayoutListener {
                    override fun onGlobalLayout() {
                        if ((showSeq[reactTag] ?: 0) != seq) {
                            if (observer.isAlive) {
                                observer.removeOnGlobalLayoutListener(this)
                            }
                            pendingLayoutShows.remove(reactTag)
                            return
                        }
                        if (anchor.width <= 0 || anchor.height <= 0) {
                            return
                        }
                        if (observer.isAlive) {
                            observer.removeOnGlobalLayoutListener(this)
                        }
                        pendingLayoutShows.remove(reactTag)
                        showAtAnchor(reactTag, anchor, label)
                    }
                }
            pendingLayoutShows[reactTag] = PendingLayoutShow(seq, anchor, listener)
            observer.addOnGlobalLayoutListener(listener)
            return
        }

        cancelPendingLayoutShow(reactTag)
        cancelDismiss(reactTag)

        val tv = obtainPreviewView(container, reactTag)
        tv.animate().cancel()
        tv.alpha = 1f
        applyThemeToPreviewView(tv)
        tv.typeface = loadLabelTypeface(tv.context)
        tv.text = label
        shownAtMs[reactTag] = SystemClock.uptimeMillis()

        // Finger already up before the async show landed — flash then fade.
        if (hideRequested.contains(reactTag)) {
            scheduleFadeDismiss(reactTag, tv, FLASH_MIN_VISIBLE_MS)
        }

        val previewWidth = anchor.width.coerceAtLeast(dpToPx(MIN_PREVIEW_WIDTH_DP))
        val previewHeight = anchor.height.coerceAtLeast(dpToPx(MIN_PREVIEW_HEIGHT_DP))
        val gapAboveKey = dpToPx(PREVIEW_GAP_ABOVE_KEY_DP)

        updatePreviewCornerRadius(tv, previewHeight)

        val coordinateRoot =
            KeyboardInputBridge.getKeyboardCoordinateView() as? ViewGroup
        val anchorRect = Rect()
        anchor.getDrawingRect(anchorRect)
        val positionedInHierarchy =
            coordinateRoot != null && isDescendantOf(anchor, coordinateRoot)

        val centerX: Float
        val topY: Float
        if (positionedInHierarchy) {
            coordinateRoot.offsetDescendantRectToMyCoords(anchor, anchorRect)
            centerX = anchorRect.exactCenterX()
            topY = anchorRect.top.toFloat()
        } else {
            val keyLoc = IntArray(2)
            val containerLoc = IntArray(2)
            anchor.getLocationInWindow(keyLoc)
            container.getLocationInWindow(containerLoc)
            centerX = keyLoc[0] - containerLoc[0] + anchor.width / 2f
            topY = (keyLoc[1] - containerLoc[1]).toFloat()
        }

        val params = tv.layoutParams as FrameLayout.LayoutParams
        params.width = previewWidth
        params.height = previewHeight
        params.leftMargin = (centerX - previewWidth / 2f).toInt()
        params.topMargin = (topY - gapAboveKey - previewHeight).toInt()
        tv.layoutParams = params
        tv.visibility = View.VISIBLE
        tv.bringToFront()
        container.invalidate()
    }

    private fun previewCornerRadiusPx(previewHeightPx: Int): Float {
        val themedRadius = dpToPx(keyCornerRadiusDp).toFloat()
        val pillCap = previewHeightPx / 2f
        return min(themedRadius, pillCap)
    }

    private fun createPreviewTextView(context: Context): TextView {
        val cornerRadius = previewCornerRadiusPx(dpToPx(MIN_PREVIEW_HEIGHT_DP))
        val keyBackground = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(backgroundColorArgb)
            this.cornerRadius = cornerRadius
        }

        return TextView(context).apply {
            gravity = Gravity.CENTER
            setTextColor(textColorArgb)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, LABEL_TEXT_SIZE_SP)
            typeface = loadLabelTypeface(context)
            background = keyBackground
            elevation = dpToPx(6).toFloat()
            includeFontPadding = false
        }
    }

    private fun updatePreviewCornerRadius(tv: TextView, previewHeightPx: Int) {
        val cornerRadius = previewCornerRadiusPx(previewHeightPx)
        val background = tv.background
        if (background is GradientDrawable) {
            background.setColor(backgroundColorArgb)
            background.cornerRadius = cornerRadius
        } else {
            tv.background =
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    setColor(backgroundColorArgb)
                    this.cornerRadius = cornerRadius
                }
        }
    }

    private fun applyThemeToPreviewView(tv: TextView? = null) {
        val targets =
            if (tv != null) {
                listOf(tv)
            } else {
                activePreviews.values.toList() + viewPool.toList()
            }

        val face = previewContainer?.context?.let { loadLabelTypeface(it) }
        for (preview in targets) {
            preview.setTextColor(textColorArgb)
            if (face != null) {
                preview.typeface = face
            }
            val previewHeight =
                preview.height.takeIf { it > 0 }
                    ?: (preview.layoutParams as? FrameLayout.LayoutParams)?.height
                        ?: dpToPx(MIN_PREVIEW_HEIGHT_DP)
            updatePreviewCornerRadius(preview, previewHeight)
        }
    }

    private fun parseColorOrFallback(value: String, fallback: Int): Int =
        try {
            Color.parseColor(value.trim())
        } catch (_: IllegalArgumentException) {
            fallback
        }

    private fun loadLabelTypeface(context: Context): Typeface {
        labelTypeface?.let { return it }

        val candidates =
            listOf(
                fontAssetPath,
                DEFAULT_FONT_ASSET,
                "Geist-VariableFont_wght.ttf",
                "fonts/Geist-VariableFont_wght.ttf",
            ).distinct()

        for (path in candidates) {
            val loaded = loadTypefaceFromAsset(context, path)
            if (loaded != null) {
                labelTypeface = loaded
                geistTypeface = loaded
                return loaded
            }
        }

        val fallback = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        labelTypeface = fallback
        return fallback
    }

    private fun loadTypefaceFromAsset(context: Context, assetPath: String): Typeface? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                assetPath.contains("Variable", ignoreCase = true)
            ) {
                Typeface.Builder(context.assets, assetPath)
                    .setFontVariationSettings("'wght' $GEIST_WEIGHT")
                    .build()
            } else {
                Typeface.createFromAsset(context.assets, assetPath)
            }
        } catch (_: Exception) {
            try {
                Typeface.createFromAsset(context.assets, assetPath)
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun cancelDismiss(reactTag: Int) {
        dismissRunnables.remove(reactTag)?.let { handler.removeCallbacks(it) }
        activePreviews[reactTag]?.animate()?.cancel()
    }

    private fun cancelPendingLayoutShow(reactTag: Int) {
        pendingLayoutShows.remove(reactTag)?.let { pending ->
            val observer = pending.anchor.viewTreeObserver
            if (observer.isAlive) {
                observer.removeOnGlobalLayoutListener(pending.listener)
            }
        }
    }

    private fun isDescendantOf(child: View, ancestor: View): Boolean {
        var current: View? = child
        while (current != null) {
            if (current === ancestor) {
                return true
            }
            current = current.parent as? View
        }
        return false
    }

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            handler.post(action)
        }
    }

    private fun dpToPx(dp: Int): Int = dpToPx(dp.toFloat())

    private fun dpToPx(dp: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp,
            popupContext().resources.displayMetrics
        ).toInt()

    companion object {
        private const val POOL_WARM_SIZE = 8
        private const val DEFAULT_KEY_CORNER_RADIUS_DP = 6
        private const val PREVIEW_GAP_ABOVE_KEY_DP = 4
        private const val MIN_PREVIEW_WIDTH_DP = 32
        private const val MIN_PREVIEW_HEIGHT_DP = 40
        private const val LABEL_TEXT_SIZE_SP = 22f
        private const val GEIST_WEIGHT = 500
        private const val DARK_PREVIEW_BACKGROUND = "#454545"
        private const val DARK_PREVIEW_TEXT = "#FFFFFF"
        /** Shortest flash so ultra-fast taps still register visually. */
        private const val FLASH_MIN_VISIBLE_MS = 40L
        /** Gboard-like fade out duration. */
        private const val FADE_OUT_MS = 55L
        private const val DEFAULT_HIDE_AFTER_RELEASE_MS = 40L
        private const val DEFAULT_FONT_ASSET = "fonts/Geist-VariableFont_wght.ttf"
    }
}
