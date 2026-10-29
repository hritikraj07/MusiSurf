# 🌊 MusiSurf — 100% Ad-Free Full-Length Music Streaming

> **Ride the wave of pure music with zero commercial interruptions.** Stream and download millions of full-length songs from across the internet with crystal-clear 320kbps audio, real-time synchronized karaoke lyrics, and dynamic audio visualizers.

---

## ✨ Features

- 🛡️ **100% Ad-Free Streaming**: No audio ads, no video prerolls, no banner commercials, and no sponsorship interruptions.
- ⚡ **Full-Length Song Playback**: Stream the complete duration of any song from the internet—zero 30-second preview restrictions.
- 🎵 **High-Fidelity 320kbps Audio**: Direct AAC/MP4 streaming powered by high-speed content delivery networks with instant byte-range scrubbing.
- 📱 **Mobile Responsive & Installable (PWA)**:
  - Works seamlessly on smartphones, tablets, and desktop displays.
  - Installable as a native app on Android (Chrome) and iOS (Safari) with Progressive Web App (PWA) support.
  - Spotify-inspired mobile bottom navigation bar and full-screen swipeable now-playing screen.
- ⬇️ **Direct Mobile & Desktop Song Downloader**:
  - 1-click download button on every song row, card, and now-playing player bar.
  - Saves full-length, high-quality audio files directly into your device's Downloads folder for offline listening.
- 🎤 **Synchronized Karaoke Lyrics**: Real-time line-by-line synced lyrics powered by `lrclib.net` with interactive click-to-seek.
- 🎛️ **60 FPS Web Audio Visualizer**: Live hardware-accelerated canvas frequency visualizer featuring **Spectrum Bars**, **Neon Wave**, and **Radial Orbit** modes.
- 🔍 **Intelligent Search Engine**: Real-time search across global catalogs with instant Top Result hero cards and genre discovery.
- 💖 **Liked Songs & Custom Playlists**: Save tracks and organize your personal music library permanently (`localStorage`).
- 🎧 **Media Session API**: Complete support for lock-screen controls, notification player, and Bluetooth headphone buttons.
- ⌨️ **Keyboard Shortcuts**: Control playback with Space, Arrow keys, Mute (M), Lyrics (L), Visualizer (V), and Search (/).

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `yarn`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/hritikraj07/MusiSurf.git
   cd MusiSurf
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

4. **Open in your browser**:
   ```
   http://localhost:3000
   ```

---

## 📱 Mobile Installation (PWA)

### Android (Google Chrome / Brave)
1. Open `http://<your-ip>:3000` or deployed URL on your phone.
2. Tap the **"Install App"** button in MusiSurf or open Chrome's menu (`⋮`) and select **"Install app"** or **"Add to Home screen"**.
3. MusiSurf will appear on your home screen with its own icon and launch in full-screen standalone mode without browser bars!

### iOS (Safari)
1. Open MusiSurf in Safari.
2. Tap the **Share** button (`⎋`).
3. Scroll down and tap **"Add to Home Screen"**.

---

## ⌨️ Keyboard Controls

| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause |
| <kbd>Ctrl</kbd> + <kbd>→</kbd> | Next Track |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> | Previous Track |
| <kbd>→</kbd> / <kbd>←</kbd> | Seek +5s / -5s |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume +5% / -5% |
| <kbd>M</kbd> | Mute / Unmute |
| <kbd>L</kbd> | Toggle Synced Lyrics View |
| <kbd>V</kbd> | Toggle Audio Visualizer View |
| <kbd>Q</kbd> | Toggle Play Queue Drawer |
| <kbd>/</kbd> | Focus Global Search Bar |
| <kbd>Esc</kbd> | Close Overlays & Modals |

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Modern Glassmorphism, CSS Custom Properties, Flexbox & Grid), JavaScript (ES6+), Web Audio API, Service Workers (PWA).
- **Backend**: Node.js, Express, Crypto-JS (DES audio stream decryption), CORS, HTTP streaming.
- **Data & Audio Sources**: High-speed CDN Audio, YouTube API fallback, LRCLIB Synced Lyrics API.

---

## 📄 License

This project is licensed under the MIT License.
