/**
 * MusiSurf - Latest UI Refinements Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const extractorJs = fs.readFileSync(path.join(__dirname, '../public/albumThemeExtractor.js'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('       MusiSurf Latest Refinements Test Suite       ');
console.log('====================================================\n');

// 1. Mobile Header
test('Mobile header removes extra green-circled button and moves MusiSurf logo to far left', () => {
  assert(css.includes('.mobile-drawer-trigger-btn') && css.includes('display: none !important;'), 'Mobile drawer trigger must be hidden');
  assert(css.includes('.mobile-top-brand') && css.includes('order: 0 !important;'), 'Mobile brand must be order 0 on far left');
});

// 2. Web Profile Icon (Image 1)
test('Web profile button matches Image 1 with clean silhouette and no overlapping U initial', () => {
  assert(html.includes('class="top-user-avatar-btn"'), 'top-user-avatar-btn exists');
  assert(!html.includes('id="headerUserInitial"'), 'headerUserInitial removed from HTML to prevent split/overlapping U shape');
  assert(css.includes('.top-user-initial {') && css.includes('display: none !important;'), 'Initial badge hidden');
});

// 3. Lyrics Fullscreen Button (Bottom-Right of Lyrics Window)
test('Lyrics fullscreen icon button is inside lyrics window at bottom-right corner', () => {
  assert(!html.includes('id="lyricsFullscreenBtn" title="Full screen" aria-label="Full screen" type="button" style="display: none !important;"'), 'Button is no longer hidden by inline style');
  assert(css.includes('.lyrics-fullscreen-btn') && css.includes('bottom: 24px;') && css.includes('right: 28px;'), 'Button positioned at bottom right corner');
});

// 4. Border Outline Color Matches Lyrics Background
test('Border outline matches exact lyrics window background color', () => {
  assert(extractorJs.includes('bgThemeColor || palette.primary'), 'Extractor prioritizes lyrics window background color');
  assert(appJs.includes('glowEl.style.setProperty(\'--lyrics-theme-rgb\', rgbStr);'), 'App sets lyrics-theme-rgb on glow container');
});

// 5. Border Line Height / Modulation Animation
test('CSS includes borderBeamHeightPulse and rotating scale modulation', () => {
  assert(css.includes('@keyframes borderBeamHeightPulse'), 'borderBeamHeightPulse keyframe exists');
  assert(css.includes('rotateBorderBeam') && css.includes('scale('), 'rotateBorderBeam modulates line height/scale');
});

// 6. Inside Playlist Mode 3-Icon Cycling
test('Inside playlist playback button renders 3 distinct icons without long text badge', () => {
  assert(appJs.includes('// Mode 1: Plays playlist in order'), 'Mode 1 in-order icon implemented');
  assert(appJs.includes('// Mode 2: Plays in random order'), 'Mode 2 shuffle icon implemented');
  assert(appJs.includes('// Mode 3: Plays in random order with loop'), 'Mode 3 shuffle & loop icon implemented');
  assert(css.includes('.playlist-mode-badge') && css.includes('display: none !important;'), 'Text badge is hidden in favor of clean icon');
});

// 7. Queue Drawer: Autoplay removed & Only "Recommended" written
test('Queue drawer hides autoplay pill and heading strictly displays "Recommended"', () => {
  assert(html.includes('id="queueAutoplayToggleBtn"') && html.includes('style="display: none !important;"'), 'Queue autoplay toggle is hidden');
  assert(html.includes('<span class="queue-section-heading" id="queueRecommendedHeading">Recommended</span>'), 'Heading is strictly "Recommended"');
  assert(html.includes('id="queueRecoVibePill" style="display: none !important;"'), 'Vibe pill is hidden');
});

console.log('\n====================================================');
console.log(`Tests Completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================');

if (failed > 0) process.exit(1);
