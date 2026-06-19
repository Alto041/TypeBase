package com.typebase

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

    override fun getName() = "KeyPreview"

    @ReactMethod
    fun init() {
        manager.init()
    }

    @ReactMethod
    fun setTheme(backgroundColor: String, textColor: String) {
        manager.setTheme(backgroundColor, textColor)
    }

    @ReactMethod
    fun show(reactTag: Int, label: String) {
        UiThreadUtil.runOnUiThread {
            resolveAnchorView(reactTag)?.let { view ->
                manager.show(view, label)
                return@runOnUiThread
            }

            val uiManager =
                UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                    as? FabricUIManager ?: return@runOnUiThread

            uiManager.addUIBlock(
                UIBlock { resolver ->
                    val view = resolver.resolveView(reactTag) ?: return@UIBlock
                    anchorViewCache[reactTag] = WeakReference(view)
                    manager.show(view, label)
                },
            )
        }
    }

    @ReactMethod
    fun hide() {
        UiThreadUtil.runOnUiThread {
            manager.hide()
        }
    }

    @ReactMethod
    fun hideDelayed(delayMs: Double) {
        manager.hideDelayed(delayMs.toLong())
    }

    @ReactMethod
    fun destroy() {
        anchorViewCache.clear()
        manager.destroy()
    }

    private fun resolveAnchorView(reactTag: Int): View? {
        anchorViewCache[reactTag]?.get()?.let { return it }

        val container =
            KeyboardInputBridge.getPopupAnchorView() as? ViewGroup ?: return null
        val searchRoot =
            if (container.childCount > 0) {
                container.getChildAt(0)
            } else {
                container
            }

        val found = searchRoot.findViewById<View>(reactTag) ?: return null
        anchorViewCache[reactTag] = WeakReference(found)
        return found
    }
}
