package com.opennotes.app

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModuleList
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

@ReactModuleList(nativeModules = [PDFUtilsModule::class])
class PDFUtilsPackage : TurboReactPackage() {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(PDFUtilsModule(reactContext))
    }

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return when (name) {
            PDFUtilsModule.NAME -> PDFUtilsModule(reactContext)
            else -> null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                PDFUtilsModule.NAME to ReactModuleInfo(
                    PDFUtilsModule.NAME,
                    PDFUtilsModule::class.java.name,
                    false,
                    false,
                    false,
                    false,
                    false
                )
            )
        }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
