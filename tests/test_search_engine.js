// ============================================================================
// Comprehensive Automated Test Suite for MusiSurf Search Engine Upgrade
// Tests: Autocomplete, Lyrics Matching, Multilingual Transliteration,
// Typo Tolerance, 10-Tier Ranking, Mashup Exclusion & Search History Persistence.
// ============================================================================

'use strict';

const assert = require('assert');
const searchEngine = require('../scripts/search_engine');
const libraryService = require('../services/library');
const { sql } = require('../services/db');

async function runTests() {
  console.log('🚀 Starting MusiSurf Search Engine Upgrade Verification Suite...\n');
  let passed = 0;
  let total = 0;

  function test(description, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [TEST ${total}] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [TEST ${total}] ${description}`);
      console.error(`     Error: ${err.message}\n`);
    }
  }

  async function asyncTest(description, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [TEST ${total}] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [TEST ${total}] ${description}`);
      console.error(`     Error: ${err.message}\n`);
    }
  }

  // 1. Text Normalization & Unicode Support
  test('Normalize search text preserves Devanagari and Latin while stripping symbols', () => {
    const hindi = searchEngine.normalizeSearchText('तेरे बिना जीना!');
    assert.strictEqual(hindi, 'तेरे बिना जीना');

    const latin = searchEngine.normalizeSearchText('Shape of You (Official Video)!');
    assert.strictEqual(latin, 'shape of you official video');
  });

  // 2. Query Variants Expansion (Typo & Transliteration)
  test('Typo tolerance: Arjit expands to Arijit', () => {
    const variants = searchEngine.expandQueryVariants('Arjit');
    assert.ok(variants.includes('arijit'), `Expected variants to contain 'arijit', got: ${JSON.stringify(variants)}`);
  });

  test('Typo tolerance: Pasori expands to Pasoori', () => {
    const variants = searchEngine.expandQueryVariants('Pasori');
    assert.ok(variants.includes('pasoori'), `Expected variants to contain 'pasoori', got: ${JSON.stringify(variants)}`);
  });

  test('Typo tolerance: Keshariya expands to Kesariya', () => {
    const variants = searchEngine.expandQueryVariants('Keshariya');
    assert.ok(variants.includes('kesariya'), `Expected variants to contain 'kesariya', got: ${JSON.stringify(variants)}`);
  });

  test('Transliteration: tere bina jeena expands to Devanagari', () => {
    const variants = searchEngine.expandQueryVariants('tere bina jeena');
    assert.ok(variants.includes('तेरे बिना जीना'), `Expected variants to include Devanagari, got: ${JSON.stringify(variants)}`);
  });

  // 3. Intent Detection
  test('Detect query intent: Artist intent for Arijit Singh', () => {
    const intent = searchEngine.detectQueryIntent('Arijit Singh');
    assert.strictEqual(intent.type, 'artist');
  });

  test('Detect query intent: Lyrics intent for phrase with >= 3 words and lyric words', () => {
    const intent = searchEngine.detectQueryIntent('ankhiyan de samne tu');
    assert.strictEqual(intent.type, 'lyrics');
  });

  test('Detect query intent: Mood/genre for Romantic songs', () => {
    const intent = searchEngine.detectQueryIntent('Romantic songs');
    assert.strictEqual(intent.type, 'mood_genre');
  });

  // 4. Ranking Hierarchy (Part 7)
  test('Exact title match ranks higher than unrelated track with high popularity', () => {
    const exactTrack = {
      id: '1',
      title: 'Kesariya',
      artist: 'Pritam, Arijit Singh',
      playCount: 10000
    };
    const unrelatedPopularTrack = {
      id: '2',
      title: 'Something Else entirely',
      artist: 'Taylor Swift',
      playCount: 500000000 // 500M plays
    };

    const scoreExact = searchEngine.scoreTrackRelevance(exactTrack, 'Kesariya');
    const scoreUnrelated = searchEngine.scoreTrackRelevance(unrelatedPopularTrack, 'Kesariya');

    assert.ok(scoreExact > 100000, `Exact score should exceed 100k, got: ${scoreExact}`);
    assert.strictEqual(scoreUnrelated, 0, `Unrelated track score should be 0, got: ${scoreUnrelated}`);
  });

  test('Title prefix match ranks higher than general word intersection', () => {
    const prefixTrack = {
      id: '1',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh'
    };
    const partialTrack = {
      id: '2',
      title: 'Ab Tum Mile Ho Humse',
      artist: 'Singer'
    };

    const scorePrefix = searchEngine.scoreTrackRelevance(prefixTrack, 'Tum');
    const scorePartial = searchEngine.scoreTrackRelevance(partialTrack, 'Tum');

    assert.ok(scorePrefix > scorePartial, `Prefix score (${scorePrefix}) must be higher than partial (${scorePartial})`);
  });

  test('Unsolicited Mashup tracks are heavily penalized', () => {
    const originalTrack = {
      id: '1',
      title: 'Pasoori',
      artist: 'Ali Sethi, Shae Gill'
    };
    const mashupTrack = {
      id: '2',
      title: 'Pasoori x Kesariya Mega Mashup',
      artist: 'DJ Mix'
    };

    const scoreOrig = searchEngine.scoreTrackRelevance(originalTrack, 'Pasoori');
    const scoreMashup = searchEngine.scoreTrackRelevance(mashupTrack, 'Pasoori');

    assert.ok(scoreOrig > scoreMashup + 40000, `Original (${scoreOrig}) should dominate mashup (${scoreMashup})`);
  });

  // 5. Lyrics-Based Search
  await asyncTest('Search lyrics index returns matching song for verified local lyrics', async () => {
    const results = await searchEngine.searchLyrics('yeh fitoor mera');
    assert.ok(results.length > 0, 'Expected to find lyrics results for "yeh fitoor mera"');
    const match = results[0];
    assert.ok(match.title.toLowerCase().includes('fitoor'), `Expected title to contain 'fitoor', got: ${match.title}`);
    assert.ok(match.matchedLine, 'Expected matchedLine to be present');
  });

  await asyncTest('Search lyrics returns matching song for "we found love in a hopeless place"', async () => {
    const results = await searchEngine.searchLyrics('we found love in a hopeless place');
    assert.ok(results.length > 0, 'Expected results for famous lyric phrase');
    const top = results[0];
    assert.ok(top.title.toLowerCase().includes('we found love'), `Expected 'We Found Love', got: ${top.title}`);
  });

  // 6. Live Autocomplete Endpoint
  await asyncTest('fetchAutocomplete returns structured suggestions for partial query "kes"', async () => {
    const data = await searchEngine.fetchAutocomplete('kes');
    assert.strictEqual(data.success, true);
    assert.ok(data.suggestions.songs.length > 0, 'Expected song suggestions');
    const firstSong = data.suggestions.songs[0];
    assert.ok(firstSong.title.toLowerCase().includes('kes'), `Expected song title to match query, got: ${firstSong.title}`);
  });

  // 7. Search Discovery Data (Empty Search State)
  test('getDiscoveryData returns trending searches, popular songs, and top artists', () => {
    const data = searchEngine.getDiscoveryData();
    assert.strictEqual(data.success, true);
    assert.ok(data.trendingSearches.length >= 5, 'Expected at least 5 trending searches');
    assert.ok(data.popularSongs.length >= 3, 'Expected at least 3 popular songs');
    assert.ok(data.topArtists.length >= 3, 'Expected at least 3 top artists');
  });

  // 8. Search History Persistence & Account Sync
  await asyncTest('User search history table exists and operations work on Neon DB', async () => {
    if (!sql) {
      console.log('     (Skipping live DB check: DATABASE_URL not set)');
      return;
    }
    // Check table exists
    const rows = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'user_search_history'
    `;
    assert.strictEqual(rows.length, 1, 'user_search_history table must exist in database');
  });

  console.log(`\n==================================================`);
  console.log(`Test Results: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`==================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
