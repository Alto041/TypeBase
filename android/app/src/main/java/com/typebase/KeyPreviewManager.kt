package com.typebase

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Key preview drawn as a rounded rectangle overlay inside the IME keyboard container.
 * Matches key cap shape and uses the Geist font.
 */
class KeyPreviewManager(private val fallbackContext: Context) {

    private var previewView: TextView? = null
    private val handler = Handler(Looper.getMainLooper())
    private var dismissRunnable: Runnable? = null
    private var geistTypeface: Typeface? = null
    private var backgroundColorArgb = Color.parseColor(DARK_PREVIEW_BACKGROUND)
    private var textColorArgb = Color.parseColor(DARK_PREVIEW_TEXT)

    private fun popupContext(): Context =
        KeyboardInputBridge.inputService ?: fallbackContext

    fun init() {
        runOnMainThread {
            val container =
                KeyboardInputBridge.getPopupAnchorView() as? FrameLayout ?: return@runOnMainThread
            if (!ensurePreviewView(container)) return@runOnMainThread
            previewView?.context?.let { loadGeistTypeface(it) }
            applyThemeToPreviewView()
        }
    }

    fun setTheme(backgroundColor: String, textColor: String) {
        runOnMainThread {
            backgroundColorArgb = parseColorOrFallback(backgroundColor, backgroundColorArgb)
            textColorArgb = parseColorOrFallback(textColor, textColorArgb)
            applyThemeToPreviewView()
        }
    }

    fun show(anchor: View, label: String) {
        runOnMainThread {
            showAtAnchor(anchor, label)
        }
    }

    fun hide() {
        runOnMainThread {
            cancelDismiss()
            previewView?.visibility = View.GONE
        }
    }

    fun hideDelayed(delayMs: Long = 80) {
        cancelDismiss()
        dismissRunnable = Runnable {
            previewView?.visibility = View.GONE
        }.also { handler.postDelayed(it, delayMs) }
    }

    fun destroy() {
        handler.removeCallbacksAndMessages(null)
        (previewView?.parent as? ViewGroup)?.removeView(previewView)
        previewView = null
        geistTypeface = null
    }

    private fun showAtAnchor(anchor: View, label: String) {
        val container = KeyboardInputBridge.getPopupAnchorView() as? FrameLayout ?: return
        if (!ensurePreviewView(container)) return
        cancelDismiss()

        val tv = previewView ?: return
        applyThemeToPreviewView()
        tv.text = label

        val previewWidth = anchor.width.coerceAtLeast(dpToPx(MIN_PREVIEW_WIDTH_DP))
        val previewHeight = anchor.height.coerceAtLeast(dpToPx(MIN_PREVIEW_HEIGHT_DP))
        val gapAboveKey = dpToPx(PREVIEW_GAP_ABOVE_KEY_DP)

        val keyLoc = IntArray(2)
        val containerLoc = IntArray(2)
        anchor.getLocationInWindow(keyLoc)
        container.getLocationInWindow(containerLoc)

        val centerX = keyLoc[0] - containerLoc[0] + anchor.width / 2f
        val topY = keyLoc[1] - containerLoc[1]

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

    private fun ensurePreviewView(container: FrameLayout): Boolean {
        if (previewView != null && previewView?.parent === container) {
            return true
        }

        (previewView?.parent as? ViewGroup)?.removeView(previewView)

        val tv = previewView ?: createPreviewTextView(container.context).also { previewView = it }

        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
        )
        container.addView(tv, params)
        tv.visibility = View.GONE
        return true
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

    private fun applyThemeToPreviewView() {
        val tv = previewView ?: return
        tv.setTextColor(textColorArgb)
        val background = tv.background
        if (background is GradientDrawable) {
            background.setColor(backgroundColorArgb)
            return
        }

        val cornerRadius = dpToPx(KEY_CORNER_RADIUS_DP).toFloat()
        tv.background =
            GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(backgroundColorArgb)
                this.cornerRadius = cornerRadius
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

    private fun cancelDismiss() {
        dismissRunnable?.let { handler.removeCallbacks(it) }
        dismissRunnable = null
    }

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            handler.postAtFrontOfQueue(action)
        }
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(),
            popupContext().resources.displayMetrics
        ).toInt()

    companion object {
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
