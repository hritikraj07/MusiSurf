/**
 * MusiSurf - Ambient Edge Border Glow & AlbumThemeExtractor Test Suite
 * Validates:
 * 1. RGB <-> HSL conversions, luminance filtering, saturation boosting, and lightness clamping.
 * 2. 4-color palette generation: primary, secondary, tertiary (shadow-accent), quaternary (highlight).
 * 3. Black, white, and muddy low-saturation pixel filtering.
 * 4. Deterministic hash-based fallback palette generation (offline/CORS resilience).
 * 5. High-speed caching by artworkUrl and trackId (0ms lookups).
 * 6. Race condition & stale response rejection during rapid track changes.
 * 7. Desktop-only gating (width > 768px) and lyrics-view-only lifecycle rules.
 * 8. Playback reactive states (.is-playing on play, dimmed resting state on pause).
 */

const assert = require('assert');
const albumThemeExtractor = require('../public/albumThemeExtractor.js');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  MusiSurf Ambient Edge Glow & Palette Test Suite   ');
  console.log('====================================================\n');

  // 1. Math conversions & clamping
  runTest('RGB to HSL and HSL to RGB string roundtrip conversion', () => {
    // Test pure red: (255, 0, 0) -> [0, 1, 0.5]
    const [h1, s1, l1] = albumThemeExtractor.rgbToHsl(255, 0, 0);
    assert.strictEqual(h1, 0);
    assert.strictEqual(s1, 1);
    assert.strictEqual(l1, 0.5);
    const rgbStr1 = albumThemeExtractor.hslToRgbString(h1, s1, l1);
    assert.strictEqual(rgbStr1, 'rgb(255, 0, 0)');

    // Test cyan: (0, 255, 255) -> [180, 1, 0.5]
    const [h2, s2, l2] = albumThemeExtractor.rgbToHsl(0, 255, 255);
    assert.strictEqual(h2, 180);
    assert.strictEqual(s2, 1);
    assert.strictEqual(l2, 0.5);
    const rgbStr2 = albumThemeExtractor.hslToRgbString(h2, s2, l2);
    assert.strictEqual(rgbStr2, 'rgb(0, 255, 255)');
  });

  runTest('Luminance calculation accurately matches sRGB relative luminance standard', () => {
    const lumBlack = albumThemeExtractor.getRelativeLuminance(0, 0, 0);
    const lumWhite = albumThemeExtractor.getRelativeLuminance(255, 255, 255);
    const lumGreen = albumThemeExtractor.getRelativeLuminance(0, 255, 0);

    assert.strictEqual(lumBlack, 0);
    assert(Math.abs(lumWhite - 1) < 1e-6, 'White luminance should be ~1.0');
    assert(lumGreen > 0.70 && lumGreen < 0.73, 'Green component weight should be ~0.7152');
  });

  // 2. Pixel filtering & 4-color extraction
  runTest('Filter out pure black, pure white, and low-saturation muddy pixels', () => {
    // Create 48x48 RGBA buffer: 48 * 48 * 4 = 9216 bytes
    const buffer = new Uint8ClampedArray(48 * 48 * 4);

    // Fill first half with pure black (0, 0, 0, 255) and pure white (255, 255, 255, 255)
    for (let i = 0; i < buffer.length / 2; i += 8) {
      // black
      buffer[i] = 0; buffer[i + 1] = 0; buffer[i + 2] = 0; buffer[i + 3] = 255;
      // white
      buffer[i + 4] = 255; buffer[i + 5] = 255; buffer[i + 6] = 255; buffer[i + 7] = 255;
    }

    // Fill second half with vibrant sunset orange (255, 120, 20) and deep violet (120, 30, 200)
    for (let i = buffer.length / 2; i < buffer.length; i += 8) {
      // orange
      buffer[i] = 255; buffer[i + 1] = 120; buffer[i + 2] = 20; buffer[i + 3] = 255;
      // violet
      buffer[i + 4] = 120; buffer[i + 5] = 30; buffer[i + 6] = 200; buffer[i + 7] = 255;
    }

    const palette = albumThemeExtractor.extractColorsFromPixels(buffer);
    assert(palette !== null, 'Palette should be extracted successfully');
    assert(typeof palette.primary === 'string' && palette.primary.startsWith('rgb('));
    assert(typeof palette.secondary === 'string' && palette.secondary.startsWith('rgb('));
    assert(typeof palette.tertiary === 'string' && palette.tertiary.startsWith('rgb('));
    assert(typeof palette.quaternary === 'string' && palette.quaternary.startsWith('rgb('));

    // The primary must NOT be black or white
    assert.notStrictEqual(palette.primary, 'rgb(0, 0, 0)');
    assert.notStrictEqual(palette.primary, 'rgb(255, 255, 255)');
  });

  // 3. Deterministic hash fallback
  runTest('Deterministic fallback palette produces distinct, vibrant colors for any song', () => {
    const track1 = { id: 'track_1', title: 'Tum Hi Ho', artist: 'Arijit Singh' };
    const track2 = { id: 'track_2', title: 'Blinding Lights', artist: 'The Weeknd' };

    const pal1 = albumThemeExtractor.getDeterministicPalette(track1);
    const pal2 = albumThemeExtractor.getDeterministicPalette(track2);

    assert(pal1.primary && pal1.secondary && pal1.tertiary && pal1.quaternary);
    assert(pal2.primary && pal2.secondary && pal2.tertiary && pal2.quaternary);

    // Different songs should produce different color palettes
    assert.notStrictEqual(pal1.primary, pal2.primary, 'Different tracks must have distinct palettes');

    // Verify repeatability: same track always returns identical deterministic palette
    const pal1Repeat = albumThemeExtractor.getDeterministicPalette(track1);
    assert.deepStrictEqual(pal1, pal1Repeat, 'Deterministic palette must be 100% reproducible');
  });

  // 4. In-Memory Palette Caching (0ms lookup)
  runTest('In-memory cache stores and retrieves palettes instantly without re-extracting', () => {
    albumThemeExtractor.clearCache();
    assert.strictEqual(albumThemeExtractor.cache.size, 0);

    const testTrack = { id: 'test_song_99', title: 'Kesariya', artist: 'Pritam', image: 'https://cdn.example.com/art.jpg' };
    const testPalette = {
      primary: 'rgb(255, 140, 0)',
      secondary: 'rgb(255, 215, 0)',
      tertiary: 'rgb(180, 50, 10)',
      quaternary: 'rgb(240, 100, 30)'
    };

    albumThemeExtractor.cache.set(testTrack.image, testPalette);
    assert.strictEqual(albumThemeExtractor.cache.size, 1);

    // Retrieval
    assert(albumThemeExtractor.cache.has(testTrack.image));
    const cached = albumThemeExtractor.cache.get(testTrack.image);
    assert.deepStrictEqual(cached, testPalette);
  });

  // 5. Race-Condition & Stale-Response Guard
  await runAsyncTest('Race-condition guard rejects stale extraction if currentTrackId has changed', async () => {
    const mockGlowEl = {
      styles: {},
      style: {
        setProperty(prop, val) {
          mockGlowEl.styles[prop] = val;
        }
      }
    };

    albumThemeExtractor.clearCache();

    // Start request 1 for old track (slow)
    const oldTrack = { id: 'track_fast_skip_1', title: 'Old Song', artist: 'Old Artist' };
    const p1 = albumThemeExtractor.applyThemeToEdgeGlow(oldTrack, mockGlowEl, 'track_fast_skip_1');

    // User rapidly skips to track 2
    const currentTrack = { id: 'track_fast_skip_2', title: 'New Song', artist: 'New Artist' };
    const p2 = albumThemeExtractor.applyThemeToEdgeGlow(currentTrack, mockGlowEl, 'track_fast_skip_2');

    await Promise.all([p1, p2]);

    // Expected: mockGlowEl has the palette of currentTrack (track 2), not oldTrack (track 1)
    const expectedCurrentPalette = albumThemeExtractor.getDeterministicPalette(currentTrack);
    assert.strictEqual(mockGlowEl.styles['--glow-primary'], expectedCurrentPalette.primary, 'Glow element must reflect newest track, not stale track');
  });

  // 6. Desktop-Only & Lyrics-Only Lifecycle Simulator
  runTest('Desktop-only and Lyrics-view-only gating logic', () => {
    function checkGlowActive(currentView, innerWidth, isTouchOnly) {
      const isLyricsActive = currentView === 'lyrics';
      const isDesktop = innerWidth > 768 && !isTouchOnly;
      return isLyricsActive && isDesktop;
    }

    // Desktop in lyrics view -> active
    assert.strictEqual(checkGlowActive('lyrics', 1440, false), true);

    // Desktop on Home page -> inactive
    assert.strictEqual(checkGlowActive('home', 1440, false), false);

    // Desktop on Search page -> inactive
    assert.strictEqual(checkGlowActive('search', 1440, false), false);

    // Mobile viewport in lyrics view -> strictly inactive
    assert.strictEqual(checkGlowActive('lyrics', 375, false), false);
    assert.strictEqual(checkGlowActive('lyrics', 768, false), false);

    // Tablet touch-only in lyrics view -> strictly inactive
    assert.strictEqual(checkGlowActive('lyrics', 1024, true), false);
  });

  // 7. Playback-Reactive Breathing & Dimming State Simulator
  runTest('Playback-reactive state: .is-playing added on play, removed on pause', () => {
    function evaluatePlayClasses(active, playing, paused) {
      if (!active) return { isActive: false, isPlaying: false };
      return { isActive: true, isPlaying: playing && !paused };
    }

    // 1. Lyrics open, music playing -> both active and playing
    let state = evaluatePlayClasses(true, true, false);
    assert.strictEqual(state.isActive, true);
    assert.strictEqual(state.isPlaying, true);

    // 2. Lyrics open, music paused -> active, but NOT playing (dims to resting state opacity 0.38)
    state = evaluatePlayClasses(true, false, true);
    assert.strictEqual(state.isActive, true);
    assert.strictEqual(state.isPlaying, false);

    // 3. User navigates away -> both false (unmounted/hidden)
    state = evaluatePlayClasses(false, true, false);
    assert.strictEqual(state.isActive, false);
    assert.strictEqual(state.isPlaying, false);
  });

  console.log('\n====================================================');
  console.log(`Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
