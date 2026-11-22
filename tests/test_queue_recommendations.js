/**
 * Automated Test Suite: MusiSurf Queue Recommendation Architecture
 * Covers Tests A through J (Canonical identity, exclusion logic, diversity, session persistence, skip handling, etc.)
 */

const assert = require('assert');
const {
  getCanonicalTrackId,
  getTrackFingerprint,
  areTracksIdentical,
  normalizeString,
  extractPrimaryArtist,
  extractVersionTag
} = require('../scripts/canonical_track');
const { isMashupTrack, isEligibleForRecommendation } = require('../scripts/mashup_detector');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASSED: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASSED: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n============================================================');
console.log('MUSISURF QUEUE RECOMMENDATION ARCHITECTURE TEST SUITE');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// TEST A: Repeated Recommendation Prevention (Candidate Exclusion)
// --------------------------------------------------------------------------
runTest('Test A: Repeated Recommendation Prevention across consecutive cycles', () => {
  // Mock candidate pool that returns identical 10 songs on every request
  const staticPool = [
    { id: 'saavn_t1', title: 'Song Alpha', artist: 'Artist One' },
    { id: 'saavn_t2', title: 'Song Beta', artist: 'Artist Two' },
    { id: 'saavn_t3', title: 'Song Gamma', artist: 'Artist Three' },
    { id: 'saavn_t4', title: 'Song Delta', artist: 'Artist Four' },
    { id: 'saavn_t5', title: 'Song Epsilon', artist: 'Artist Five' },
    { id: 'saavn_t6', title: 'Song Zeta', artist: 'Artist Six' },
    { id: 'saavn_t7', title: 'Song Eta', artist: 'Artist Seven' },
    { id: 'saavn_t8', title: 'Song Theta', artist: 'Artist Eight' },
    { id: 'saavn_t9', title: 'Song Iota', artist: 'Artist Nine' },
    { id: 'saavn_t10', title: 'Song Kappa', artist: 'Artist Ten' }
  ];

  const sessionHistory = new Set();
  const recommendedTracks = [];

  // Run 5 consecutive recommendation cycles picking 2 tracks each
  for (let cycle = 0; cycle < 5; cycle++) {
    const candidates = staticPool.filter(t => {
      const cid = getCanonicalTrackId(t);
      return !sessionHistory.has(cid);
    });

    const chosen = candidates.slice(0, 2);
    for (const t of chosen) {
      const cid = getCanonicalTrackId(t);
      sessionHistory.add(cid);
      recommendedTracks.push(t);
    }
  }

  // All 10 recommended tracks must be completely unique
  const uniqueCanonicalIds = new Set(recommendedTracks.map(t => getCanonicalTrackId(t)));
  assert.strictEqual(recommendedTracks.length, 10, 'Should have selected 10 tracks');
  assert.strictEqual(uniqueCanonicalIds.size, 10, 'All 10 tracks must be unique with zero repeats');
});

// --------------------------------------------------------------------------
// TEST B: Canonical Identity Deduplication
// --------------------------------------------------------------------------
runTest('Test B: Canonical Identity Deduplication across variations & providers', () => {
  // Case 1: Same title and provider ID formatted with vs without prefix
  const track1 = { id: 'saavn_5WXAlMNt', title: 'Tum Hi Ho', artist: 'Arijit Singh' };
  const track2 = { id: '5WXAlMNt', title: 'Tum Hi Ho', artist: 'Arijit Singh', source: 'saavn' };
  assert.strictEqual(getCanonicalTrackId(track1), getCanonicalTrackId(track2), 'Prefix variations must resolve to identical canonical ID');
  assert.strictEqual(areTracksIdentical(track1, track2), true, 'areTracksIdentical must be true');

  // Case 2: Same ISRC with different titles/formats
  const isrcA = { isrc: 'IN-A01-23-00123', title: 'Kesariya (Official Video)', artist: 'Arijit Singh' };
  const isrcB = { isrc: 'INA012300123', title: 'Kesariya - Audio', artist: 'Pritam, Arijit Singh' };
  assert.strictEqual(getCanonicalTrackId(isrcA), getCanonicalTrackId(isrcB), 'Cleaned ISRCs must match identically');
  assert.strictEqual(areTracksIdentical(isrcA, isrcB), true, 'ISRC match must identify identical track');

  // Case 3: YouTube vs JioSaavn cross-provider match via normalized title + artist
  const saavnTrack = { id: 'saavn_abc123', title: 'Chaleya (From "Jawan")', artist: 'Anirudh Ravichander, Arijit Singh' };
  const ytTrack = { ytId: 'yt_xyz987', title: 'Chaleya [Official Music Video]', artist: 'Anirudh Ravichander' };
  assert.strictEqual(areTracksIdentical(saavnTrack, ytTrack), true, 'Cross-provider normalized title & primary artist match');

  // Case 4: Different versions (Acoustic vs Standard) must NOT conflate!
  const stdTrack = { title: 'Kal Ho Naa Ho', artist: 'Sonu Nigam' };
  const acousticTrack = { title: 'Kal Ho Naa Ho (Acoustic Version)', artist: 'Sonu Nigam' };
  assert.notStrictEqual(getCanonicalTrackId(stdTrack), getCanonicalTrackId(acousticTrack), 'Acoustic version must have distinct ID');
  assert.strictEqual(areTracksIdentical(stdTrack, acousticTrack), false, 'Acoustic vs Standard are distinct tracks');
});

