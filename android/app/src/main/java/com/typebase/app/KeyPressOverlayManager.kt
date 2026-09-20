package com.typebase.app

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import kotlin.math.min

/**
 * Instant native pressed-state overlays aligned to letter keys.
 * Drawn inside the IME popup container so feedback does not wait on React.
 */
class KeyPressOverlayManager(private val fallbackContext: Context) {

    private val activeOverlays = HashMap<Int, View>()
    private val overlayPool = ArrayDeque<View>()
    private val dotPool = ArrayDeque<View>()
    private val activeDots = LinkedHashSet<View>()
    private val pendingLayoutShows = HashMap<Int, PendingLayoutShow>()
    private val hideRequested = HashSet<Int>()
    private val showSeq = HashMap<Int, Int>()
    private val handler = Handler(Looper.getMainLooper())
    private var overlayContainer: FrameLayout? = null
    private var removeContainerListener: (() -> Unit)? = null
    private var pressedColorArgb = Color.parseColor(DEFAULT_PRESSED_COLOR)
    private var cornerRadiusDp = DEFAULT_CORNER_RADIUS_DP.toFloat()

    private data class PendingLayoutShow(
        val anchor: View,
        val listener: ViewTreeObserver.OnGlobalLayoutListener,
    )

    fun init() {
        runOnMainThread {
            removeContainerListener?.invoke()
            removeContainerListener =
                KeyboardInputBridge.addPreviewContainerChangedListener {
                    attachContainer()
                }
            attachContainer()
        }
    }

    fun setTheme(pressedColor: String, cornerRadiusDp: Float) {
        runOnMainThread {
            pressedColorArgb = parseColorOrFallback(pressedColor, pressedColorArgb)
            this.cornerRadiusDp = cornerRadiusDp.coerceAtLeast(0f)
            for (overlay in activeOverlays.values) {
                applyOverlayBackground(overlay)
            }
            for (dot in dotPool) {
                (dot.background as? GradientDrawable)?.apply {
                    setColor(defaultDotColor(pressedColorArgb))
                    setStroke(1.dpPx(), defaultDotStrokeColor(pressedColorArgb))
                }
            }
            for (dot in activeDots) {
                (dot.background as? GradientDrawable)?.apply {
                    setColor(defaultDotColor(pressedColorArgb))
                    setStroke(1.dpPx(), defaultDotStrokeColor(pressedColorArgb))
                }
            }
        }
    }

    fun show(reactTag: Int, anchor: View) {
        runOnMainThread {
            hideRequested.remove(reactTag)
            showAtAnchor(reactTag, anchor)
        }
    }

    fun showDoodleDot(reactTag: Int, anchor: View, xInKey: Float, yInKey: Float) {
        runOnMainThread {
            showDotAtAnchor(reactTag, anchor, xInKey, yInKey)
        }
    }

    /** Touch doodle at window coordinates (pageX/pageY) — no react tag required. */
    fun showDotAtScreen(pageX: Float, pageY: Float) {
        runOnMainThread {
            val container = ensureOverlayContainer() ?: return@runOnMainThread
            val containerLoc = IntArray(2)
            container.getLocationOnScreen(containerLoc)
            val centerX = pageX - containerLoc[0]
            val centerY = pageY - containerLoc[1]
            placeAnimatedDot(container, centerX, centerY)
        }
    }

    fun hide(reactTag: Int) {
        runOnMainThread {
            showSeq[reactTag] = (showSeq[reactTag] ?: 0) + 1
            cancelPendingLayoutShow(reactTag)
            if (activeOverlays[reactTag] == null) {
                hideRequested.remove(reactTag)
                return@runOnMainThread
            }
            hideRequested.add(reactTag)
            releaseOverlay(reactTag)
        }
    }

    fun hideAll() {
        runOnMainThread {
            for (tag in pendingLayoutShows.keys.toList()) {
                cancelPendingLayoutShow(tag)
            }
            for (tag in activeOverlays.keys.toList()) {
                releaseOverlay(tag)
            }
            for (dot in activeDots.toList()) {
                dot.animate().cancel()
                dot.visibility = View.GONE
                activeDots.remove(dot)
                dotPool.addLast(dot)
            }
        }
    }

    fun destroy() {
        runOnMainThread {
            removeContainerListener?.invoke()
            removeContainerListener = null
            hideAll()
            while (overlayPool.isNotEmpty()) {
                val view = overlayPool.removeFirst()
                (view.parent as? ViewGroup)?.removeView(view)
            }
            while (dotPool.isNotEmpty()) {
                val dot = dotPool.removeFirst()
                (dot.parent as? ViewGroup)?.removeView(dot)
            }
            for (dot in activeDots) {
                dot.animate().cancel()
                (dot.parent as? ViewGroup)?.removeView(dot)
            }
            activeDots.clear()
            overlayContainer = null
        }
    }

