/**
 * MusiSurf - Repeat Synchronization & Monochromatic Lyrics Border Beam Test
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
console.log('  Repeat Sync & Monochromatic Border Beam Tests    ');
console.log('====================================================\n');

// 1. Long-length border beam conic gradient
test('Border beam conic gradient covers wide arc >= 240 degrees', () => {
  assert(css.includes('transparent 20deg'), 'Gradient start offset should be around 20deg');
  assert(css.includes('transparent 285deg'), 'Gradient end offset should be around 285deg');
});

// 2. Adaptive geometry
test('Beam and bloom scale to 450% to prevent corner clipping on wide aspect ratios', () => {
  assert(css.includes('width: 450%;'), 'Beam width should be 450%');
  assert(css.includes('height: 450%;'), 'Beam height should be 450%');
});

// 3. Monochromatic color enforcement
test('Border beam uses only primary theme color and matching RGB, without rainbow/multi-color', () => {
  assert(extractorJs.includes('el.style.setProperty(\'--glow-primary\', primaryColor);'));
  assert(extractorJs.includes('el.style.setProperty(\'--glow-secondary\', primaryColor);'));
  assert(extractorJs.includes('el.style.setProperty(\'--glow-tertiary\', primaryColor);'));
  assert(extractorJs.includes('el.style.setProperty(\'--glow-quaternary\', primaryColor);'));
});

// 4. Repeat mode and playlist mode bidirectional sync
test('App.js bidirectionally synchronizes repeatMode and playlistMode', () => {
  assert(appJs.includes('state.playlistMode = \'3\';'), 'Toggle repeat All sets playlistMode 3');
  assert(appJs.includes('state.playlistMode = \'1\';'), 'Toggle repeat Off sets playlistMode 1');
  assert(appJs.includes('state.repeatMode = \'all\';'), 'Cycle playlistMode 3 sets repeatMode all');
  assert(appJs.includes('state.repeatMode = \'off\';'), 'Cycle playlistMode 1 sets repeatMode off');
});

// 5. Website theme colors for playlist buttons
test('Playlist buttons match dark obsidian website theme without cyan or red', () => {
  const shuffleBlock = css.substring(css.indexOf('.playlist-shuffle-btn'), css.indexOf('.playlist-mode-badge'));
  assert(!shuffleBlock.includes('#38bdf8'), 'No cyan #38bdf8 in playlist shuffle button');
  assert(!shuffleBlock.includes('#f43f5e'), 'No red #f43f5e in playlist shuffle button');
  assert(shuffleBlock.includes('rgba(255, 255, 255, 0.12)'), 'Matches website translucent white theme');
});

// 6. Quick picks card height matches previous design
test('Quick picks tile height and artwork are 58px', () => {
  assert(css.includes('height: 58px !important;'), 'Quick pick tile height is 58px');
  assert(css.includes('width: 58px !important;'), 'Quick pick artwork width is 58px');
});

console.log('\n====================================================');
console.log(`Tests Completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================');

if (failed > 0) process.exit(1);
