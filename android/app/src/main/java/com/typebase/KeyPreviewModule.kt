package com.typebase

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.fabric.FabricUIManager
import com.facebook.react.fabric.interop.UIBlock
import com.facebook.react.uimanager.UIManagerHelper

@OptIn(UnstableReactNativeAPI::class)
class KeyPreviewModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val manager = KeyPreviewManager(reactContext)

    override fun getName() = "KeyPreview"

    @ReactMethod
    fun init() {
        manager.init()
    }

    @ReactMethod
    fun show(reactTag: Int, label: String) {
        val uiManager =
            UIManagerHelper.getUIManagerForReactTag(reactContext, reactTag)
                as? FabricUIManager ?: return

        uiManager.addUIBlock(
            UIBlock { resolver ->
                val view = resolver.resolveView(reactTag) ?: return@UIBlock
                manager.show(view, label)
            },
        )
    }

    @ReactMethod
    fun hide() {
        manager.hide()
    }

    @ReactMethod
    fun hideDelayed(delayMs: Double) {
        manager.hideDelayed(delayMs.toLong())
    }

    @ReactMethod
    fun destroy() {
        manager.destroy()
    }
}
