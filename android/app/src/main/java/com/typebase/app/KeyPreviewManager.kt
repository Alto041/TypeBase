package com.typebase.app

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Key previews drawn as rounded rectangle overlays inside the IME keyboard container.
 * Supports multiple simultaneous previews for multi-touch typing.
 */
class KeyPreviewManager(private val fallbackContext: Context) {

    private val activePreviews = HashMap<Int, TextView>()
    private val dismissRunnables = HashMap<Int, Runnable>()
    private val viewPool = ArrayDeque<TextView>()
    private val handler = Handler(Looper.getMainLooper())
    private var geistTypeface: Typeface? = null
    private var backgroundColorArgb = Color.parseColor(DARK_PREVIEW_BACKGROUND)
    private var textColorArgb = Color.parseColor(DARK_PREVIEW_TEXT)
    private var previewContainer: FrameLayout? = null

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
        container.context.let { loadGeistTypeface(it) }
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
        while (viewPool.isNotEmpty()) {
            val tv = viewPool.removeFirst()
            (tv.parent as? ViewGroup)?.removeView(tv)
        }
    }

    fun setTheme(backgroundColor: String, textColor: String) {
        runOnMainThread {
            backgroundColorArgb = parseColorOrFallback(backgroundColor, backgroundColorArgb)
            textColorArgb = parseColorOrFallback(textColor, textColorArgb)
            applyThemeToPreviewView()
        }
    }

    fun show(reactTag: Int, anchor: View, label: String) {
        runOnMainThread {
            showAtAnchor(reactTag, anchor, label)
        }
    }

    fun hide(reactTag: Int) {
        runOnMainThread {
            cancelDismiss(reactTag)
            releasePreview(reactTag)
        }
    }

    fun hideAll() {
        runOnMainThread {
            val tags = activePreviews.keys.toList()
            for (tag in tags) {
                cancelDismiss(tag)
                releasePreview(tag)
            }
        }
    }

    fun hideAllDelayed(delayMs: Long = 80) {
        runOnMainThread {
            val tags = activePreviews.keys.toList()
            for (tag in tags) {
                hideDelayed(tag, delayMs)
            }
        }
    }

    fun hideDelayed(reactTag: Int, delayMs: Long = 80) {
        cancelDismiss(reactTag)
        if (!activePreviews.containsKey(reactTag)) {
            return
        }
        dismissRunnables[reactTag] = Runnable {
            dismissRunnables.remove(reactTag)
            releasePreview(reactTag)
        }.also { handler.postDelayed(it, delayMs) }
    }

    fun destroy() {
        runOnMainThread {
            handler.removeCallbacksAndMessages(null)
            dismissRunnables.clear()
            removePreviewContainerListener?.invoke()
            removePreviewContainerListener = null
            detachPreviewViewsFromOldContainer()
            previewContainer = null
            geistTypeface = null
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
        tv.visibility = View.GONE
        viewPool.addLast(tv)
    }

    private fun showAtAnchor(reactTag: Int, anchor: View, label: String) {
        val container = previewContainer
            ?: KeyboardInputBridge.getPopupAnchorView() as? FrameLayout
            ?: return
        previewContainer = container

        if (anchor.width <= 0 || anchor.height <= 0) {
            val observer = anchor.viewTreeObserver
            observer.addOnGlobalLayoutListener(
                object : ViewTreeObserver.OnGlobalLayoutListener {
                    override fun onGlobalLayout() {
                        if (anchor.width <= 0 || anchor.height <= 0) {
                            return
                        }
                        anchor.viewTreeObserver.removeOnGlobalLayoutListener(this)
                        showAtAnchor(reactTag, anchor, label)
                    }
                },
            )
            return
        }

        cancelDismiss(reactTag)

        val tv = obtainPreviewView(container, reactTag)
        applyThemeToPreviewView(tv)
        tv.text = label

        val previewWidth = anchor.width.coerceAtLeast(dpToPx(MIN_PREVIEW_WIDTH_DP))
        val previewHeight = anchor.height.coerceAtLeast(dpToPx(MIN_PREVIEW_HEIGHT_DP))
        val gapAboveKey = dpToPx(PREVIEW_GAP_ABOVE_KEY_DP)

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

    private fun createPreviewTextView(context: Context): TextView {
        val cornerRadius = dpToPx(KEY_CORNER_RADIUS_DP).toFloat()
        val keyBackground = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(backgroundColorArgb)
            this.cornerRadius = cornerRadius
        }

        return TextView(context).apply {
            gravity = Gravity.CENTER
            setTextColor(textColorArgb)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, LABEL_TEXT_SIZE_SP)
            typeface = loadGeistTypeface(context)
            background = keyBackground
            elevation = dpToPx(6).toFloat()
            includeFontPadding = false
        }
    }

    private fun applyThemeToPreviewView(tv: TextView? = null) {
        val targets =
            if (tv != null) {
                listOf(tv)
            } else {
                activePreviews.values.toList() + viewPool.toList()
            }

        for (preview in targets) {
            preview.setTextColor(textColorArgb)
            val background = preview.background
            if (background is GradientDrawable) {
                background.setColor(backgroundColorArgb)
            } else {
                val cornerRadius = dpToPx(KEY_CORNER_RADIUS_DP).toFloat()
                preview.background =
                    GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        setColor(backgroundColorArgb)
                        this.cornerRadius = cornerRadius
                    }
            }
        }
    }

    private fun parseColorOrFallback(value: String, fallback: Int): Int =
        try {
            Color.parseColor(value.trim())
        } catch (_: IllegalArgumentException) {
            fallback
        }

    private fun loadGeistTypeface(context: Context): Typeface {
        geistTypeface?.let { return it }

        val base =
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Typeface.Builder(context.assets, GEIST_FONT_PATH)
                        .setFontVariationSettings("'wght' $GEIST_WEIGHT")
                        .build()
                } else {
                    Typeface.createFromAsset(context.assets, GEIST_FONT_PATH)
                }
            } catch (_: Exception) {
                Typeface.DEFAULT
            }

        val typeface =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Typeface.create(base, GEIST_WEIGHT, false)
            } else {
                base
            }

        geistTypeface = typeface
        return typeface
    }

    private fun cancelDismiss(reactTag: Int) {
        dismissRunnables.remove(reactTag)?.let { handler.removeCallbacks(it) }
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

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(),
            popupContext().resources.displayMetrics
        ).toInt()

    companion object {
        private const val POOL_WARM_SIZE = 8
        private const val KEY_CORNER_RADIUS_DP = 6
        private const val PREVIEW_GAP_ABOVE_KEY_DP = 4
        private const val MIN_PREVIEW_WIDTH_DP = 32
        private const val MIN_PREVIEW_HEIGHT_DP = 40
        private const val LABEL_TEXT_SIZE_SP = 22f
        private const val GEIST_FONT_PATH = "fonts/Geist-VariableFont_wght.ttf"
        private const val GEIST_WEIGHT = 500
        private const val DARK_PREVIEW_BACKGROUND = "#454545"
        private const val DARK_PREVIEW_TEXT = "#FFFFFF"
    }
}