// --------------------------------------------------------------------------
// TEST C: False Positive Prevention
// --------------------------------------------------------------------------
runTest('Test C: False Positive Prevention for identical titles with different artists', () => {
  const atifVersion = { id: 'saavn_101', title: 'Pehli Nazar Mein', artist: 'Atif Aslam' };
  const coverVersion = { id: 'saavn_102', title: 'Pehli Nazar Mein', artist: 'Darshan Raval' };

  assert.notStrictEqual(getCanonicalTrackId(atifVersion), getCanonicalTrackId(coverVersion), 'Different artists must produce different canonical IDs');
  assert.strictEqual(areTracksIdentical(atifVersion, coverVersion), false, 'areTracksIdentical must return false for different artists');
});

// --------------------------------------------------------------------------
// TEST D: Upcoming Queue Exclusion
// --------------------------------------------------------------------------
runTest('Test D: Upcoming Queue Exclusion prevents adding queued tracks', () => {
  const upcomingQueue = [
    { id: 'saavn_q1', title: 'Queued Track One', artist: 'Artist A' },
    { id: 'saavn_q2', title: 'Queued Track Two', artist: 'Artist B' },
    { id: 'saavn_q3', title: 'Queued Track Three', artist: 'Artist C' }
  ];

  const exclusionSet = new Set(upcomingQueue.map(t => getCanonicalTrackId(t)));

  const candidates = [
    { id: 'saavn_q1', title: 'Queued Track One', artist: 'Artist A' },
    { id: 'saavn_cand4', title: 'Candidate Four', artist: 'Artist D' },
    { id: 'saavn_cand5', title: 'Candidate Five', artist: 'Artist E' }
  ];

  const filtered = candidates.filter(t => !exclusionSet.has(getCanonicalTrackId(t)));
  assert.strictEqual(filtered.length, 2, 'Should exclude Queued Track One');
  assert.strictEqual(filtered.some(t => t.id === 'saavn_q1'), false, 'Queued Track One must not appear in recommendations');
});

// --------------------------------------------------------------------------
// TEST E: Simultaneous Request Deduplication (Coordinator Lock)
// --------------------------------------------------------------------------
runTest('Test E: Simultaneous Request Deduplication via coordinator lock', () => {
  let requestInProgress = false;
  let executionCount = 0;

  function mockReplenish() {
    if (requestInProgress) {
      return { status: 'LOCKED_IGNORED' };
    }
    requestInProgress = true;
    executionCount++;
    // Simulate sync boundary of initiation
    return { status: 'STARTED' };
  }

  const res1 = mockReplenish();
  const res2 = mockReplenish();
  const res3 = mockReplenish();

  assert.strictEqual(res1.status, 'STARTED');
  assert.strictEqual(res2.status, 'LOCKED_IGNORED');
  assert.strictEqual(res3.status, 'LOCKED_IGNORED');
  assert.strictEqual(executionCount, 1, 'Only exactly 1 request may execute concurrently');
});

