/**
 * MusiSurf Canonical Track Identity & Deduplication Engine
 * Provides stable, provider-agnostic track identification and deduplication.
 */

function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[\(\[\{].*?[\)\]\}]/g, '') // strip parenthetical descriptors
    .replace(/[^\p{L}\p{N}\s]/gu, '') // keep unicode letters and numbers
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrimaryArtist(artistStr) {
  if (!artistStr || typeof artistStr !== 'string') return '';
  const first = artistStr.split(/[,&/|]|\bfeat\.?\b|\bft\.?\b/i)[0];
  return normalizeString(first);
}

function extractVersionTag(titleStr) {
  if (!titleStr || typeof titleStr !== 'string') return 'standard';
  const lower = titleStr.toLowerCase();
  if (lower.includes('acoustic')) return 'acoustic';
  if (lower.includes('unplugged')) return 'unplugged';
  if (lower.includes('live')) return 'live';
  if (lower.includes('remix') || lower.includes('mix')) return 'remix';
  if (lower.includes('reprise')) return 'reprise';
  if (lower.includes('lofi') || lower.includes('lo-fi')) return 'lofi';
  if (lower.includes('slowed') || lower.includes('reverb')) return 'slowed_reverb';
  if (lower.includes('cover')) return 'cover';
  if (lower.includes('instrumental')) return 'instrumental';
  return 'standard';
}

function getCanonicalTrackId(track) {
  if (!track || typeof track !== 'object') return '';

  // Priority 1: ISRC (International Standard Recording Code)
  if (track.isrc && typeof track.isrc === 'string') {
    const isrcClean = track.isrc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (isrcClean.length >= 10 && isrcClean.length <= 15) {
      return `isrc_${isrcClean}`;
    }
  }

  // Priority 2: Canonical Provider Track ID
  const rawId = String(track.id || track.trackId || track.originalId || track.ytId || '').trim();
  if (rawId) {
    if (rawId.startsWith('saavn_')) {
      const core = rawId.replace(/^saavn_/, '');
      if (core) return `saavn_${core}`;
    }
    if (rawId.startsWith('yt_')) {
      const core = rawId.replace(/^yt_/, '');
      if (core) return `yt_${core}`;
    }
    if (track.source === 'saavn' || track.hasDirectAudio) {
      return `saavn_${rawId}`;
    }
    if (track.source === 'youtube' || track.ytId) {
      return `yt_${rawId}`;
    }
    // Generic stable id
    if (!rawId.startsWith('fp_') && !rawId.startsWith('id_') && rawId.length >= 4) {
      return `id_${rawId}`;
    }
  }

  // Priority 3: Normalized Fingerprint Fallback (Title + Primary Artist + Version)
  const normTitle = normalizeString(track.title);
  const primaryArtist = extractPrimaryArtist(track.artist);
  const version = extractVersionTag(track.title);

  if (normTitle && primaryArtist) {
    return `fp_${normTitle}__${primaryArtist}__${version}`;
  }
  if (normTitle) {
    return `fp_${normTitle}__unknown__${version}`;
  }

  return rawId ? `id_${rawId}` : '';
}

function getTrackFingerprint(track) {
  if (!track || typeof track !== 'object') return '';
  const normTitle = normalizeString(track.title);
  const primaryArtist = extractPrimaryArtist(track.artist);
  const version = extractVersionTag(track.title);
  return `${normTitle}:::${primaryArtist}:::${version}`;
}

function areTracksIdentical(trackA, trackB) {
  if (!trackA || !trackB) return false;
  if (trackA === trackB) return true;

  const idA = getCanonicalTrackId(trackA);
  const idB = getCanonicalTrackId(trackB);

  // Exact canonical ID match
  if (idA && idB && idA === idB) return true;

  // Cross-provider originalId match
  const origA = String(trackA.originalId || trackA.id || '').replace(/^saavn_/, '');
  const origB = String(trackB.originalId || trackB.id || '').replace(/^saavn_/, '');
  if (origA && origB && origA === origB && origA.length >= 4) return true;

  // Fingerprint match (Title + Primary Artist + Version)
  const fpA = getTrackFingerprint(trackA);
  const fpB = getTrackFingerprint(trackB);
  if (fpA && fpB && fpA === fpB && !fpA.startsWith(':::')) {
    // If versions are different (e.g. acoustic vs standard), they are NOT identical!
    return true;
  }

  return false;
}

module.exports = {
  getCanonicalTrackId,
  getTrackFingerprint,
  areTracksIdentical,
  normalizeString,
  extractPrimaryArtist,
  extractVersionTag
};
