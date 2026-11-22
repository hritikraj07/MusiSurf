package com.musisurf.app.media

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "MusiSurfMediaPlugin")
class MusiSurfMediaPlugin : Plugin() {

    private var mediaService: MusiSurfMediaService? = null
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as MusiSurfMediaService.MediaServiceBinder
            mediaService = binder.getService()
            isBound = true
            setupServiceListeners()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            mediaService = null
            isBound = false
        }
    }

    override fun load() {
        super.load()
        bindMediaService()
    }

    private fun bindMediaService() {
        val intent = Intent(context, MusiSurfMediaService::class.java)
        context.startService(intent)
        context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    private fun setupServiceListeners() {
        mediaService?.setOnPlaybackEventListener(object : MusiSurfMediaService.PlaybackEventListener {
            override fun onPlaybackStateChanged(isPlaying: Boolean, state: String, position: Long, duration: Long) {
                val data = JSObject().apply {
                    put("isPlaying", isPlaying)
                    put("playbackState", state)
                    put("currentPosition", position / 1000.0)
                    put("duration", duration / 1000.0)
                }
                notifyListeners("playbackStateChanged", data)
            }

            override fun onTrackChanged(track: JSObject?, index: Int, queueSize: Int) {
                val data = JSObject().apply {
                    put("track", track ?: JSObject())
                    put("index", index)
                    put("queueLength", queueSize)
                }
                notifyListeners("trackChanged", data)
            }

            override fun onPositionUpdated(position: Long, duration: Long) {
                val data = JSObject().apply {
                    put("position", position / 1000.0)
                    put("duration", duration / 1000.0)
                }
                notifyListeners("playbackPositionUpdate", data)
            }

            override fun onQueueUpdated(queue: JSArray, currentIndex: Int) {
                val data = JSObject().apply {
                    put("queue", queue)
                    put("currentIndex", currentIndex)
                }
                notifyListeners("queueUpdated", data)
            }

            override fun onError(errorCode: String, errorMessage: String, trackId: String?) {
                val data = JSObject().apply {
                    put("errorCode", errorCode)
                    put("errorMessage", errorMessage)
                    put("trackId", trackId)
                    put("recoverable", true)
                }
                notifyListeners("playerError", data)
            }

            override fun onAudioFocusChanged(focusState: String) {
                val data = JSObject().apply {
                    put("focusState", focusState)
                }
                notifyListeners("audioFocusChanged", data)
            }
        })
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val track = call.getObject("track")
        val startTime = call.getDouble("startTime", 0.0) ?: 0.0
        if (mediaService != null) {
            mediaService?.playTrack(track, (startTime * 1000).toLong())
            call.resolve(JSObject().apply { put("success", true) })
        } else {
            bindMediaService()
            call.resolve(JSObject().apply { put("success", false); put("error", "Service not ready") })
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        mediaService?.pause()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        mediaService?.resume()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val positionSeconds = call.getDouble("position", 0.0) ?: 0.0
        mediaService?.seekTo((positionSeconds * 1000).toLong())
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun next(call: PluginCall) {
        mediaService?.next()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun previous(call: PluginCall) {
        mediaService?.previous()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun setQueue(call: PluginCall) {
        val queue = call.getArray("queue") ?: JSArray()
        val startIndex = call.getInt("startIndex", 0) ?: 0
        mediaService?.setQueue(queue, startIndex)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun getPlaybackState(call: PluginCall) {
        val state = mediaService?.getPlaybackSnapshot() ?: JSObject().apply {
            put("isPlaying", false)
            put("status", "idle")
            put("position", 0.0)
            put("duration", 0.0)
            put("activeEngine", "android_native")
        }
        call.resolve(state)
    }

    @PluginMethod
    fun setShuffle(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        mediaService?.setShuffle(enabled)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun setRepeat(call: PluginCall) {
        val mode = call.getString("mode", "off") ?: "off"
        mediaService?.setRepeat(mode)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun getCurrentSong(call: PluginCall) {
        val song = mediaService?.getCurrentTrack()
        call.resolve(JSObject().apply { put("track", song) })
    }

    @PluginMethod
    fun getCurrentPosition(call: PluginCall) {
        val pos = (mediaService?.getCurrentPosition() ?: 0L) / 1000.0
        call.resolve(JSObject().apply { put("position", pos) })
    }

    @PluginMethod
    fun getDuration(call: PluginCall) {
        val dur = (mediaService?.getDuration() ?: 0L) / 1000.0
        call.resolve(JSObject().apply { put("duration", dur) })
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        val volume = call.getDouble("volume", 0.8) ?: 0.8
        mediaService?.setVolume(volume.toFloat())
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun downloadTrack(call: PluginCall) {
        val track = call.getObject("track")
        if (track != null && mediaService != null) {
            mediaService?.downloadTrackFile(track) { uri, success ->
                val res = JSObject().apply {
                    put("success", success)
                    put("localFileUri", uri)
                }
                call.resolve(res)
            }
        } else {
            call.reject("Invalid track or service unavailable")
        }
    }

    @PluginMethod
    fun removeDownloadedTrack(call: PluginCall) {
        val trackId = call.getString("trackId") ?: ""
        val removed = mediaService?.removeDownloadedFile(trackId) ?: false
        call.resolve(JSObject().apply { put("success", removed) })
    }

    @PluginMethod
    fun getDownloadedTracks(call: PluginCall) {
        val tracks = mediaService?.getDownloadedTracksList() ?: JSArray()
        call.resolve(JSObject().apply { put("tracks", tracks) })
    }

    override fun handleOnDestroy() {
        if (isBound) {
            context.unbindService(serviceConnection)
            isBound = false
        }
        super.handleOnDestroy()
    }
}
