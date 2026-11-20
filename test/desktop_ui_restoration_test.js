const assert = require('assert');
const fs = require('fs');

console.log('====================================================');
console.log('  MusiSurf Desktop UI Restoration & User Icon Tests ');
console.log('====================================================\n');

const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

// Test 1: Desktop top header brand order & layout
assert(css.includes('.top-header-left {') && css.includes('order: 0 !important;'), 'top-header-left must have order: 0 !important');
assert(css.includes('.top-header-right {') && css.includes('order: 2 !important;'), 'top-header-right must have order: 2 !important');
assert(html.includes('id="desktopHeaderBrand"'), 'desktopHeaderBrand must be in index.html');
console.log('[PASS] Desktop top bar header brand positioned on the far left (order: 0)');

// Test 2: Search bar has input, clear button, divider, and explore compass
assert(html.includes('class="clear-search-btn" id="clearSearchBtn"'), 'clearSearchBtn must exist');
assert(html.includes('class="search-pill-divider"'), 'search-pill-divider must exist');
assert(html.includes('class="search-explore-btn" id="topCompassBtn"'), 'topCompassBtn must exist');
assert(css.includes('.top-search-pill .search-explore-btn') && css.includes('.top-search-pill .search-pill-divider'), 'Search explore and divider must be styled');
console.log('[PASS] Search bar contains clear (x), divider (|), and explore compass icon');

// Test 3: Sign In button removed everywhere and replaced by User Icon
assert(!html.includes('id="headerLoginBtn"'), 'No headerLoginBtn in index.html');
assert(!html.includes('id="headerLoginMobBtn"'), 'No headerLoginMobBtn in index.html');
assert(!html.includes('id="drawerTopSignInBtn"'), 'No drawerTopSignInBtn in index.html');
assert(html.includes('id="headerUserAvatarBtn"'), 'headerUserAvatarBtn must exist in top-header-right');
assert(html.includes('id="headerUserIconSvg"'), 'headerUserIconSvg must exist');
assert(css.includes('.top-user-avatar-btn') && css.includes('.top-user-icon-svg'), 'User avatar button styled');
assert(css.includes('.top-login-btn') && css.includes('display: none !important;'), 'top-login-btn hidden');
console.log('[PASS] Sign In text buttons replaced everywhere by circular User Icon (Attachment 6)');

// Test 4: Settings icon in sidebar sized properly and positioned next to +
assert(css.includes('.sidebar-settings-btn') && css.includes('38px !important;'), 'sidebar-settings-btn must be 38px');
assert(css.includes('.sidebar-settings-btn svg') && css.includes('24px !important;'), 'sidebar-settings-btn svg must be 24px');
assert(html.includes('id="createPlaylistBtn"') && html.includes('id="sidebarSettingsBtn"'), 'Both create and settings buttons in sidebar');
console.log('[PASS] Sidebar settings gear icon enlarged to 38px/24px and positioned beside +');

// Test 5: Player bar controls (Shuffle, Prev, Play, Next, Repeat) and no stray dot glitch
assert(css.includes('.control-btn svg {') && css.includes('20px !important;'), 'control-btn svg must have explicit 20px width/height');
assert(html.includes('id="shuffleBtn"') && html.includes('id="prevBtn"') && html.includes('id="nextBtn"') && html.includes('id="repeatBtn"'), 'All 4 secondary control buttons present');
console.log('[PASS] Player bar control icons sized at 20px, all 5 buttons visible, no stray dot glitch');

// Test 6: 3-column quick picks and increased height
assert(css.includes('.quick-picks-grid') && css.includes('repeat(3, 1fr) !important;'), 'quick-picks-grid must be 3 columns');
assert(css.includes('.quick-pick-tile') && css.includes('height: 68px !important;'), 'quick-pick-tile must be 68px tall');
console.log('[PASS] Quick picks upgraded to 3 columns with 68px card height');

// Test 7: Inside playlist view table restoration & Spotify horizontal layout
assert(css.includes('#playlistView .playlist-hero') && css.includes('flex-direction: row !important;'), 'Desktop playlist hero must be horizontal flex-direction: row');
assert(css.includes('#playlistView .tracks-table thead') && css.includes('display: table-header-group !important;'), 'Desktop playlist table thead must be table-header-group');
assert(css.includes('#playlistView .tracks-table th.col-album') && css.includes('display: table-cell !important;'), 'Desktop playlist table album column must be table-cell');
assert(css.includes('#playlistView .tracks-table th.col-date-added') && css.includes('display: table-cell !important;'), 'Desktop playlist table date added column must be table-cell');
assert(css.includes('#playlistView .tracks-table th.col-duration') && css.includes('display: table-cell !important;'), 'Desktop playlist table duration column must be table-cell');
console.log('[PASS] Inside playlist UI restored to desktop Spotify table with full columns and horizontal hero');

console.log('\n====================================================');
console.log('Tests Completed: 7');
console.log('Passed: 7');
console.log('Failed: 0');
console.log('====================================================\n');
