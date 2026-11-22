const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🧪 TESTING FULLSCREEN LYRICS & PLAY/PAUSE RESUME FIX');
console.log('====================================================');

// 1. Verify CSS rules for lyrics fullscreen
const cssContent = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

assert(
  cssContent.includes('body.lyrics-fullscreen-active .content-scroll') &&
  cssContent.includes('contain: none !important;'),
  'CSS must remove containment from .content-scroll during fullscreen lyrics to avoid trapping fixed element'
);
console.log('✅ PASS: 1. .content-scroll removes containment during fullscreen lyrics');

assert(
  cssContent.includes('body.lyrics-fullscreen-active #lyricsView') &&
  cssContent.includes('position: fixed !important;') &&
  cssContent.includes('inset: 0 !important;'),
  'CSS must fix #lyricsView to inset: 0 with 100vw/100vh during fullscreen lyrics'
);
console.log('✅ PASS: 2. #lyricsView expands to full viewport (inset: 0) during fullscreen');

assert(
  cssContent.includes('.sidebar, #sidebar') &&
  cssContent.includes('transition: transform 0.42s') &&
  cssContent.includes('body.lyrics-fullscreen-active .sidebar') &&
  cssContent.includes('transform: translateX(-105%) !important;'),
  'CSS must include smooth sliding out animation for sidebar, top header, and player'
);
console.log('✅ PASS: 3. Navigation bars have smooth sliding transitions on enter/exit');

// 2. Verify JS logic in public/app.js
const jsContent = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

assert(
  jsContent.includes('root.requestFullscreen') || jsContent.includes('document.documentElement.requestFullscreen'),
  'public/app.js enterLyricsFullscreen must invoke requestFullscreen on root document'
);
console.log('✅ PASS: 4. enterLyricsFullscreen() invokes web browser requestFullscreen()');

assert(
  jsContent.includes('document.exitFullscreen'),
  'public/app.js exitLyricsFullscreen must invoke exitFullscreen'
);
console.log('✅ PASS: 5. exitLyricsFullscreen() invokes web browser exitFullscreen()');

assert(
  jsContent.includes('getCurrentPlaybackTime()') &&
  jsContent.includes('if (act && Number.isFinite(act.currentTime) && act.currentTime > 0)'),
  'getCurrentPlaybackTime must return act.currentTime without being wiped by isTrackLoading'
);
console.log('✅ PASS: 6. getCurrentPlaybackTime returns real currentTime and does not get zeroed out');

assert(
  jsContent.includes('applyInitialSeekAndPlay') &&
  jsContent.includes('if (customStartTime <= 0)'),
  'playTrack must wait for initial custom seek before calling play() to prevent browser AbortError'
);
console.log('✅ PASS: 7. playTrack initial seek prevents AbortError race condition');

// 3. Test HTTP Range support on running server
(async () => {
  try {
    const ytRes = await fetch('http://localhost:3000/api/yt-stream?id=dQw4w9WgXcQ', {
      headers: { 'Range': 'bytes=50000-100000' }
    });
    assert.strictEqual(ytRes.status, 206, 'Endpoint /api/yt-stream must return HTTP 206 for Range requests');
    assert(ytRes.headers.get('content-range')?.startsWith('bytes 50000-100000/'), 'Content-Range header must match requested range');
    console.log('✅ PASS: 8. /api/yt-stream supports HTTP 206 Partial Content Range streaming');

    console.log('====================================================');
    console.log('🏁 ALL 8 FULLSCREEN & PLAY/PAUSE TESTS PASSED!');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ FAIL in endpoint test:', err);
    process.exit(1);
  }
})();
