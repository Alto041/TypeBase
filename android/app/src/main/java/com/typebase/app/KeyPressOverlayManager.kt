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
    private val pendingLayoutShows = HashMap<Int, PendingLayoutShow>()
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
        }
    }

    fun show(reactTag: Int, anchor: View) {
        runOnMainThread {
            showAtAnchor(reactTag, anchor)
        }
    }

    fun hide(reactTag: Int) {
        runOnMainThread {
            cancelPendingLayoutShow(reactTag)
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
            overlayContainer = null
        }
    }

    private fun attachContainer() {
        val container =
            KeyboardInputBridge.getPopupAnchorView() as? FrameLayout ?: return
        if (container === overlayContainer) {
            return
        }
        for (view in activeOverlays.values) {
            (view.parent as? ViewGroup)?.removeView(view)
        }
        activeOverlays.clear()
        overlayContainer = container
        warmPool(container, POOL_WARM_SIZE)
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

    private fun showAtAnchor(reactTag: Int, anchor: View) {
        val container = overlayContainer
            ?: KeyboardInputBridge.getPopupAnchorView() as? FrameLayout
            ?: return
        overlayContainer = container

        if (anchor.width <= 0 || anchor.height <= 0) {
            cancelPendingLayoutShow(reactTag)
            val observer = anchor.viewTreeObserver
            val listener =
                object : ViewTreeObserver.OnGlobalLayoutListener {
                    override fun onGlobalLayout() {
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
        val overlay = obtainOverlay(container, reactTag)
        applyOverlayBackground(overlay, anchor.height)
        positionOverlay(overlay, anchor, container)
        overlay.visibility = View.VISIBLE
        overlay.alpha = 1f
        overlay.bringToFront()
        container.invalidate()
    }

    private fun positionOverlay(overlay: View, anchor: View, container: FrameLayout) {
        val coordinateRoot =
            KeyboardInputBridge.getKeyboardCoordinateView() as? ViewGroup
        val anchorRect = Rect()
        anchor.getDrawingRect(anchorRect)
        val positionedInHierarchy =
            coordinateRoot != null && isDescendantOf(anchor, coordinateRoot)

        val left: Int
        val top: Int
        val width = anchor.width
        val height = anchor.height
        if (positionedInHierarchy) {
            coordinateRoot!!.offsetDescendantRectToMyCoords(anchor, anchorRect)
            left = anchorRect.left
            top = anchorRect.top
        } else {
            val keyLoc = IntArray(2)
            val containerLoc = IntArray(2)
            anchor.getLocationInWindow(keyLoc)
            container.getLocationInWindow(containerLoc)
            left = keyLoc[0] - containerLoc[0]
            top = keyLoc[1] - containerLoc[1]
        }

        val params = overlay.layoutParams as FrameLayout.LayoutParams
        params.width = width
        params.height = height
        params.leftMargin = left
        params.topMargin = top
        overlay.layoutParams = params
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
        overlay.visibility = View.GONE
        overlayPool.addLast(overlay)
    }

    private fun createOverlayView(context: Context): View =
        View(context).apply {
            isClickable = false
            isFocusable = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
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

    private fun dpToPx(dp: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            (KeyboardInputBridge.inputService ?: fallbackContext).resources.displayMetrics,
        ).toInt()

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            handler.post(action)
        }
    }

    companion object {
        private const val POOL_WARM_SIZE = 12
        private const val DEFAULT_CORNER_RADIUS_DP = 6
        private const val DEFAULT_PRESSED_COLOR = "#454545"
    }
}
