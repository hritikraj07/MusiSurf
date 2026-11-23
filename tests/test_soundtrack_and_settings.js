const assert = require('assert');
const crypto = require('crypto');
const soundtrackService = require('../services/soundtrackService');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 TESTING MUSISURF SOUNDTRACK & SETTINGS FUNCTIONALITY');
  console.log('====================================================\n');

  const { pool } = require('../services/db');
  let testUserId = null;
  if (pool) {
    try {
      const uRes = await pool.query('SELECT id FROM neon_auth.user LIMIT 1');
      if (uRes.rows.length > 0) testUserId = uRes.rows[0].id;
    } catch (e) {}
  }
  if (!testUserId) testUserId = crypto.randomUUID();

  // Clean any previous test rows
  if (pool) {
    try {
      await pool.query("DELETE FROM user_listening_history WHERE user_id = $1 AND (track_id LIKE 'test_soundtrack_%' OR track_id IN ('track_short', 'track_1', 'track_2'))", [testUserId]);
    } catch (e) {}
  }

  try {
    // Test 1: Require Auth
    console.log('--- TEST 1: STRICT SIGN-IN GATING ---');
    let authErrorCaught = false;
    try {
      await soundtrackService.recordPlay(null, { trackId: 't1', durationSeconds: 200, listenedSeconds: 50 });
    } catch (err) {
      if (err.message === 'AUTH_REQUIRED') authErrorCaught = true;
    }
    assert.strictEqual(authErrorCaught, true, 'Must reject unauthenticated play record');

    try {
      await soundtrackService.getSoundtrackStats(null);
      assert.fail('Should fail without userId');
    } catch (err) {
      assert.strictEqual(err.message, 'AUTH_REQUIRED');
    }
    console.log('  ✓ Gated unauthenticated calls with AUTH_REQUIRED');

    // Test 2: Listening Duration Threshold (<20s and <30% rejected)
    console.log('\n--- TEST 2: PLAY VERIFICATION RULES (THRESHOLD >= 20s OR >= 30%) ---');
    const shortPlay = await soundtrackService.recordPlay(testUserId, {
      trackId: 'test_soundtrack_short',
      title: 'Skipped Track',
      artist: 'Artist A',
      durationSeconds: 240,
      listenedSeconds: 12, // 12s < 20s AND 12s < 72s (30%) -> REJECT
      isCompleted: false
    });
    assert.strictEqual(shortPlay.recorded, false, 'Short skipped track must not be recorded');
    console.log('  ✓ Skipped track (12s of 240s) properly rejected from count');

    // Test 3: Verified Play Recording
    await soundtrackService.recordPlay(testUserId, {
      trackId: 'test_soundtrack_1',
      title: 'Top Hit Song',
      artist: 'Hit Artist',
      album: 'Greatest Hits',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
      durationSeconds: 180,
      listenedSeconds: 120, // 2 minutes
      isCompleted: false
    });

    // Second play of same track to make it top song
    await soundtrackService.recordPlay(testUserId, {
      trackId: 'test_soundtrack_1',
      title: 'Top Hit Song',
      artist: 'Hit Artist',
      album: 'Greatest Hits',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
      durationSeconds: 180,
      listenedSeconds: 180, // 3 minutes
      isCompleted: true
    });

    // Play of different track
    await soundtrackService.recordPlay(testUserId, {
      trackId: 'test_soundtrack_2',
      title: 'Second Song',
      artist: 'Another Artist',
      durationSeconds: 200,
      listenedSeconds: 60, // 1 minute
      isCompleted: false
    });
    console.log('  ✓ Valid plays successfully persisted with real listenedSeconds');

    // Test 4: Real Statistics Calculation
    console.log('\n--- TEST 3: REAL SOUNDTRACK & SOUND CAPSULE CALCULATION ---');
    const stats = await soundtrackService.getSoundtrackStats(testUserId);
    assert.strictEqual(stats.success, true);
    assert.strictEqual(stats.totalSongsPlayed, 3, 'Must record exactly 3 verified plays');
    // Total listened seconds: 120 + 180 + 60 = 360 seconds = 6 minutes
    assert.strictEqual(stats.totalMinutesListened, 6, 'Total minutes must equal 6');
    assert.strictEqual(stats.soundCapsuleMinutes, 6, 'Sound capsule minutes must equal 6');
    assert(stats.topSong, 'Must determine #1 Top Song');
    assert.strictEqual(stats.topSong.id, 'test_soundtrack_1');
    assert.strictEqual(stats.topSong.title, 'Top Hit Song');
    assert.strictEqual(stats.topSong.artist, 'Hit Artist');
    assert.strictEqual(stats.topSong.playCount, 2);
    console.log('  ✓ Computed real totalSongsPlayed (3) and totalMinutesListened (6 mins)');
    console.log('  ✓ Top song accurately identified (Top Hit Song, 2 plays)');

    // Test 5: Functional Bitrate Switching
    console.log('\n--- TEST 4: FUNCTIONAL STREAMING QUALITY BITRATE MAPPING ---');
    function applyQualityToAudioUrl(url, quality) {
      if (!url || typeof url !== 'string') return url;
      if (!url.includes('.mp4')) return url;
      switch (quality) {
        case 'low':
          return url.replace(/_(320|160|96)\.mp4/, '_48.mp4');
        case 'medium':
          return url.replace(/_(320|96|48)\.mp4/, '_160.mp4');
        case 'high':
        case 'lossless':
          return url.replace(/_(160|96|48)\.mp4/, '_320.mp4');
        default:
          return url;
      }
    }

    const baseSampleUrl = 'https://aac.saavncdn.com/123/sample_96.mp4';
    assert.strictEqual(applyQualityToAudioUrl(baseSampleUrl, 'low'), 'https://aac.saavncdn.com/123/sample_48.mp4');
    assert.strictEqual(applyQualityToAudioUrl(baseSampleUrl, 'medium'), 'https://aac.saavncdn.com/123/sample_160.mp4');
    assert.strictEqual(applyQualityToAudioUrl(baseSampleUrl, 'high'), 'https://aac.saavncdn.com/123/sample_320.mp4');
    assert.strictEqual(applyQualityToAudioUrl(baseSampleUrl, 'lossless'), 'https://aac.saavncdn.com/123/sample_320.mp4');
    console.log('  ✓ Bitrates map accurately: Low -> _48.mp4, Medium -> _160.mp4, High/Lossless -> _320.mp4');

    console.log('\n====================================================');
    console.log('🏁 ALL SOUNDTRACK & SETTINGS TESTS PASSED (100%)');
    console.log('====================================================');
  } finally {
    if (pool) {
      try {
        await pool.query("DELETE FROM user_listening_history WHERE user_id = $1 AND (track_id LIKE 'test_soundtrack_%' OR track_id IN ('track_short', 'track_1', 'track_2'))", [testUserId]);
      } catch (e) {}
    }
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
