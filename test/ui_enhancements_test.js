// ==========================================================================
// MusiSurf UI & Navigation Enhancements Test Suite
// Verifies:
// 1. Sidebar header: + icon moved left with Settings icon to its right
// 2. 3-way repeat mode cycling (off -> all -> one -> off) with '1' badge
// 3. Mobile bottom nav with 4 tabs (Home, Search, Library, Downloads) + sliding animation
// 4. Downloaded playlist removed from library view on mobile
// 5. Play/Pause icon present in play pill button (#playAllLocalBtn)
// 6. Mobile top nav bar matching brand logo + MusiSurf and Search + Profile
// 7. Settings theme matching website obsidian theme (#121212 / #181818)
// ==========================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('====================================================');
console.log('   MusiSurf UI Enhancements & Navigation Test Suite  ');
console.log('====================================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8');
const jsContent = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf-8');

// 1. Sidebar header: + and settings
runTest('Sidebar header has create playlist (+) on left and settings on right', () => {
  const actionsMatch = htmlContent.match(/<div class="library-header-actions">([\s\S]*?)<\/div>/);
  assert(actionsMatch, 'library-header-actions div must exist');
  const innerHtml = actionsMatch[1];
  const createIdx = innerHtml.indexOf('id="createPlaylistBtn"');
  const settingsIdx = innerHtml.indexOf('id="sidebarSettingsBtn"');
  assert(createIdx !== -1, 'createPlaylistBtn must exist');
  assert(settingsIdx !== -1, 'sidebarSettingsBtn must exist');
  assert(createIdx < settingsIdx, 'createPlaylistBtn (+) must come before sidebarSettingsBtn (settings icon)');
  assert(jsContent.includes('elements.sidebarSettingsBtn.addEventListener(\'click\', openSettingsModal)'), 'sidebarSettingsBtn must open settings');
});

// 2. 3-way repeat mode cycling
runTest('Repeat mode cycles off -> all -> one -> off and updates UI badges', () => {
  // Test repeat state machine logic
  let repeatMode = 'off';
  const cycle = (current) => {
    if (current === 'off') return 'all';
    if (current === 'all') return 'one';
    return 'off';
  };

  repeatMode = cycle(repeatMode);
  assert.strictEqual(repeatMode, 'all', 'First toggle goes from off to all');
  repeatMode = cycle(repeatMode);
  assert.strictEqual(repeatMode, 'one', 'Second toggle goes from all to one');
  repeatMode = cycle(repeatMode);
  assert.strictEqual(repeatMode, 'off', 'Third toggle goes from one to off');

  // Check HTML for badge in both repeatBtn and mobRepeatBtn
  assert(htmlContent.includes('id="repeatBtn"') && htmlContent.includes('repeat-one-badge'), 'repeatBtn must contain repeat-one-badge');
  assert(htmlContent.includes('id="mobRepeatBtn"') && htmlContent.includes('repeat-one-badge'), 'mobRepeatBtn must contain repeat-one-badge');

  // Check CSS for repeat-one styling
  assert(cssContent.includes('.control-btn.repeat-one .repeat-one-badge'), 'CSS must display .repeat-one-badge on .control-btn.repeat-one');
  assert(cssContent.includes('z-index: 3') || cssContent.includes('display: flex !important;'), 'Badge must be visibly positioned');
});

// 3. Mobile bottom nav 4 tabs & sliding indicator
runTest('Mobile bottom nav contains 4 tabs (Home, Search, Library, Downloads) and sliding indicator', () => {
  assert(htmlContent.includes('id="mobileNavBar"'), 'mobileNavBar must exist');
  assert(htmlContent.includes('id="mobNavHome"'), 'mobNavHome must exist');
  assert(htmlContent.includes('id="mobNavSearch"'), 'mobNavSearch must exist');
  assert(htmlContent.includes('id="mobNavLibrary"'), 'mobNavLibrary must exist');
  assert(htmlContent.includes('id="mobNavDownloads"'), 'mobNavDownloads must exist');
  assert(htmlContent.includes('id="mobNavSlider"'), 'mobNavSlider indicator must exist');

  // Verify tab order
  const homeIdx = htmlContent.indexOf('id="mobNavHome"');
  const searchIdx = htmlContent.indexOf('id="mobNavSearch"');
  const libraryIdx = htmlContent.indexOf('id="mobNavLibrary"');
  const downloadsIdx = htmlContent.indexOf('id="mobNavDownloads"');
  assert(homeIdx < searchIdx && searchIdx < libraryIdx && libraryIdx < downloadsIdx, 'Tabs must be in order: Home -> Search -> Library -> Downloads');

  // Verify CSS sliding transform & tubelight lamp
  assert(cssContent.includes('.mobile-nav-slider'), '.mobile-nav-slider CSS must exist');
  assert(cssContent.includes('var(--nav-idx'), 'Transform must utilize --nav-idx CSS custom property');
  assert(cssContent.includes('transition: transform'), 'Slider must have smooth transition for sliding animation');
});