    private fun attachContainer() {
        val container = KeyboardInputBridge.peekPreviewOverlay() ?: return
        if (container === overlayContainer) {
            return
        }
        for (view in activeOverlays.values) {
            (view.parent as? ViewGroup)?.removeView(view)
        }
        activeOverlays.clear()
        while (dotPool.isNotEmpty()) {
            val dot = dotPool.removeFirst()
            (dot.parent as? ViewGroup)?.removeView(dot)
        }
        for (dot in activeDots) {
            dot.animate().cancel()
            dot.visibility = View.GONE
            (dot.parent as? ViewGroup)?.removeView(dot)
        }
        activeDots.clear()
        overlayContainer = container
        warmPool(container, POOL_WARM_SIZE)
        warmDotPool(container, DOT_POOL_WARM_SIZE)
    }

    private fun warmPool(container: FrameLayout, count: Int) {
        repeat(count) {
            val view = createOverlayView(container.context)
            view.visibility = View.GONE
            container.addView(
                view,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
            overlayPool.addLast(view)
        }
    }

    private fun warmDotPool(container: FrameLayout, count: Int) {
        repeat(count) {
            val dot = createDotView(container.context)
            dot.visibility = View.GONE
            container.addView(
                dot,
                FrameLayout.LayoutParams(DOT_SIZE_DP.dpPx(), DOT_SIZE_DP.dpPx()),
            )
            dotPool.addLast(dot)
        }
    }

    private fun showAtAnchor(reactTag: Int, anchor: View) {
        val container = overlayContainer
            ?: KeyboardInputBridge.getPopupAnchorView() as? FrameLayout
            ?: return
        overlayContainer = container

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
                        showAtAnchor(reactTag, anchor)
                    }
                }
            pendingLayoutShows[reactTag] = PendingLayoutShow(anchor, listener)
            observer.addOnGlobalLayoutListener(listener)
            return
        }

        cancelPendingLayoutShow(reactTag)
        if (hideRequested.contains(reactTag)) {
            return
        }
        val overlay = obtainOverlay(container, reactTag)
        applyOverlayBackground(overlay, anchor.height)
        positionOverlay(overlay, anchor, container)
        overlay.visibility = View.VISIBLE
        overlay.alpha = 1f
        overlay.bringToFront()
        container.invalidate()
    }

    private fun positionOverlay(overlay: View, anchor: View, container: FrameLayout) {
        val anchorPosition = resolveAnchorPosition(anchor, container) ?: return
        val left = anchorPosition.first
        val top = anchorPosition.second
        val width = anchor.width
        val height = anchor.height

        val params = overlay.layoutParams as FrameLayout.LayoutParams
        params.width = width
        params.height = height
        params.leftMargin = left
        params.topMargin = top
        overlay.layoutParams = params
    }

    private fun showDotAtAnchor(reactTag: Int, anchor: View, xInKey: Float, yInKey: Float) {
        val container = ensureOverlayContainer() ?: return
        if (anchor.width <= 0 || anchor.height <= 0) {
            return
        }
        val anchorPosition = resolveAnchorPosition(anchor, container) ?: return
        val clampedX = xInKey.coerceIn(0f, anchor.width.toFloat())
        val clampedY = yInKey.coerceIn(0f, anchor.height.toFloat())
        placeAnimatedDot(
            container,
            anchorPosition.first + clampedX,
            anchorPosition.second + clampedY,
        )
    }

    private fun ensureOverlayContainer(): FrameLayout? {
        val existing = overlayContainer
        if (existing != null) {
            return existing
        }
        val container =
            KeyboardInputBridge.peekPreviewOverlay()
                ?: KeyboardInputBridge.getPopupAnchorView() as? FrameLayout
                ?: return null
        overlayContainer = container
        if (dotPool.isEmpty() && overlayPool.isEmpty()) {
            warmPool(container, POOL_WARM_SIZE)
            warmDotPool(container, DOT_POOL_WARM_SIZE)
        }
        return container
    }

    private fun placeAnimatedDot(container: FrameLayout, centerX: Float, centerY: Float) {
        val dot = obtainDot(container)
        val sizePx = DOT_SIZE_DP.dpPx()
        val half = sizePx / 2f
        val params = dot.layoutParams as FrameLayout.LayoutParams
        params.width = sizePx
        params.height = sizePx
        params.leftMargin = (centerX - half).toInt()
        params.topMargin = (centerY - half).toInt()
        dot.layoutParams = params
        dot.pivotX = half
        dot.pivotY = half
        dot.visibility = View.VISIBLE
        dot.alpha = DOT_START_ALPHA
        dot.scaleX = DOT_START_SCALE
        dot.scaleY = DOT_START_SCALE
        activeDots.add(dot)
        dot.bringToFront()
        dot.animate().cancel()
        dot.animate()
            .alpha(0f)
            .scaleX(DOT_END_SCALE)
            .scaleY(DOT_END_SCALE)
            .setDuration(DOT_FADE_MS)
            .withEndAction {
                dot.visibility = View.GONE
                activeDots.remove(dot)
                dotPool.addLast(dot)
            }
            .start()
        container.invalidate()
    }

    private fun obtainOverlay(container: FrameLayout, reactTag: Int): View {
        activeOverlays[reactTag]?.let { return it }
        val overlay =
            if (overlayPool.isNotEmpty()) {
                overlayPool.removeFirst()
            } else {
                createOverlayView(container.context).also {
                    container.addView(
                        it,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.WRAP_CONTENT,
                            FrameLayout.LayoutParams.WRAP_CONTENT,
                        ),
                    )
                }
            }
        activeOverlays[reactTag] = overlay
        return overlay
    }

    private fun releaseOverlay(reactTag: Int) {
        val overlay = activeOverlays.remove(reactTag) ?: return
        hideRequested.remove(reactTag)
        overlay.visibility = View.GONE
        overlayPool.addLast(overlay)
    }

    private fun createOverlayView(context: Context): View =
        View(context).apply {
            isClickable = false
            isFocusable = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

    private fun createDotView(context: Context): View =
        View(context).apply {
            isClickable = false
            isFocusable = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            elevation = 12f
            background =
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(DOODLE_DOT_FILL)
                    setStroke(2.dpPx(), DOODLE_DOT_STROKE)
                }
        }

    private fun applyOverlayBackground(overlay: View, heightPx: Int = overlay.height) {
        val height =
            (if (heightPx > 0) heightPx else dpToPx(DEFAULT_CORNER_RADIUS_DP.toFloat())).toFloat()
        val radius =
            min(
                dpToPx(cornerRadiusDp).toFloat(),
                height / 2f,
            )
        overlay.background =
            GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(pressedColorArgb)
                cornerRadius = radius
            }
    }

    private fun obtainDot(container: FrameLayout): View =
        if (dotPool.isNotEmpty()) {
            dotPool.removeFirst()
        } else {
            createDotView(container.context).also {
                container.addView(
                    it,
                    FrameLayout.LayoutParams(DOT_SIZE_DP.dpPx(), DOT_SIZE_DP.dpPx()),
                )
            }
        }

    private fun resolveAnchorPosition(anchor: View, container: FrameLayout): Pair<Int, Int>? {
        val coordinateRoot =
            KeyboardInputBridge.getKeyboardCoordinateView() as? ViewGroup
        val anchorRect = Rect()
        anchor.getDrawingRect(anchorRect)
        val positionedInHierarchy =
            coordinateRoot != null && isDescendantOf(anchor, coordinateRoot)
        val left: Int
        val top: Int
        if (positionedInHierarchy) {
            coordinateRoot!!.offsetDescendantRectToMyCoords(anchor, anchorRect)
            left = anchorRect.left
            top = anchorRect.top
        } else {
            val keyLoc = IntArray(2)
            val containerLoc = IntArray(2)
            anchor.getLocationOnScreen(keyLoc)
            container.getLocationOnScreen(containerLoc)
            left = keyLoc[0] - containerLoc[0]
            top = keyLoc[1] - containerLoc[1]
        }
        return left to top
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

    private fun parseColorOrFallback(value: String, fallback: Int): Int =
        try {
            Color.parseColor(value.trim())
        } catch (_: IllegalArgumentException) {
            fallback
        }

    private fun defaultDotColor(base: Int): Int {
        val luminance =
            (0.299f * Color.red(base) + 0.587f * Color.green(base) + 0.114f * Color.blue(base)) /
                255f
        return if (luminance < 0.45f) {
            Color.argb(220, 255, 255, 255)
        } else {
            Color.argb(170, 0, 0, 0)
        }
    }

    private fun defaultDotStrokeColor(base: Int): Int {
        val luminance =
            (0.299f * Color.red(base) + 0.587f * Color.green(base) + 0.114f * Color.blue(base)) /
                255f
        return if (luminance < 0.45f) {
            Color.argb(175, 0, 0, 0)
        } else {
            Color.argb(150, 255, 255, 255)
        }
    }

    private fun dpToPx(dp: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            (KeyboardInputBridge.inputService ?: fallbackContext).resources.displayMetrics,
        ).toInt()

    private fun Int.dpPx(): Int = dpToPx(toFloat()).coerceAtLeast(1)

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            handler.post(action)
        }
    }

    companion object {
        private const val POOL_WARM_SIZE = 12
        private const val DOT_POOL_WARM_SIZE = 12
        private const val DEFAULT_CORNER_RADIUS_DP = 6
        private const val DEFAULT_PRESSED_COLOR = "#454545"
        private val DOODLE_DOT_FILL = Color.argb(235, 255, 199, 0)
        private val DOODLE_DOT_STROKE = Color.argb(210, 0, 0, 0)
        private const val DOT_SIZE_DP = 11
        private const val DOT_FADE_MS = 200L
        private const val DOT_START_SCALE = 0.9f
        private const val DOT_END_SCALE = 1.65f
        private const val DOT_START_ALPHA = 1f

        @Volatile
        private var shared: KeyPressOverlayManager? = null

        fun shared(context: Context): KeyPressOverlayManager {
            val app = context.applicationContext
            val current = shared
            if (current != null) {
                return current
            }
            return synchronized(this) {
                shared
                    ?: KeyPressOverlayManager(app).also { manager ->
                        manager.init()
                        shared = manager
                    }
            }
        }

        fun clearShared() {
            synchronized(this) {
                shared?.destroy()
                shared = null
            }
        }
    }
}
