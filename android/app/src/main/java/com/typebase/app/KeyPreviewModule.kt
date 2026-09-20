package com.typebase.app

import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.fabric.FabricUIManager
import com.facebook.react.fabric.interop.UIBlock
import com.facebook.react.uimanager.UIManagerHelper
import java.lang.ref.WeakReference

@OptIn(UnstableReactNativeAPI::class)
class KeyPreviewModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val manager = KeyPreviewManager(reactContext)
    private val pressOverlayManager: KeyPressOverlayManager
        get() = KeyPressOverlayManager.shared(reactContext)
    private val anchorViewCache = HashMap<Int, WeakReference<View>>()
    /** Bumped only on hide so in-flight Fabric resolves are not cancelled by duplicate shows. */
    private val hideGenerations = HashMap<Int, Int>()
    private val pressedHideGenerations = HashMap<Int, Int>()
    private var globalHideGeneration = 0

    override fun getName() = "KeyPreview"

    @ReactMethod
    fun init() {
        manager.init()
        pressOverlayManager.init()
        KeyboardInputBridge.registerKeyPreviewCallbacks(
            show = { reactTag, label -> showPreviewOnUiThread(reactTag, label) },
            hide = { reactTag -> hidePreviewOnUiThread(reactTag) },
            showPressed = { reactTag -> showPressedOnUiThread(reactTag) },
            hidePressed = { reactTag -> hidePressedOnUiThread(reactTag) },
            showDoodleDot = { reactTag, xInKey, yInKey ->
                showDoodleDotOnUiThread(reactTag, xInKey, yInKey)
            },
            showDoodleAtScreen = { pageX, pageY ->
                showDoodleAtScreenOnUiThread(pageX, pageY)
            },
        )
    }

    @ReactMethod
    fun setTheme(
        backgroundColor: String,
        textColor: String,
        fontAssetPath: String,
        cornerRadiusDp: Double,
        pressedOverlayColor: String,
    ) {
        manager.setTheme(
            backgroundColor,
            textColor,
            fontAssetPath.trim().ifEmpty { null },
            cornerRadiusDp.toFloat().coerceAtLeast(0f),
        )
        pressOverlayManager.setTheme(
            pressedOverlayColor,
            cornerRadiusDp.toFloat().coerceAtLeast(0f),
        )
    }

    @ReactMethod
    fun show(reactTag: Int, label: String) {
        performShowPreview(reactTag, label)
    }

    @ReactMethod
    fun hide(reactTag: Int) {
        performHidePreview(reactTag)
    }

    /** Warm native anchor lookup so the first tap does not wait on Fabric. */
    @ReactMethod
    fun primeAnchor(reactTag: Int) {
        if (reactTag <= 0) {
            return
        }
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { primeAnchor(reactTag) }
            return
        }
        resolveAnchorView(reactTag)
    }

    @ReactMethod
    fun showPressed(reactTag: Int) {
        showPressedOnUiThread(reactTag)
    }

    @ReactMethod
    fun showDoodleDot(reactTag: Int, xInKey: Double, yInKey: Double) {
        showDoodleDotOnUiThread(reactTag, xInKey.toFloat(), yInKey.toFloat())
    }

    @ReactMethod
    fun showDoodleAt(pageX: Double, pageY: Double) {
        showDoodleAtScreenOnUiThread(pageX.toFloat(), pageY.toFloat())
    }

    @ReactMethod
    fun hidePressed(reactTag: Int) {
        hidePressedOnUiThread(reactTag)
    }

    @ReactMethod
    fun hideAll() {
        UiThreadUtil.runOnUiThread {
            globalHideGeneration++
            for (tag in (hideGenerations.keys + anchorViewCache.keys).toSet()) {
                hideGenerations[tag] = (hideGenerations[tag] ?: 0) + 1
            }
            manager.hideAll()
            pressOverlayManager.hideAll()
        }
    }

    @ReactMethod
    fun hideDelayed(delayMs: Double) {
        UiThreadUtil.runOnUiThread {
            globalHideGeneration++
            for (tag in (hideGenerations.keys + anchorViewCache.keys).toSet()) {
                hideGenerations[tag] = (hideGenerations[tag] ?: 0) + 1
            }
            manager.hideAllDelayed(delayMs.toLong())
            pressOverlayManager.hideAll()
        }
    }

    @ReactMethod
    fun destroy() {
        UiThreadUtil.runOnUiThread {
            anchorViewCache.clear()
            hideGenerations.clear()
            globalHideGeneration = 0
            KeyboardInputBridge.clearKeyPreviewCallbacks()
            manager.destroy()
            pressOverlayManager.destroy()
            KeyPressOverlayManager.clearShared()
        }
    }

    private fun showPreviewOnUiThread(reactTag: Int, label: String) {
        performShowPreview(reactTag, label)
    }

    private fun hidePreviewOnUiThread(reactTag: Int) {
        performHidePreview(reactTag)
    }

    private fun performShowPreview(reactTag: Int, label: String) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { performShowPreview(reactTag, label) }
            return
        }
        val hideGenAtShow = hideGenerations[reactTag] ?: 0
        val globalAtShow = globalHideGeneration

        resolveAnchorView(reactTag)?.let { view ->
            if (!isShowStale(reactTag, hideGenAtShow, globalAtShow)) {
                manager.show(reactTag, view, label)
            }
            return
        }

        val uiManager =
            UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                as? FabricUIManager ?: return

        uiManager.addUIBlock(
            UIBlock { resolver ->
                UiThreadUtil.runOnUiThread {
                    if (isShowStale(reactTag, hideGenAtShow, globalAtShow)) {
                        return@runOnUiThread
                    }
                    val view = resolver.resolveView(reactTag) ?: return@runOnUiThread
                    anchorViewCache[reactTag] = WeakReference(view)
                    manager.show(reactTag, view, label)
                }
            },
        )
    }

    private fun performHidePreview(reactTag: Int) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { performHidePreview(reactTag) }
            return
        }
        hideGenerations[reactTag] = (hideGenerations[reactTag] ?: 0) + 1
        manager.hide(reactTag)
    }

    private fun showPressedOnUiThread(reactTag: Int) {
        if (reactTag <= 0) {
            return
        }
        performShowPressed(reactTag)
    }

    private fun hidePressedOnUiThread(reactTag: Int) {
        if (reactTag <= 0) {
            return
        }
        performHidePressed(reactTag)
    }

    private fun showDoodleDotOnUiThread(reactTag: Int, xInKey: Float, yInKey: Float) {
        if (reactTag <= 0) {
            return
        }
        performShowDoodleDot(reactTag, xInKey, yInKey)
    }

    private fun showDoodleAtScreenOnUiThread(pageX: Float, pageY: Float) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { showDoodleAtScreenOnUiThread(pageX, pageY) }
            return
        }
        pressOverlayManager.showDotAtScreen(pageX, pageY)
    }

    private fun performShowPressed(reactTag: Int) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { performShowPressed(reactTag) }
            return
        }
        val hideGenAtShow = pressedHideGenerations[reactTag] ?: 0
        resolveAnchorView(reactTag)?.let { view ->
            if (!isPressedShowStale(reactTag, hideGenAtShow)) {
                pressOverlayManager.show(reactTag, view)
            }
            return
        }

        val uiManager =
            UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                as? FabricUIManager ?: return

        uiManager.addUIBlock(
            UIBlock { resolver ->
                UiThreadUtil.runOnUiThread {
                    if (isPressedShowStale(reactTag, hideGenAtShow)) {
                        return@runOnUiThread
                    }
                    val view = resolver.resolveView(reactTag) ?: return@runOnUiThread
                    anchorViewCache[reactTag] = WeakReference(view)
                    pressOverlayManager.show(reactTag, view)
                }
            },
        )
    }

    private fun performHidePressed(reactTag: Int) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { performHidePressed(reactTag) }
            return
        }
        pressedHideGenerations[reactTag] = (pressedHideGenerations[reactTag] ?: 0) + 1
        pressOverlayManager.hide(reactTag)
    }

    private fun performShowDoodleDot(reactTag: Int, xInKey: Float, yInKey: Float) {
        if (!UiThreadUtil.isOnUiThread()) {
            UiThreadUtil.runOnUiThread { performShowDoodleDot(reactTag, xInKey, yInKey) }
            return
        }
        resolveAnchorView(reactTag)?.let { view ->
            pressOverlayManager.showDoodleDot(reactTag, view, xInKey, yInKey)
            return
        }
        val uiManager =
            UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                as? FabricUIManager ?: return
        uiManager.addUIBlock(
            UIBlock { resolver ->
                UiThreadUtil.runOnUiThread {
                    val view = resolver.resolveView(reactTag) ?: return@runOnUiThread
                    anchorViewCache[reactTag] = WeakReference(view)
                    pressOverlayManager.showDoodleDot(reactTag, view, xInKey, yInKey)
                }
            },
        )
    }

    private fun isPressedShowStale(reactTag: Int, hideGenAtShow: Int): Boolean =
        hideGenAtShow != (pressedHideGenerations[reactTag] ?: 0)

    private fun isShowStale(
        reactTag: Int,
        hideGenAtShow: Int,
        globalAtShow: Int,
    ): Boolean =
        hideGenAtShow != (hideGenerations[reactTag] ?: 0) ||
            globalAtShow != globalHideGeneration

    private fun resolveAnchorView(reactTag: Int): View? {
        anchorViewCache[reactTag]?.get()?.let { cached ->
            if (cached.isAttachedToWindow && cached.width > 0 && cached.height > 0) {
                return cached
            }
            anchorViewCache.remove(reactTag)
        }

        val searchRoot =
            KeyboardInputBridge.getKeyboardCoordinateView() as? ViewGroup ?: return null

        val found = searchRoot.findViewById<View>(reactTag) ?: return null
        if (found.width <= 0 || found.height <= 0) {
            return null
        }
        anchorViewCache[reactTag] = WeakReference(found)
        return found
    }
}