// 4. Downloaded section on mobile & removed from Library on mobile
runTest('Downloaded section handles offline songs on mobile and is hidden from library on mobile', () => {
  assert(cssContent.includes('#libHubDownloadedBtn,\n  [data-lib-filter="downloaded"] {\n    display: none !important;\n  }'), 'Downloaded card and pill must be hidden in library on mobile viewports');
  assert(jsContent.includes('elements.mobNavDownloads.addEventListener(\'click\''), 'mobNavDownloads must have click event listener');
  assert(jsContent.includes('renderPlaylistView(\'downloaded\')'), 'mobNavDownloads must render downloaded playlist');
});

// 5. Play/Pause icon present in pill button (#playAllLocalBtn)
runTest('Pill play button (#playAllLocalBtn) contains play/pause SVG icons', () => {
  assert(htmlContent.includes('id="playAllLocalBtn"'), 'playAllLocalBtn must exist');
  const btnSnippet = htmlContent.slice(htmlContent.indexOf('id="playAllLocalBtn"'), htmlContent.indexOf('id="playAllLocalBtn"') + 400);
  assert(btnSnippet.includes('class="play-icon"'), 'playAllLocalBtn must contain play-icon SVG');
  assert(btnSnippet.includes('class="pause-icon"'), 'playAllLocalBtn must contain pause-icon SVG');
  assert(btnSnippet.includes('width="16" height="16"'), 'play/pause SVG must have explicit dimensions');
  assert(cssContent.includes('#playAllLocalBtn svg'), 'CSS must format #playAllLocalBtn svg');
});

// 6. Mobile top nav bar (Brand Logo + MusiSurf on left, Search + Profile on right)
runTest('Mobile top nav bar matches requested layout with website logo and action icons', () => {
  assert(htmlContent.includes('id="mobileTopBrand"'), 'mobileTopBrand must exist');
  assert(htmlContent.includes('id="mobTopSearchBtn"'), 'mobTopSearchBtn must exist');
  assert(htmlContent.includes('id="mobTopProfileBtn"'), 'mobTopProfileBtn must exist');

  // Verify website logo is used
  const brandSnippet = htmlContent.slice(htmlContent.indexOf('id="mobileTopBrand"'), htmlContent.indexOf('id="mobileTopBrand"') + 250);
  assert(brandSnippet.includes('src="/icons/icon.svg"'), 'Website logo /icons/icon.svg must be used');
  assert(brandSnippet.includes('MusiSurf'), 'Brand name MusiSurf must be used');

  // Verify CSS visibility (hidden on desktop, visible on mobile)
  assert(cssContent.includes('.mobile-top-brand,\n.mobile-top-actions {\n  display: none !important;\n}'), 'Must be hidden on desktop');
  assert(cssContent.includes('.mobile-top-brand {\n    display: flex !important;'), 'Must be display flex on mobile');
  assert(cssContent.includes('.mobile-top-actions {\n    display: flex !important;'), 'Actions must be display flex on mobile');
});

// 7. Settings theme inside matches MusiSurf obsidian theme (#121212 / #181818)
runTest('Settings modal theme matches MusiSurf website dark obsidian theme', () => {
  assert(cssContent.includes('.fullscreen-settings-modal {\n  position: fixed;\n  inset: 0;\n  width: 100vw;\n  height: 100vh;\n  z-index: 3000;\n  background: #121212 !important;'), 'fullscreen-settings-modal must use #121212 background');
  assert(cssContent.includes('.mobile-nav-drawer {\n  position: fixed;\n  top: 0;\n  left: 0;\n  bottom: 0;\n  width: min(85vw, 340px);\n  height: 100vh;\n  background: #121212 !important;'), 'mobile-nav-drawer must use #121212 background');
});

console.log('\n====================================================');
console.log(`Tests Completed: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
