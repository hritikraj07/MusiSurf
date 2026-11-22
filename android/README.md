# MusiSurf — Native Android Architecture & APK Generation Guide

This guide details how MusiSurf's centralized playback architecture integrates with Android Media3 ExoPlayer and outlines the exact steps to compile the application into a production-ready Android APK.

---

## 1. Playback Architecture Overview

```
                      +----------------------------------+
                      |         MusiSurf Web UI          |
                      | (Views, Scrubbers, Lyrics, Cards)|
                      +-----------------+----------------+
                                        |
                         Commands & UI Events
                                        v
                      +----------------------------------+
                      |       PlaybackCoordinator        |
                      |   (Centralized Orchestrator)     |
                      +--------+----------------+--------+
                               |                |
             +-----------------+                +------------------+
             |                                                     |
             v                                                     v
+------------------------+                              +------------------------+
|     WebAudioEngine     |                              | NativeAndroidPlayback  |
| (Dual-Deck HTML5 Audio |                              | (Capacitor Plugin to   |
|   + YouTube Fallback)  |                              |    Media3 ExoPlayer)   |
+------------------------+                              +-----------+------------+
             |                                                      |
      Standard Browser                                       Capacitor Bridge
             |                                                      |
             v                                                      v
      Web AudioContext                                  +------------------------+
                                                        | MusiSurfMediaService   |
                                                        | (MediaSessionService,  |
                                                        | Media3 ExoPlayer,      |
                                                        | Notification & Focus)  |
                                                        +------------------------+
```

### Key Components

1. **`UnifiedTrack` (`public/src/playback/types.d.ts` & `public/src/playback/MusiSurfPlayback.js`)**:
   - Standardized contract for all songs across Saavn, YouTube, local files, and offline downloads.
   - Contains `localFileUri` (`file:///...`) for direct native ExoPlayer disk playback, and `remoteStreamUrl` for streaming.

2. **`PlaybackCoordinator`**:
   - Detects the runtime environment automatically via `Capacitor.isNativePlatform()`.
   - In standard desktop/mobile browsers: uses `WebAudioEngine`.
   - In Android Capacitor APK: activates `NativeAndroidAudioEngine`, silences the web audio element, and delegates all playback and queue state to native Media3 ExoPlayer.
   - Enforces two-way synchronization between Android lockscreen/notification controls and MusiSurf web UI without event ping-pong loops.

3. **`MusiSurfMediaPlugin` (`android/.../MusiSurfMediaPlugin.kt`)**:
   - Capacitor bridge plugin exposing `play`, `pause`, `resume`, `seek`, `next`, `previous`, `setQueue`, `setShuffle`, `setRepeat`, `downloadTrack`, etc.
   - Emits native events (`playbackStateChanged`, `trackChanged`, `playbackPositionUpdate`, `playerError`, `audioFocusChanged`) to the WebView.

4. **`MusiSurfMediaService` (`android/.../MusiSurfMediaService.kt`)**:
   - Extends AndroidX Media3 `MediaSessionService`.
   - Runs `ExoPlayer` in a dedicated foreground service (`foregroundServiceType="mediaPlayback"`).
   - Handles:
     - Background playback with screen locked.
     - Android MediaStyle media notification controls.
     - Audio focus (automatic ducking and pausing on incoming phone calls).
     - Headphone disconnection (`ACTION_AUDIO_BECOMING_NOISY`).
     - Bluetooth car/headset media buttons.

---

## 2. Steps to Generate the Final Android APK

### Prerequisites
- Node.js (v20+ recommended)
- Android Studio Ladybug (2024.2+) or later
- Android SDK (API Level 24 through 34 installed)
- Java Development Kit (JDK 17)

---

### Step 1: Install Capacitor Dependencies
Run in the project root:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

---

### Step 2: Initialize & Sync the Android Project
```bash
npx cap init MusiSurf com.musisurf.app --web-dir public
npx cap add android
npx cap sync android
```

---

### Step 3: Verify Native Service & Plugin Registration
1. Ensure `android/app/src/main/AndroidManifest.xml` includes the permissions and service declared in this directory:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
   <uses-permission android:name="android.permission.WAKE_LOCK" />
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
   ```
2. Copy `MusiSurfMediaPlugin.kt` and `MusiSurfMediaService.kt` into `android/app/src/main/java/com/musisurf/app/media/`.
3. In `MainActivity.kt`, register the plugin:
   ```kotlin
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
   ```

---

### Step 4: Build the Android APK
Open the project in Android Studio or build via command-line:

```bash
# Build Debug APK
cd android
./gradlew assembleDebug

# Output APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

To build a Release APK:
```bash
./gradlew assembleRelease
# Output APK location:
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

---

### Step 5: Test Background & Media3 Controls
1. Install APK on a test device or Android Emulator:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
2. Play any song.
3. Lock the screen: audio continues uninterrupted.
4. Test notification drawer controls: play/pause, next, and previous buttons update both the audio and the in-app UI.
5. Disconnect headphones: audio pauses automatically via `ACTION_AUDIO_BECOMING_NOISY`.
