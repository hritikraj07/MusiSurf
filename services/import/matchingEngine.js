/**
 * MusiSurf Song Matching Engine
 * Accurately matches external playlist tracks to canonical, playable MusiSurf catalog items.
 * Enforces version discrimination (remix, acoustic, live, slowed, etc.),
 * duration proximity, artist alignment, and multi-tier confidence scoring.
 */

// In-memory cache for search queries during an import session
const candidateSearchCache = new Map();

/**
 * Normalizes text for comparison: lowercases, removes diacritics, strips punctuation.
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ') // replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts version identifiers from a song title.
 */
function detectVersion(title) {
  const norm = (title || '').toLowerCase();
  const versions = [];

  if (norm.includes('remix') || norm.includes('club mix') || norm.includes('dj mix') || norm.includes('dance mix')) {
    versions.push('remix');
  }
  if (norm.includes('acoustic') || norm.includes('unplugged') || norm.includes('stripped')) {
    versions.push('acoustic');
  }
  if (norm.includes('live') || norm.includes('concert') || norm.includes('live at') || norm.includes('live in')) {
    versions.push('live');
  }
  if (norm.includes('slowed') || norm.includes('slowed + reverb') || norm.includes('slowed and reverb')) {
    versions.push('slowed');
  }
  if (norm.includes('sped up') || norm.includes('speed up') || norm.includes('nightcore') || norm.includes('fast version')) {
    versions.push('sped_up');
  }
  if (norm.includes('cover') || norm.includes('tribute') || norm.includes('rendered by')) {
    versions.push('cover');
  }
  if (norm.includes('instrumental') || norm.includes('karaoke') || norm.includes('backing track')) {
    versions.push('instrumental');
  }
  if (norm.includes('radio edit') || norm.includes('clean version')) {
    versions.push('radio_edit');
  }
  if (norm.includes('extended') || norm.includes('extended mix') || norm.includes('original mix')) {
    versions.push('extended');
  }

  return versions.length > 0 ? versions : ['original'];
}

/**
 * Strips bracketed metadata, movie tags, and featuring artists to get the core song title.
 */
function extractCoreTitle(rawTitle) {
  if (!rawTitle) return '';
  let core = rawTitle;

  // Remove bracketed visualizer/official tags
  core = core.replace(/\[(official|video|music video|lyric video|audio|hd|4k)[^\]]*\]/gi, '');
  core = core.replace(/\((official|video|music video|lyric video|audio|hd|4k)[^)]*\)/gi, '');

  // Remove (From "Movie") Bollywood tags
  core = core.replace(/\(From\s+["'][^"']+["']\)/gi, '');
  core = core.replace(/\[From\s+["'][^"']+["']\]/gi, '');

  // Remove (feat. / ft. ...)
  core = core.replace(/\((feat\.|ft\.|featuring|with)[^)]*\)/gi, '');
  core = core.replace(/\[(feat\.|ft\.|featuring|with)[^\]]*\]/gi, '');

  return core.trim();
}

/**
 * Extracts primary artist and secondary artists list.
 */
function extractArtists(artistStr) {
  if (!artistStr) return { primary: '', all: [] };
  const split = artistStr
    .split(/[,&/|]|(?:\s+and\s+)|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+/i)
    .map(a => a.trim())
    .filter(Boolean);

  return {
    primary: split[0] || '',
    all: split
  };
}

/**
 * Calculates Token Similarity (Jaccard Index) between two normalized strings.
 */
