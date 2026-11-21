/**
 * Centralized Mashup Detection and Recommendation Eligibility Engine for MusiSurf
 * 
 * Enforces strict exclusion of mashup tracks from automatic smart recommendations,
 * recommendation queues, and recommendation caches, while strictly preserving
 * official remixes, live recordings, acoustic versions, and album mixes.
 */

// Normalized text cleaner
function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Determines whether a track is a mashup.
 * Inspects title, artist, album, description, and available metadata.
 * 
 * @param {Object} track
 * @returns {{ isMashup: boolean, reason: string | null }}
 */
function isMashupTrack(track) {
  if (!track) return { isMashup: false, reason: null };

  const rawTitle = track.title || '';
  const rawArtist = track.artist || track.singers || '';
  const rawAlbum = track.album || '';
  const rawDesc = track.description || '';

  const title = normalizeText(rawTitle);
  const artist = normalizeText(rawArtist);
  const album = normalizeText(rawAlbum);
  const desc = normalizeText(rawDesc);

  const combined = `${title} ${artist} ${album} ${desc}`;

  // 1. Direct Mashup Keyword Patterns (Title, Album, Description)
  // Handles: "mashup", "mash-up", "mash up", "mash_up", "mashups", "dj mashup", "song mashup"
  const explicitMashupRegex = /\b(dj\s+)?mash[\s\-_]*up(s)?\b/i;
  if (explicitMashupRegex.test(title)) {
    return { isMashup: true, reason: 'Explicit mashup indicator in title' };
  }
  if (explicitMashupRegex.test(album)) {
    return { isMashup: true, reason: 'Explicit mashup indicator in album' };
  }
  if (explicitMashupRegex.test(artist)) {
    return { isMashup: true, reason: 'Mashup creator detected in artist metadata' };
  }

  // 2. Specific multi-song mashup phrasing
  // e.g. "mashup mix", "mashup edit", "mashup version", "mashup compilation", "mashup medley"
  const mashupPhrasesRegex = /\bmash[\s\-_]*up\s+(mix|version|edit|compilation|medley|cover|session|special)\b/i;
  if (mashupPhrasesRegex.test(combined)) {
    return { isMashup: true, reason: 'Mashup phrase match' };
  }

  // 3. Multi-track collision title patterns (e.g., "Song A x Song B", "Song A vs Song B")
  const vsCollisionRegex = /\b[\w\s]{2,}\s+vs\.?\s+[\w\s]{2,}/i;
  if (vsCollisionRegex.test(title)) {
    return { isMashup: true, reason: 'Song vs Song mashup collision' };
  }

  const multiSongCollisionRegex = /([\w\s]{2,})\s+(x|vs\.?|x\s+feat\.?)\s+([\w\s]{2,})\s+[\(\[](.*?mash[\s\-_]*up.*?)[\]\)]/i;
  if (multiSongCollisionRegex.test(rawTitle)) {
    return { isMashup: true, reason: 'Multi-song mashup title syntax' };
  }

  // Multi-song title indicator: e.g. "Tum Hi Ho / Kesariya / Channa Mereya" (3+ distinct songs slashed together)
  const slashedMultiSongsRegex = /^[\w\s]{2,}\s*\/\s*[\w\s]{2,}\s*\/\s*[\w\s]{2,}/i;
  if (slashedMultiSongsRegex.test(title) && !title.includes('ost') && !title.includes('soundtrack')) {
    return { isMashup: true, reason: 'Multi-song slashed title mashup' };
  }

  // 4. Multi-song Medley with mashup descriptors
  const mashupMedleyRegex = /\b(mashup\s+medley|medley\s+mashup|mega\s*mashup)\b/i;
  if (mashupMedleyRegex.test(combined)) {
    return { isMashup: true, reason: 'Mashup medley detected' };
  }

  // 5. Categorical Theme Mashups: e.g. "Romantic Mashup", "Bollywood Love Mashup", "90s Mashup", "Lofi Mashup"
  const themeMashupRegex = /\b(romantic|bollywood|punjabi|hindi|love|lo[\-_]?fi|chill|acoustic|wedding|dance|party|club|retro|90s|80s|2000s|monsoon|sad|breakup|heartbreak)\s+mash[\s\-_]*up\b/i;
  if (themeMashupRegex.test(combined)) {
    return { isMashup: true, reason: 'Theme/genre mashup match' };
  }

  // NOT A MASHUP:
  // - Official Remix (e.g. "Song A (Official Remix)", "Song A - Remix")
  // - Live versions (e.g. "Song A - Live", "Song A (Live at ...)")
  // - Acoustic versions (e.g. "Song A Acoustic Version", "Song A - Acoustic")
  // - Extended Mix / Original Mix / Radio Edit / Club Mix
  return { isMashup: false, reason: null };
}

/**
 * Validates whether a candidate track is eligible for automatic smart recommendations.
 * 
 * Rules:
 * 1. Must be a valid, playable track with non-empty identity (id, title).
 * 2. Must pass content validation if available.
 * 3. MUST NOT be a mashup track.
 * 
 * @param {Object} track
 * @param {Function} [contentValidator] Optional validator function (e.g. validateMusicContent)
 * @returns {{ eligible: boolean, reason: string | null }}
 */
function isEligibleForRecommendation(track, contentValidator = null) {
  if (!track) {
    return { eligible: false, reason: 'Empty track' };
  }

  const trackId = track.id || track.trackId || track.ytId;
  const title = track.title;
  if (!trackId || !title || String(title).trim().length === 0) {
    return { eligible: false, reason: 'Missing track identity (id or title)' };
  }

  // Check 1: Strict Mashup Exclusion
  const mashupCheck = isMashupTrack(track);
  if (mashupCheck.isMashup) {
    return { eligible: false, reason: `Excluded mashup: ${mashupCheck.reason}` };
  }

  // Check 2: Content Validator (if provided, ensures Category 10 music, studio release, etc.)
  if (typeof contentValidator === 'function') {
    const contentCheck = contentValidator(track);
    if (contentCheck && contentCheck.isMusic === false) {
      return { eligible: false, reason: `Content not valid music: ${contentCheck.reason || 'unspecified'}` };
    }
  }

  return { eligible: true, reason: null };
}

module.exports = {
  isMashupTrack,
  isEligibleForRecommendation,
  normalizeText
};