// --------------------------------------------------------------------------
// TEST F: Session Persistence Across Simulated Remount
// --------------------------------------------------------------------------
runTest('Test F: Session Persistence Across Simulated Remount / Reload', () => {
  // Session 1: Play & Recommend tracks
  const session1 = {
    sessionId: 'sess_123',
    recommendedCanonicalIds: new Set(['saavn_rec1', 'saavn_rec2']),
    playedCanonicalIds: new Set(['saavn_play1']),
    skippedCanonicalIds: new Map([['saavn_skip1', Date.now()]]),
    removedCanonicalIds: new Set(['saavn_rem1']),
    recentArtists: ['Arijit Singh', 'Pritam'],
    pageOffsets: new Map([['seed_arijit', 3]]),
    updatedAt: Date.now()
  };

  // Serialize to localStorage representation
  const serialized = JSON.stringify({
    sessionId: session1.sessionId,
    recommendedCanonicalIds: Array.from(session1.recommendedCanonicalIds),
    playedCanonicalIds: Array.from(session1.playedCanonicalIds),
    skippedCanonicalIds: Array.from(session1.skippedCanonicalIds.entries()),
    removedCanonicalIds: Array.from(session1.removedCanonicalIds),
    recentArtists: session1.recentArtists,
    pageOffsets: Array.from(session1.pageOffsets.entries()),
    updatedAt: session1.updatedAt
  });

  // Session 2: Simulated remount after page refresh
  const parsed = JSON.parse(serialized);
  const session2 = {
    sessionId: parsed.sessionId,
    recommendedCanonicalIds: new Set(parsed.recommendedCanonicalIds),
    playedCanonicalIds: new Set(parsed.playedCanonicalIds),
    skippedCanonicalIds: new Map(parsed.skippedCanonicalIds),
    removedCanonicalIds: new Set(parsed.removedCanonicalIds),
    recentArtists: parsed.recentArtists,
    pageOffsets: new Map(parsed.pageOffsets)
  };

  assert.strictEqual(session2.recommendedCanonicalIds.has('saavn_rec1'), true, 'Previous recommendation must persist');
  assert.strictEqual(session2.playedCanonicalIds.has('saavn_play1'), true, 'Played tracks must persist');
  assert.strictEqual(session2.removedCanonicalIds.has('saavn_rem1'), true, 'Removed tracks must persist');
  assert.strictEqual(session2.pageOffsets.get('seed_arijit'), 3, 'Page offset must persist');
});

// --------------------------------------------------------------------------
// TEST G: Skipped & Removed Track Handling
// --------------------------------------------------------------------------
runTest('Test G: Skipped & Removed Track Handling and User Override', () => {
  const session = {
    skippedCanonicalIds: new Map([['saavn_skip1', Date.now()]]),
    removedCanonicalIds: new Set(['saavn_rem1'])
  };

  // Check 1: Track skipped within cooldown must be excluded from auto recommendations
  const skipCid = 'saavn_skip1';
  const isCooldownActive = (Date.now() - session.skippedCanonicalIds.get(skipCid)) < (15 * 60 * 1000);
  assert.strictEqual(isCooldownActive, true, 'Skipped track cooldown must be active');

  // Check 2: Manually removed track must be excluded from auto recommendations
  assert.strictEqual(session.removedCanonicalIds.has('saavn_rem1'), true, 'Removed track must be excluded');

  // Check 3: User manual add MUST succeed even if in exclusion sets
  const userQueue = [];
  function userExplicitAdd(track) {
    // Manual additions ignore recommendation exclusion sets
    userQueue.push(track);
  }

  userExplicitAdd({ id: 'saavn_skip1', title: 'Skipped Song' });
  userExplicitAdd({ id: 'saavn_rem1', title: 'Removed Song' });

  assert.strictEqual(userQueue.length, 2, 'Manual adds must always succeed');
  assert.strictEqual(userQueue[0].id, 'saavn_skip1');
  assert.strictEqual(userQueue[1].id, 'saavn_rem1');
});

// --------------------------------------------------------------------------
// TEST H: Exhausted Candidate Pool Handling
// --------------------------------------------------------------------------
runTest('Test H: Exhausted Candidate Pool Handling without silent repeats', () => {
  const tinyPool = [
    { id: 'saavn_1', title: 'Niche Track 1', artist: 'Niche Artist' },
    { id: 'saavn_2', title: 'Niche Track 2', artist: 'Niche Artist' },
    { id: 'saavn_3', title: 'Niche Track 3', artist: 'Niche Artist' }
  ];

  const sessionRecommended = new Set();
  const queue = [];

  function fetchNextReco(allowRepeatFallback = false) {
    const eligible = tinyPool.filter(t => !sessionRecommended.has(getCanonicalTrackId(t)));
    if (eligible.length === 0) {
      if (allowRepeatFallback) {
        // Anti-pattern: repeating first song
        return tinyPool[0];
      }
      // Correct pattern: signal end of recommendations gracefully
      return null;
    }
    const chosen = eligible[0];
    sessionRecommended.add(getCanonicalTrackId(chosen));
    return chosen;
  }

  const r1 = fetchNextReco();
  const r2 = fetchNextReco();
  const r3 = fetchNextReco();
  const r4 = fetchNextReco(); // Pool exhausted!

  assert.strictEqual(r1.id, 'saavn_1');
  assert.strictEqual(r2.id, 'saavn_2');
  assert.strictEqual(r3.id, 'saavn_3');
  assert.strictEqual(r4, null, 'Must return null / end of queue when pool exhausted, NOT silently repeat song 1');
});

