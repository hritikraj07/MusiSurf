package com.musisurf.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.musisurf.app.media.MusiSurfMediaPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(MusiSurfMediaPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}