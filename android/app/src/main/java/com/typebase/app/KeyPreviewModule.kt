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
    private val anchorViewCache = HashMap<Int, WeakReference<View>>()
    /** Bumped only on hide so in-flight Fabric resolves are not cancelled by duplicate shows. */
    private val hideGenerations = HashMap<Int, Int>()
    private var globalHideGeneration = 0

    override fun getName() = "KeyPreview"

    @ReactMethod
    fun init() {
        manager.init()
        KeyboardInputBridge.registerKeyPreviewCallbacks(
            show = { reactTag, label -> showPreviewOnUiThread(reactTag, label) },
            hide = { reactTag -> hidePreviewOnUiThread(reactTag) },
        )
    }

    @ReactMethod
    fun setTheme(
        backgroundColor: String,
        textColor: String,
        fontAssetPath: String,
        cornerRadiusDp: Double,
    ) {
        manager.setTheme(
            backgroundColor,
            textColor,
            fontAssetPath.trim().ifEmpty { null },
            cornerRadiusDp.toFloat().coerceAtLeast(0f),
        )
    }

    @ReactMethod
    fun show(reactTag: Int, label: String) {
        UiThreadUtil.runOnUiThread {
            val hideGenAtShow = hideGenerations[reactTag] ?: 0
            val globalAtShow = globalHideGeneration

            resolveAnchorView(reactTag)?.let { view ->
                if (!isShowStale(reactTag, hideGenAtShow, globalAtShow)) {
                    manager.show(reactTag, view, label)
                }
                return@runOnUiThread
            }

            val uiManager =
                UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                    as? FabricUIManager ?: return@runOnUiThread

            uiManager.addUIBlock(
                UIBlock { resolver ->
                    UiThreadUtil.runOnUiThread {
                        if (isShowStale(reactTag, hideGenAtShow, globalAtShow)) return@runOnUiThread
                        val view = resolver.resolveView(reactTag) ?: return@runOnUiThread
                        anchorViewCache[reactTag] = WeakReference(view)
                        manager.show(reactTag, view, label)
                    }
                },
            )
        }
    }

    @ReactMethod
    fun hide(reactTag: Int) {
        UiThreadUtil.runOnUiThread {
            // Do not bump hideGenerations here — that raced ahead of async shows on
            // fast taps and cancelled previews before they ever appeared. The manager
            // keeps the bubble visible for a minimum duration, then dismisses.
            manager.hide(reactTag)
        }
    }

    @ReactMethod
    fun hideAll() {
        UiThreadUtil.runOnUiThread {
            globalHideGeneration++
            for (tag in (hideGenerations.keys + anchorViewCache.keys).toSet()) {
                hideGenerations[tag] = (hideGenerations[tag] ?: 0) + 1
            }
            manager.hideAll()
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
        }
    }

    private fun showPreviewOnUiThread(reactTag: Int, label: String) {
        UiThreadUtil.runOnUiThread { show(reactTag, label) }
    }

    private fun hidePreviewOnUiThread(reactTag: Int) {
        UiThreadUtil.runOnUiThread {
            // Match JS hide(): delayed dismiss without cancelling in-flight show.
            manager.hide(reactTag)
        }
    }

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
