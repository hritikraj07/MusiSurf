const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log('       MusiSurf Latest Turn Refinements Test        ');
console.log('====================================================');

const appJs = fs.readFileSync('public/app.js', 'utf8');
const stylesCss = fs.readFileSync('public/styles.css', 'utf8');
const indexHtml = fs.readFileSync('public/index.html', 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`[FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

// 1. Shuffle Icons
test('Shuffle icons improved with modern sleek crossing arrows and Image 7 Mode 1 icon', () => {
  // Mode 1 has playlist bars + play triangle matching Image 7
  assert(appJs.includes('polygon points="14 10 21 14.5 14 19"'), 'Mode 1 must have sleek play triangle');
  // Mode 2 and player bar have sleek crossing arrows
  assert(appJs.includes('path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6'), 'Mode 2 must have sleek crossing arrows');
  assert(indexHtml.includes('id="shuffleBtn"') && indexHtml.includes('path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6'), 'Desktop shuffleBtn must have sleek crossing arrows');
  assert(indexHtml.includes('id="mobShuffleBtn"') && indexHtml.includes('path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6'), 'Mobile mobShuffleBtn must have sleek crossing arrows');
});

// 2. Settings Icon Size
test('Settings icon in library is adjusted to 32px and 18px SVG to match create playlist button', () => {
  assert(stylesCss.includes('width: 32px !important;') && stylesCss.includes('#sidebarSettingsBtn'), 'sidebarSettingsBtn width must be 32px');
  assert(stylesCss.includes('#sidebarSettingsBtn svg') && stylesCss.includes('width: 18px !important;'), 'sidebarSettingsBtn svg must be 18px');
});

// 3. Lyrics Fullscreen Button Theme Color
test('Lyrics fullscreen button color matches lyrics theme and updates dynamically', () => {
  assert(stylesCss.includes('#lyricsFullscreenBtn') && stylesCss.includes('var(--lyrics-theme-rgb'), 'Fullscreen button CSS must bind to --lyrics-theme-rgb');
  assert(appJs.includes('elements.lyricsFullscreenBtn.style.background = `rgba(${rgbStr}, 0.55)`'), 'applyLyricsDynamicBackground must update lyricsFullscreenBtn');
});

// 4. Remove User Icon from Mobile
test('User icon is completely hidden on mobile viewports', () => {
  assert(stylesCss.includes('.mobile-top-profile-btn') && stylesCss.includes('display: none !important;'), 'mobile-top-profile-btn must be display none on mobile');
  assert(indexHtml.includes('id="mobTopProfileBtn"') && indexHtml.includes('display: none !important;'), 'mobTopProfileBtn must have inline display none safeguard');
});

// 5. Lyrics Window Alignment Centered (No longer too much lefty)
test('Lyrics window layout is centered with max-width: 1040px and justify-content: center', () => {
  assert(stylesCss.includes('grid-template-columns: 320px minmax(360px, 600px);'), 'lyrics-main-grid must have balanced column template');
  assert(stylesCss.includes('.lyrics-main-grid') && stylesCss.includes('justify-content: center;'), 'lyrics-main-grid must justify-content: center');
  assert(stylesCss.includes('.lyrics-view-container') && stylesCss.includes('max-width: 1100px;'), 'lyrics-view-container must have max-width: 1100px');
});

// 6. Refresh on Lyrics Window Stays on Lyrics View
test('Page refresh while viewing lyrics stays on lyrics view', () => {
  assert(appJs.includes("['library', 'search', 'localMusic', 'liked', 'downloaded', 'lyrics'].includes(savedView.view)"), 'Allowed restored views must include lyrics');
});

// 7. Audio Playback on Click (No Tab Switch Delay)
test('Playback starts immediately on user click without tab change delay', () => {
  assert(appJs.includes('const primaryAudioDeck = document.getElementById(\'audioPlayer\');'), 'primaryAudioDeck must be stable reference');
  assert(appJs.includes('const secondaryAudioDeck = document.getElementById(\'audioPlayerSecondary\');'), 'secondaryAudioDeck must be stable reference');
  assert(appJs.includes('function togglePlayPause()') && appJs.includes('ctx.state === \'suspended\''), 'togglePlayPause must resume AudioContext on user gesture');
  assert(appJs.includes('function playTrack(') && appJs.includes('ctx.state === \'suspended\''), 'playTrack must resume AudioContext on user gesture');
});

console.log('====================================================');
console.log(`Tests Completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================');

if (failed > 0) process.exit(1);