function tokenSimilarity(strA, strB) {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const tokensA = new Set(normA.split(/\s+/).filter(Boolean));
  const tokensB = new Set(normB.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  tokensA.forEach(t => {
    if (tokensB.has(t)) intersection++;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Scores candidate track against target external track metadata.
 * Returns match score from 0.0 to 1.0.
 */
function scoreCandidate(externalTrack, candidate) {
  // 1. Exact ISRC Match -> Instant 100% Match
  if (externalTrack.isrc && candidate.isrc && externalTrack.isrc.trim().toLowerCase() === candidate.isrc.trim().toLowerCase()) {
    return 1.0;
  }

  const extTitleNorm = normalizeText(extractCoreTitle(externalTrack.title));
  const candTitleNorm = normalizeText(extractCoreTitle(candidate.title));

  const extArtists = extractArtists(externalTrack.artist);
  const candArtists = extractArtists(candidate.artist);

  const extPrimaryNorm = normalizeText(extArtists.primary);
  const candPrimaryNorm = normalizeText(candArtists.primary);

  // 2. Title similarity
  const titleSim = tokenSimilarity(extTitleNorm, candTitleNorm);
  if (titleSim < 0.25) {
    // Title mismatch is fatal
    return 0.1;
  }

  // 3. Artist similarity
  let artistSim = tokenSimilarity(externalTrack.artist, candidate.artist);
  // Give extra credit if primary artist matches exactly
  if (extPrimaryNorm && candPrimaryNorm && (extPrimaryNorm === candPrimaryNorm || extPrimaryNorm.includes(candPrimaryNorm) || candPrimaryNorm.includes(extPrimaryNorm))) {
    artistSim = Math.max(artistSim, 0.95);
  }

  // Fatal artist mismatch: If both have primary artists and they do not match at all
  if (extPrimaryNorm && candPrimaryNorm && artistSim < 0.20) {
    // Hard reject candidate with completely different artist (e.g. Tuu by Darshan Raval vs Harrdy Sandhu)
    return Math.min(0.35, titleSim * 0.35);
  }

  // 4. Version compatibility
  const extVersions = detectVersion(externalTrack.title);
  const candVersions = detectVersion(candidate.title);

  let versionScore = 0.0;
  const versionMismatch = extVersions.some(ev => !candVersions.includes(ev)) ||
                          candVersions.some(cv => !extVersions.includes(cv));

  if (!versionMismatch) {
    // Exact version match bonus
    versionScore = 0.15;
  } else {
    // Fatal version conflicts (e.g. remix vs original, acoustic vs original, live vs studio)
    if (
      (extVersions.includes('remix') && !candVersions.includes('remix')) ||
      (!extVersions.includes('remix') && candVersions.includes('remix')) ||
      (extVersions.includes('acoustic') && !candVersions.includes('acoustic')) ||
      (!extVersions.includes('acoustic') && candVersions.includes('acoustic')) ||
      (extVersions.includes('live') && !candVersions.includes('live')) ||
      (!extVersions.includes('live') && candVersions.includes('live')) ||
      (extVersions.includes('slowed') && !candVersions.includes('slowed')) ||
      (extVersions.includes('sped_up') && !candVersions.includes('sped_up')) ||
      (extVersions.includes('instrumental') && !candVersions.includes('instrumental'))
    ) {
      // Severe mismatch penalty for conflicting versions
      return Math.max(0.1, (titleSim * 0.4 + artistSim * 0.3) - 0.35);
    }
  }

  // 5. Duration proximity
  let durationBonus = 0.0;
  if (externalTrack.duration > 0 && candidate.duration > 0) {
    const diffSec = Math.abs(externalTrack.duration - candidate.duration);
    if (diffSec <= 5) {
      durationBonus = 0.10;
    } else if (diffSec <= 15) {
      durationBonus = 0.05;
    } else if (diffSec > 60) {
      durationBonus = -0.15; // large duration divergence penalty
    }
  }

  // 6. Album bonus
  let albumBonus = 0.0;
  if (externalTrack.album && candidate.album) {
    const albumSim = tokenSimilarity(externalTrack.album, candidate.album);
    if (albumSim >= 0.5) albumBonus = 0.05;
  }

  // Calculate composite weighted confidence
  let composite = (titleSim * 0.45) + (artistSim * 0.35) + versionScore + durationBonus + albumBonus;

  // Exact title and exact artist ceiling boost
  if (extTitleNorm === candTitleNorm && artistSim >= 0.90 && !versionMismatch) {
    composite = Math.max(composite, 0.96);
  }

  return Math.min(1.0, Math.max(0.0, composite));
}

/**
 * Searches MusiSurf providers for a given external track.
 */
async function searchCandidatesForTrack(externalTrack, searchSaavnFn, searchYouTubeFn) {
  const cleanTitle = extractCoreTitle(externalTrack.title);
  const primaryArtist = extractArtists(externalTrack.artist).primary;
  const query = `${cleanTitle} ${primaryArtist}`.trim();

  if (!query) return [];

  // Check in-memory cache
  if (candidateSearchCache.has(query)) {
    return candidateSearchCache.get(query);
  }

  let candidates = [];
  try {
    if (typeof searchSaavnFn === 'function') {
      const saavnResults = await searchSaavnFn(query, 6);
      if (Array.isArray(saavnResults)) {
        candidates.push(...saavnResults);
      }
    }

    // If Saavn returned fewer than 2 candidates, also search YouTube
    if (candidates.length < 2 && typeof searchYouTubeFn === 'function') {
      const ytResults = await searchYouTubeFn(query, 5);
      if (Array.isArray(ytResults)) {
        candidates.push(...ytResults);
      }
    }
  } catch (err) {
    console.warn(`[MatchingEngine] Search error for "${query}":`, err.message);
  }

  // Deduplicate candidates by ID
  const seenIds = new Set();
  const uniqueCandidates = candidates.filter(c => {
    if (!c || !c.id || seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  candidateSearchCache.set(query, uniqueCandidates);
  return uniqueCandidates;
}

/**
 * Resolves a single external track to a matched MusiSurf track, review state, or unmatched.
 */
async function matchSingleTrack(externalTrack, searchSaavnFn, searchYouTubeFn) {
  const candidates = await searchCandidatesForTrack(externalTrack, searchSaavnFn, searchYouTubeFn);

  if (!candidates || candidates.length === 0) {
    return {
      source: externalTrack,
      status: 'unmatched', // <Not Found>
      matchedTrack: null,
      confidence: 0,
      candidates: []
    };
  }

  // Score all candidates
  const scoredCandidates = candidates.map(c => ({
    track: c,
    score: scoreCandidate(externalTrack, c)
  }));

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  const bestCandidate = scoredCandidates[0];

  // High confidence threshold: >= 0.82
  if (bestCandidate && bestCandidate.score >= 0.82) {
    return {
      source: externalTrack,
      status: 'matched', // <Matched>
      matchedTrack: bestCandidate.track,
      confidence: Math.round(bestCandidate.score * 100),
      candidates: scoredCandidates.slice(0, 3).map(sc => sc.track)
    };
  }

  // Medium confidence threshold: 0.48 <= score < 0.82
  if (bestCandidate && bestCandidate.score >= 0.48) {
    return {
      source: externalTrack,
      status: 'review', // <Needs Review>
      matchedTrack: bestCandidate.track,
      confidence: Math.round(bestCandidate.score * 100),
      candidates: scoredCandidates.slice(0, 3).map(sc => sc.track)
    };
  }

  // Low confidence: <Not Found>
  return {
    source: externalTrack,
    status: 'unmatched',
    matchedTrack: null,
    confidence: bestCandidate ? Math.round(bestCandidate.score * 100) : 0,
    candidates: scoredCandidates.slice(0, 3).map(sc => sc.track)
  };
}

/**
 * Matches a list of external tracks with controlled batch concurrency (e.g. 5 concurrent searches).
 */
async function matchTrackList(externalTracks, searchSaavnFn, searchYouTubeFn, onProgress = null) {
  const results = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < externalTracks.length; i += BATCH_SIZE) {
    const batch = externalTracks.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(t => matchSingleTrack(t, searchSaavnFn, searchYouTubeFn));
    const batchResults = await Promise.all(batchPromises);

    results.push(...batchResults);

    if (typeof onProgress === 'function') {
      onProgress(results.length, externalTracks.length);
    }
  }

  return results;
}

module.exports = {
  normalizeText,
  detectVersion,
  extractCoreTitle,
  extractArtists,
  tokenSimilarity,
  scoreCandidate,
  matchSingleTrack,
  matchTrackList
};
