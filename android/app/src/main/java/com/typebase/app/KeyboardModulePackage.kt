package com.typebase.app

import com.typebase.app.licensing.PlayLicenseModule
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class KeyboardModulePackage : ReactPackage {
  override fun createNativeModules(
      reactContext: ReactApplicationContext,
  ): List<NativeModule> =
      listOf(
          KeyboardModule(reactContext),
          VoiceRecorderModule(reactContext),
          VoiceActivationSoundModule(reactContext),
          KeyPreviewModule(reactContext),
          GemmaModule(reactContext),
          PlayLicenseModule(reactContext),
      )

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
