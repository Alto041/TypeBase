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
    /** Per-key generation — stale Fabric UIBlock shows are skipped without affecting other keys. */
    private val showGenerations = HashMap<Int, Int>()

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
    fun setTheme(backgroundColor: String, textColor: String) {
        manager.setTheme(backgroundColor, textColor)
    }

    @ReactMethod
    fun show(reactTag: Int, label: String) {
        UiThreadUtil.runOnUiThread {
            val generation = (showGenerations[reactTag] ?: 0) + 1
            showGenerations[reactTag] = generation

            resolveAnchorView(reactTag)?.let { view ->
                manager.show(reactTag, view, label)
                return@runOnUiThread
            }

            val uiManager =
                UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                    as? FabricUIManager ?: return@runOnUiThread

            uiManager.addUIBlock(
                UIBlock { resolver ->
                    UiThreadUtil.runOnUiThread {
                        if (generation != showGenerations[reactTag]) return@runOnUiThread
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
            showGenerations[reactTag] = (showGenerations[reactTag] ?: 0) + 1
            manager.hide(reactTag)
        }
    }

    @ReactMethod
    fun hideAll() {
        UiThreadUtil.runOnUiThread {
            showGenerations.clear()
            manager.hideAll()
        }
    }

    @ReactMethod
    fun hideDelayed(delayMs: Double) {
        UiThreadUtil.runOnUiThread {
            showGenerations.clear()
            manager.hideAllDelayed(delayMs.toLong())
        }
    }

    @ReactMethod
    fun destroy() {
        UiThreadUtil.runOnUiThread {
            anchorViewCache.clear()
            showGenerations.clear()
            KeyboardInputBridge.clearKeyPreviewCallbacks()
            manager.destroy()
        }
    }

    private fun showPreviewOnUiThread(reactTag: Int, label: String) {
        UiThreadUtil.runOnUiThread { show(reactTag, label) }
    }

    private fun hidePreviewOnUiThread(reactTag: Int) {
        UiThreadUtil.runOnUiThread { hide(reactTag) }
    }

    private fun resolveAnchorView(reactTag: Int): View? {
        anchorViewCache[reactTag]?.get()?.let { return it }

        val searchRoot =
            KeyboardInputBridge.getKeyboardCoordinateView() as? ViewGroup ?: return null

        val found = searchRoot.findViewById<View>(reactTag) ?: return null
        anchorViewCache[reactTag] = WeakReference(found)
        return found
    }
}
