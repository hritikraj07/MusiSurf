package com.musisurf.app.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes as Media3AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MusiSurfMediaService : MediaSessionService(), Player.Listener, AudioManager.OnAudioFocusChangeListener {

    interface PlaybackEventListener {
        fun onPlaybackStateChanged(isPlaying: Boolean, state: String, position: Long, duration: Long)
        fun onTrackChanged(track: JSObject?, index: Int, queueSize: Int)
        fun onPositionUpdated(position: Long, duration: Long)
        fun onQueueUpdated(queue: JSArray, currentIndex: Int)
        fun onError(errorCode: String, errorMessage: String, trackId: String?)
        fun onAudioFocusChanged(focusState: String)
    }

    private val binder = MediaServiceBinder()
    private var mediaSession: MediaSession? = null
    private var player: ExoPlayer? = null
    private var listener: PlaybackEventListener? = null

    private var currentTrackObject: JSObject? = null
    private val queueList = mutableListOf<JSObject>()
    private var currentIndex = 0
    private var repeatMode = "off" // "off", "all", "one"
    private var isShuffle = false

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var progressJob: Job? = null

    private lateinit var audioManager: AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false

    // Headphone disconnect receiver (ACTION_AUDIO_BECOMING_NOISY)
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                pause()
            }
        }
    }
    private var isNoisyReceiverRegistered = false

    inner class MediaServiceBinder : Binder() {
        fun getService(): MusiSurfMediaService = this@MusiSurfMediaService
    }

    override fun onBind(intent: Intent?): IBinder {
        super.onBind(intent)
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        // Build Media3 ExoPlayer with AudioAttributes for Music streaming
        val audioAttributes = Media3AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()

        player = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build().apply {
                addListener(this@MusiSurfMediaService)
            }

        // Initialize MediaSession with Activity launch intent
        val sessionActivityIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        mediaSession = MediaSession.Builder(this, player!!)
            .apply {
                sessionActivityIntent?.let { setSessionActivity(it) }
            }
            .build()

        registerNoisyReceiver()
        startPositionProgressPolling()
    }

    fun setOnPlaybackEventListener(l: PlaybackEventListener) {
        this.listener = l
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MusiSurf Music Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Active background music playback and lockscreen media controls"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun registerNoisyReceiver() {
        if (!isNoisyReceiverRegistered) {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            registerReceiver(noisyReceiver, filter)
            isNoisyReceiverRegistered = true
        }
    }

    private fun unregisterNoisyReceiver() {
        if (isNoisyReceiverRegistered) {
            try { unregisterReceiver(noisyReceiver); } catch (e: Exception) {}
            isNoisyReceiverRegistered = false
        }
    }

    // Audio Focus Management
    private fun requestAudioFocus(): Boolean {
        if (hasAudioFocus) return true
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val playbackAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(playbackAttributes)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener(this)
                .build()
            audioManager.requestAudioFocus(audioFocusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(this)
        }
        hasAudioFocus = false
    }

    override fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                pause()
                listener?.onAudioFocusChanged("loss")
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                pause()
                listener?.onAudioFocusChanged("loss_transient")
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                player?.volume = 0.2f
                listener?.onAudioFocusChanged("loss_transient_can_duck")
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                player?.volume = 1.0f
                listener?.onAudioFocusChanged("gain")
            }
        }
    }

    // =========================================================================
    // PLAYBACK CONTROLS
    // =========================================================================

    fun playTrack(track: JSObject?, startTimeMs: Long = 0) {
        if (track == null || player == null) return
        currentTrackObject = track

        val localUri = track.getString("localFileUri")
        val streamUrl = track.getString("remoteStreamUrl") ?: track.getString("streamUrl") ?: track.getString("audioUrl")

        // Prefer native local file if present and readable off disk, else remote stream URL
        val targetUri = if (!localUri.isNullOrEmpty() && File(Uri.parse(localUri).path ?: "").exists()) {
            Uri.parse(localUri)
        } else if (!streamUrl.isNullOrEmpty()) {
            Uri.parse(streamUrl)
        } else {
            listener?.onError("NO_STREAM_URI", "No playable stream URL available", track.getString("id"))
            return
        }

        val metadata = MediaMetadata.Builder()
            .setTitle(track.getString("title") ?: "MusiSurf Track")
            .setArtist(track.getString("artist") ?: "MusiSurf")
            .setAlbumTitle(track.getString("album") ?: "MusiSurf")
            .setArtworkUri(track.getString("artwork")?.let { Uri.parse(it) })
            .build()

        val mediaItem = MediaItem.Builder()
            .setMediaId(track.getString("id") ?: "")
            .setUri(targetUri)
            .setMediaMetadata(metadata)
            .build()

        if (requestAudioFocus()) {
            player?.setMediaItem(mediaItem)
            player?.prepare()
            if (startTimeMs > 0) {
                player?.seekTo(startTimeMs)
            }
            player?.play()
            listener?.onTrackChanged(track, currentIndex, queueList.size)
        }
    }

    fun pause() {
        player?.pause()
    }

    fun resume() {
        if (requestAudioFocus()) {
            player?.play()
        }
    }

    fun seekTo(positionMs: Long) {
        player?.seekTo(positionMs)
    }

    fun next() {
        if (queueList.isNotEmpty() && currentIndex < queueList.size - 1) {
            currentIndex++
            playTrack(queueList[currentIndex])
        }
    }

    fun previous() {
        if (player != null && player!!.currentPosition > 3000) {
            player?.seekTo(0)
        } else if (currentIndex > 0 && queueList.isNotEmpty()) {
            currentIndex--
            playTrack(queueList[currentIndex])
        } else {
            player?.seekTo(0)
        }
    }

    fun setQueue(queue: JSArray, startIndex: Int = 0) {
        queueList.clear()
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i)
            if (item != null) {
                queueList.add(item)
            }
        }
        currentIndex = startIndex.coerceIn(0, (queueList.size - 1).coerceAtLeast(0))
        listener?.onQueueUpdated(queue, currentIndex)
    }

    fun setShuffle(enabled: Boolean) {
        isShuffle = enabled
        player?.shuffleModeEnabled = enabled
    }

    fun setRepeat(mode: String) {
        repeatMode = mode
        when (mode) {
            "one" -> player?.repeatMode = Player.REPEAT_MODE_ONE
            "all" -> player?.repeatMode = Player.REPEAT_MODE_ALL
            else -> player?.repeatMode = Player.REPEAT_MODE_OFF
        }
    }

    fun setVolume(volume: Float) {
        player?.volume = volume.coerceIn(0.0f, 1.0f)
    }

    fun getCurrentPosition(): Long = player?.currentPosition ?: 0L
    fun getDuration(): Long = player?.duration?.coerceAtLeast(0L) ?: 0L
    fun getCurrentTrack(): JSObject? = currentTrackObject

    fun getPlaybackSnapshot(): JSObject = JSObject().apply {
        put("isPlaying", player?.isPlaying ?: false)
        put("status", if (player?.isPlaying == true) "playing" else "paused")
        put("position", (player?.currentPosition ?: 0L) / 1000.0)
        put("duration", (player?.duration ?: 0L) / 1000.0)
        put("currentTrack", currentTrackObject)
        put("repeatMode", repeatMode)
        put("isShuffle", isShuffle)
        put("activeEngine", "android_native")
    }

    // =========================================================================
    // NATIVE DOWNLOAD PIPELINE (PERSISTENT DIRECT FILE REFERENCE FOR EXOPLAYER)
    // =========================================================================

    fun downloadTrackFile(track: JSObject, callback: (String?, Boolean) -> Unit) {
        serviceScope.launch(Dispatchers.IO) {
            val trackId = track.getString("id") ?: "track_${System.currentTimeMillis()}"
            val downloadUrl = track.getString("remoteStreamUrl") ?: track.getString("streamUrl") ?: track.getString("audioUrl")

            if (downloadUrl.isNullOrEmpty()) {
                withContext(Dispatchers.Main) { callback(null, false) }
                return@launch
            }

            try {
                val dir = File(filesDir, "downloads").apply { if (!exists()) mkdirs() }
                val targetFile = File(dir, "${trackId.replace("[^a-zA-Z0-9_.-]".toRegex(), "_")}.mp3")

                val conn = URL(downloadUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                conn.connect()

                if (conn.responseCode in 200..299) {
                    conn.inputStream.use { input ->
                        FileOutputStream(targetFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    val fileUri = Uri.fromFile(targetFile).toString()
                    withContext(Dispatchers.Main) { callback(fileUri, true) }
                } else {
                    withContext(Dispatchers.Main) { callback(null, false) }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { callback(null, false) }
            }
        }
    }

    fun removeDownloadedFile(trackId: String): Boolean {
        return try {
            val dir = File(filesDir, "downloads")
            val targetFile = File(dir, "${trackId.replace("[^a-zA-Z0-9_.-]".toRegex(), "_")}.mp3")
            if (targetFile.exists()) targetFile.delete() else false
        } catch (e: Exception) {
            false
        }
    }

    fun getDownloadedTracksList(): JSArray = JSArray()

    // =========================================================================
    // EXOPLAYER EVENT LISTENERS
    // =========================================================================

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        val stateStr = when (player?.playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> if (isPlaying) "playing" else "paused"
            Player.STATE_ENDED -> "ended"
            else -> "idle"
        }
        listener?.onPlaybackStateChanged(isPlaying, stateStr, player?.currentPosition ?: 0L, player?.duration ?: 0L)
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        val isPlaying = player?.isPlaying ?: false
        val stateStr = when (playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> if (isPlaying) "playing" else "paused"
            Player.STATE_ENDED -> {
                next()
                "ended"
            }
            else -> "idle"
        }
        listener?.onPlaybackStateChanged(isPlaying, stateStr, player?.currentPosition ?: 0L, player?.duration ?: 0L)
    }

    override fun onPlayerError(error: PlaybackException) {
        listener?.onError(error.errorCodeName, error.message ?: "Playback error", currentTrackObject?.getString("id"))
    }

    private fun startPositionProgressPolling() {
        progressJob?.cancel()
        progressJob = serviceScope.launch {
            while (isActive) {
                if (player?.isPlaying == true) {
                    listener?.onPositionUpdated(player?.currentPosition ?: 0L, player?.duration ?: 0L)
                }
                delay(500)
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        progressJob?.cancel()
        abandonAudioFocus()
        unregisterNoisyReceiver()
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        player = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "musisurf_media_playback"
        const val NOTIFICATION_ID = 1001
    }
}