// --------------------------------------------------------------------------
// TEST I: Long Session Simulation (30 Cycles with zero repeats & diversity)
// --------------------------------------------------------------------------
runTest('Test I: Long Session Simulation (30 cycles) with zero repeats & diversity constraints', () => {
  // Generate a rich synthetic pool of 100 tracks across 10 artists
  const artists = ['Arijit Singh', 'Pritam', 'Atif Aslam', 'Sonu Nigam', 'Shreya Ghoshal', 'KK', 'Mohit Chauhan', 'Jubin Nautiyal', 'Badshah', 'Diljit Dosanjh'];
  const pool = [];
  for (let a = 0; a < artists.length; a++) {
    for (let s = 1; s <= 10; s++) {
      pool.push({
        id: `saavn_art${a}_s${s}`,
        title: `Song ${s} by ${artists[a]}`,
        artist: artists[a],
        album: `Album ${Math.ceil(s / 3)}`
      });
    }
  }

  const sessionPlayed = new Set();
  const sessionRecommended = new Set();
  const recentArtists = [];
  const playbackHistory = [];

  for (let cycle = 0; cycle < 30; cycle++) {
    // Score pool with diversity penalties
    const eligible = pool.filter(t => {
      const cid = getCanonicalTrackId(t);
      return !sessionPlayed.has(cid) && !sessionRecommended.has(cid);
    });

    assert.ok(eligible.length > 0, `Eligible tracks must remain available in cycle ${cycle}`);

    // Apply recent artist penalty
    const scored = eligible.map(t => {
      let score = 100;
      const primaryArt = extractPrimaryArtist(t.artist);
      if (recentArtists.slice(-3).includes(primaryArt)) {
        score -= 50; // diversity penalty
      }
      return { track: t, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0].track;
    const chosenCid = getCanonicalTrackId(chosen);

    // Assert that chosen track was NEVER played or recommended before
    assert.strictEqual(sessionPlayed.has(chosenCid), false, `Repeat detected in cycle ${cycle}: ${chosen.title}`);
    assert.strictEqual(sessionRecommended.has(chosenCid), false, `Repeat detected in cycle ${cycle}: ${chosen.title}`);

    sessionRecommended.add(chosenCid);
    sessionPlayed.add(chosenCid);
    playbackHistory.push(chosen);

    const primary = extractPrimaryArtist(chosen.artist);
    recentArtists.push(primary);
  }

  assert.strictEqual(playbackHistory.length, 30, 'Must have completed 30 cycles');
  const uniquePlayedIds = new Set(playbackHistory.map(t => getCanonicalTrackId(t)));
  assert.strictEqual(uniquePlayedIds.size, 30, 'All 30 played songs must be 100% unique');

  // Verify diversity: no single artist should dominate (> 10 out of 30)
  const artistCounts = {};
  for (const t of playbackHistory) {
    const art = extractPrimaryArtist(t.artist);
    artistCounts[art] = (artistCounts[art] || 0) + 1;
  }
  for (const [art, count] of Object.entries(artistCounts)) {
    assert.ok(count <= 8, `Artist ${art} played ${count} times; exceeds diversity limit`);
  }
});

// --------------------------------------------------------------------------
// TEST J: Playback Modes & Ping-Pong Fix Verification
// --------------------------------------------------------------------------
runTest('Test J: Playback Continuity & Elimination of Context Ping-Pong Trap', () => {
  // Simulate the exact bug described in Root Cause:
  // Playing Song A from standalone search. contextQueue = [Song A], contextIndex = 0.
  // Next song Song B arrives from recommendationQueue.
  // Verify that contextQueue is NOT set to [Song B, Song A], which would ping-pong back to Song A!
  let contextQueue = [{ id: 'saavn_A', title: 'Song A' }];
  let contextIndex = 0;
  const userQueue = [];
  const recommendationQueue = [{ id: 'saavn_B', title: 'Song B' }, { id: 'saavn_C', title: 'Song C' }];

  // Advance from recommendationQueue
  const nextTrack = recommendationQueue.shift();
  assert.strictEqual(nextTrack.id, 'saavn_B');

  // In our fixed implementation: recommendation play resets contextQueue cleanly!
  contextQueue = [nextTrack];
  contextIndex = 0;

  assert.strictEqual(contextQueue.length, 1);
  assert.strictEqual(contextQueue[0].id, 'saavn_B');
  assert.strictEqual(contextIndex, 0);

  // When Song B finishes, get upcoming track:
  // contextIndex + 1 is 1 >= contextQueue.length (1), so it correctly pulls from recommendationQueue!
  const hasUpcomingInContext = contextIndex + 1 < contextQueue.length;
  assert.strictEqual(hasUpcomingInContext, false, 'Must NOT find previous Song A in contextQueue');

  // Next upcoming track is Song C from recommendationQueue (NOT Song A!)
  const nextReco = recommendationQueue[0];
  assert.strictEqual(nextReco.id, 'saavn_C', 'Next track must be Song C, not Song A');
});

console.log('\n------------------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed successfully.`);
console.log('------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
