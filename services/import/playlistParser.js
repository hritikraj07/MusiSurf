/**
 * MusiSurf External Playlist File Parser
 * Supports: M3U, M3U8, PLS, XSPF, CSV, JSON, TXT
 * Enforces file size limits, input sanitization, and security validations.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Strips dangerous HTML tags and control characters from string metadata.
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Parses duration in seconds or milliseconds into integer seconds.
 */
function parseDurationSeconds(val) {
  if (!val) return 0;
  if (typeof val === 'number') {
    return val > 10000 ? Math.round(val / 1000) : Math.round(val);
  }
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const num = parseInt(str, 10);
  if (isNaN(num)) return 0;
  return num > 10000 ? Math.round(num / 1000) : num;
}

/**
 * Splits "Artist - Title" or "Title - Artist" string into artist and title components.
 */
function splitArtistTitle(raw) {
  const clean = sanitizeString(raw);
  if (!clean) return { title: '', artist: '' };

  // Common separators: " - ", " – ", " — ", " : "
  const sepMatch = clean.match(/\s+[-–—:]\s+/);
  if (sepMatch) {
    const idx = sepMatch.index;
    const part1 = clean.substring(0, idx).trim();
    const part2 = clean.substring(idx + sepMatch[0].length).trim();
    return { artist: part1, title: part2 };
  }

  // Comma or slash separator fallback
  return { artist: 'Unknown Artist', title: clean };
}

/**
 * Validates raw content for binary or executable signatures.
 */
function validateContentSafety(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid playlist content: content is empty or not text');
  }
  if (content.length > MAX_FILE_SIZE) {
    throw new Error('File exceeds maximum allowed size (5 MB)');
  }
  // Check for common executable magic bytes
  if (content.startsWith('MZ') || content.startsWith('\x7fELF') || content.includes('\x00\x00\x00')) {
    throw new Error('Unsupported or unsafe binary file format rejected');
  }
}

/**
 * 1. M3U & M3U8 Parser
 */
function parseM3U(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks = [];
  let playlistName = filename.replace(/\.(m3u8?)$/i, '');
  let currentExtInf = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTM3U')) {
      continue;
    }

    if (line.startsWith('#PLAYLIST:')) {
      const name = line.replace('#PLAYLIST:', '').trim();
      if (name) playlistName = sanitizeString(name);
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Format: #EXTINF:duration,Artist - Title OR #EXTINF:duration,Title
      const infoPart = line.substring(8);
      const commaIdx = infoPart.indexOf(',');
      let duration = 0;
      let rawTitle = '';

      if (commaIdx !== -1) {
        duration = parseDurationSeconds(infoPart.substring(0, commaIdx));
        rawTitle = infoPart.substring(commaIdx + 1).trim();
      } else {
        rawTitle = infoPart.trim();
      }

      currentExtInf = { duration, rawTitle };
      continue;
    }

    if (line.startsWith('#')) {
      // Other directives (e.g. #EXTALB, #EXTART)
      continue;
    }

    // This line is a file path or URL
    let title = '';
    let artist = 'Various Artists';
    let duration = currentExtInf ? currentExtInf.duration : 0;

    if (currentExtInf && currentExtInf.rawTitle) {
      const split = splitArtistTitle(currentExtInf.rawTitle);
      title = split.title || currentExtInf.rawTitle;
      artist = split.artist || 'Various Artists';
    } else {
      // Fallback: extract title from filename
      const base = line.split(/[\\/]/).pop() || '';
      const withoutExt = base.replace(/\.[a-z0-9]+$/i, '');
      const split = splitArtistTitle(withoutExt);
      title = split.title || withoutExt;
      artist = split.artist || 'Various Artists';
    }

    if (title) {
      tracks.push({
        position: tracks.length + 1,
        title: sanitizeString(title),
        artist: sanitizeString(artist),
        album: '',
        duration: duration,
        isrc: '',
        externalUrl: line.startsWith('http') ? line : ''
      });
    }

    currentExtInf = null;
  }

  return {
    provider: 'file_m3u',
    name: playlistName,
    playlistName: playlistName,
    description: `Imported from M3U playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * 2. PLS Parser (Shoutcast / Winamp Playlist)
 */
function parsePLS(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let playlistName = filename.replace(/\.pls$/i, '');
  const trackMap = new Map();

  for (const line of lines) {
    if (line.toLowerCase() === '[playlist]') continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.substring(0, eqIdx).trim().toLowerCase();
    const val = line.substring(eqIdx + 1).trim();

    if (key.startsWith('title')) {
      const num = parseInt(key.replace('title', ''), 10);
      if (!isNaN(num)) {
        if (!trackMap.has(num)) trackMap.set(num, {});
        trackMap.get(num).rawTitle = val;
      }
    } else if (key.startsWith('length')) {
      const num = parseInt(key.replace('length', ''), 10);
      if (!isNaN(num)) {
        if (!trackMap.has(num)) trackMap.set(num, {});
        trackMap.get(num).duration = parseInt(val, 10) || 0;
      }
    } else if (key.startsWith('file')) {
      const num = parseInt(key.replace('file', ''), 10);
      if (!isNaN(num)) {
        if (!trackMap.has(num)) trackMap.set(num, {});
        trackMap.get(num).file = val;
      }
    }
  }

  const sortedNums = [...trackMap.keys()].sort((a, b) => a - b);
  const tracks = [];

  for (const num of sortedNums) {
    const item = trackMap.get(num);
    let title = '';
    let artist = 'Various Artists';

    if (item.rawTitle) {
      const split = splitArtistTitle(item.rawTitle);
      title = split.title || item.rawTitle;
      artist = split.artist || 'Various Artists';
    } else if (item.file) {
      const base = item.file.split(/[\\/]/).pop() || '';
      const withoutExt = base.replace(/\.[a-z0-9]+$/i, '');
      const split = splitArtistTitle(withoutExt);
      title = split.title || withoutExt;
      artist = split.artist || 'Various Artists';
    }

    if (title) {
      tracks.push({
        position: tracks.length + 1,
        title: sanitizeString(title),
        artist: sanitizeString(artist),
        album: '',
        duration: Math.max(0, item.duration || 0),
        isrc: '',
        externalUrl: item.file && item.file.startsWith('http') ? item.file : ''
      });
    }
  }

  return {
    provider: 'file_pls',
    name: playlistName,
    playlistName: playlistName,
    description: `Imported from PLS playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * 3. XSPF Parser (XML Shareable Playlist Format)
 */
function parseXSPF(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  let playlistName = filename.replace(/\.xspf$/i, '');

  const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    playlistName = sanitizeString(titleMatch[1]);
  }

  const tracks = [];
  const trackRegex = /<track>([\s\S]*?)<\/track>/gi;
  let match;

  while ((match = trackRegex.exec(content)) !== null) {
    const trackXml = match[1];

    const tMatch = trackXml.match(/<title>([\s\S]*?)<\/title>/i);
    const cMatch = trackXml.match(/<creator>([\s\S]*?)<\/creator>/i);
    const aMatch = trackXml.match(/<album>([\s\S]*?)<\/album>/i);
    const dMatch = trackXml.match(/<duration>([\s\S]*?)<\/duration>/i);
    const iMatch = trackXml.match(/<identifier>([\s\S]*?)<\/identifier>/i);
    const lMatch = trackXml.match(/<location>([\s\S]*?)<\/location>/i);

    const title = tMatch ? sanitizeString(tMatch[1]) : '';
    const artist = cMatch ? sanitizeString(cMatch[1]) : 'Various Artists';
    const album = aMatch ? sanitizeString(aMatch[1]) : '';
    const durationMs = dMatch ? parseInt(dMatch[1], 10) || 0 : 0;
    const duration = parseDurationSeconds(durationMs);
    const identifier = iMatch ? sanitizeString(iMatch[1]) : '';
    const location = lMatch ? sanitizeString(lMatch[1]) : '';

    let isrc = '';
    if (identifier.toLowerCase().startsWith('isrc:')) {
      isrc = identifier.substring(5).trim();
    }

    if (title) {
      tracks.push({
        position: tracks.length + 1,
        title,
        artist,
        album,
        duration,
        isrc,
        externalUrl: location.startsWith('http') ? location : ''
      });
    }
  }

  return {
    provider: 'file_xspf',
    name: playlistName,
    playlistName: playlistName,
    description: `Imported from XSPF playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * 4. CSV Parser
 * Supports TuneMyMusic, Soundiiz, Spotify export CSVs
 */
function parseCSV(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  let playlistName = filename.replace(/\.csv$/i, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { provider: 'file_csv', name: playlistName, totalTracks: 0, tracks: [] };
  }

  // Parse CSV line handling quoted values
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          current += char;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const rawRows = lines.map(parseCSVLine);
  if (rawRows.length === 0) {
    return { provider: 'file_csv', name: playlistName, totalTracks: 0, tracks: [] };
  }

  // Detect header row
  const header = rawRows[0].map(h => h.toLowerCase().trim());
  let titleIdx = header.findIndex(h => h.includes('title') || h.includes('track') || h.includes('name') || h === 'song');
  let artistIdx = header.findIndex(h => h.includes('artist') || h.includes('creator') || h.includes('singer'));
  let albumIdx = header.findIndex(h => h.includes('album'));
  let durationIdx = header.findIndex(h => h.includes('duration') || h.includes('time') || h.includes('length'));
  let isrcIdx = header.findIndex(h => h.includes('isrc'));
  let urlIdx = header.findIndex(h => h.includes('url') || h.includes('uri') || h.includes('link'));
  let plNameIdx = header.findIndex(h => h.includes('playlist name') || h.includes('playlist_name'));

  let startRow = 1;
  if (titleIdx === -1 && artistIdx === -1) {
    // No explicit header, assume: Col 0 = Title, Col 1 = Artist, Col 2 = Album
    titleIdx = 0;
    artistIdx = 1;
    albumIdx = 2;
    durationIdx = 3;
    startRow = 0;
  }

  const tracks = [];
  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    let title = titleIdx !== -1 && row[titleIdx] ? sanitizeString(row[titleIdx]) : '';
    let artist = artistIdx !== -1 && row[artistIdx] ? sanitizeString(row[artistIdx]) : 'Various Artists';
    let album = albumIdx !== -1 && row[albumIdx] ? sanitizeString(row[albumIdx]) : '';
    let duration = durationIdx !== -1 && row[durationIdx] ? parseDurationSeconds(row[durationIdx]) : 0;
    let isrc = isrcIdx !== -1 && row[isrcIdx] ? sanitizeString(row[isrcIdx]) : '';
    let externalUrl = urlIdx !== -1 && row[urlIdx] ? sanitizeString(row[urlIdx]) : '';

    if (plNameIdx !== -1 && row[plNameIdx] && playlistName === filename.replace(/\.csv$/i, '')) {
      playlistName = sanitizeString(row[plNameIdx]);
    }

    if (!title && row[0]) {
      const split = splitArtistTitle(row[0]);
      title = split.title;
      if (artist === 'Various Artists') artist = split.artist;
    }

    if (title) {
      tracks.push({
        position: tracks.length + 1,
        title,
        artist,
        album,
        duration,
        isrc,
        externalUrl
      });
    }
  }

  return {
    provider: 'file_csv',
    name: playlistName,
    playlistName: playlistName,
    description: `Imported from CSV playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * 5. JSON Parser
 * Supports MusiSurf export, Spotify export JSON, Soundiiz, and generic track arrays.
 */
function parseJSON(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error('Invalid JSON format: failed to parse JSON content');
  }

  let playlistName = filename.replace(/\.json$/i, '');
  let playlistDesc = '';
  let rawTracks = [];

  if (Array.isArray(parsed)) {
    rawTracks = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    playlistName = parsed.name || parsed.playlistName || parsed.title || playlistName;
    playlistDesc = parsed.description || '';
    if (Array.isArray(parsed.tracks)) {
      rawTracks = parsed.tracks;
    } else if (parsed.playlist && Array.isArray(parsed.playlist.tracks)) {
      rawTracks = parsed.playlist.tracks;
    } else if (Array.isArray(parsed.items)) {
      rawTracks = parsed.items;
    }
  }

  const tracks = [];
  rawTracks.forEach((t, idx) => {
    if (!t) return;
    const title = sanitizeString(t.title || t.name || t.trackName || t.song || '');
    let artist = sanitizeString(
      t.artist ||
      t.artists ||
      (Array.isArray(t.artists) ? t.artists.map(a => (typeof a === 'string' ? a : a.name)).join(', ') : '') ||
      t.singer ||
      'Various Artists'
    );
    const album = sanitizeString(t.album?.name || t.album || '');
    const duration = parseDurationSeconds(t.duration || t.duration_ms || t.duration_seconds || 0);
    const isrc = sanitizeString(t.isrc || t.external_ids?.isrc || '');
    const externalUrl = sanitizeString(t.url || t.externalUrl || t.external_urls?.spotify || '');
    const artwork = sanitizeString(t.image || t.thumbnail || t.thumbnail_url || t.coverArt?.sources?.[0]?.url || '');

    if (title) {
      tracks.push({
        position: idx + 1,
        title,
        artist,
        album,
        duration,
        isrc,
        externalUrl,
        artwork
      });
    }
  });

  return {
    provider: 'file_json',
    name: sanitizeString(playlistName),
    playlistName: sanitizeString(playlistName),
    description: playlistDesc ? sanitizeString(playlistDesc) : `Imported from JSON playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * 6. TXT Parser
 * Supports line-by-line track lists:
 * "Artist - Title"
 * "1. Title - Artist"
 * "Title\tArtist\tAlbum"
 */
function parseTXT(content, filename = 'Imported Playlist') {
  validateContentSafety(content);
  let playlistName = filename.replace(/\.txt$/i, '');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Strip leading numbering: e.g. "1. ", "01 - ", "[1] "
    line = line.replace(/^\[?\d+\]?[\s.\-–—)]+/, '').trim();
    if (!line) continue;

    // Check for tab-separated columns
    if (line.includes('\t')) {
      const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
      const title = parts[0] || '';
      const artist = parts[1] || 'Various Artists';
      const album = parts[2] || '';
      if (title) {
        tracks.push({
          position: tracks.length + 1,
          title: sanitizeString(title),
          artist: sanitizeString(artist),
          album: sanitizeString(album),
          duration: 0,
          isrc: ''
        });
        continue;
      }
    }

    const split = splitArtistTitle(line);
    const title = split.title || line;
    const artist = split.artist || 'Various Artists';

    if (title) {
      tracks.push({
        position: tracks.length + 1,
        title: sanitizeString(title),
        artist: sanitizeString(artist),
        album: '',
        duration: 0,
        isrc: ''
      });
    }
  }

  return {
    provider: 'file_txt',
    name: playlistName,
    playlistName: playlistName,
    description: `Imported from plain text playlist file (${tracks.length} tracks)`,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * Universal file parser dispatcher.
 */
function parsePlaylistFile(content, filename = 'playlist.m3u', formatHint = '') {
  const ext = (formatHint || filename.split('.').pop() || '').toLowerCase().trim();

  switch (ext) {
    case 'm3u':
    case 'm3u8':
      return parseM3U(content, filename);
    case 'pls':
      return parsePLS(content, filename);
    case 'xspf':
      return parseXSPF(content, filename);
    case 'csv':
      return parseCSV(content, filename);
    case 'json':
      return parseJSON(content, filename);
    case 'txt':
      return parseTXT(content, filename);
    default:
      // Sniff content if extension is ambiguous
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        return parseJSON(content, filename);
      }
      if (content.includes('<?xml') || content.includes('<playlist')) {
        return parseXSPF(content, filename);
      }
      if (content.includes('[playlist]')) {
        return parsePLS(content, filename);
      }
      if (content.includes('#EXTM3U') || content.includes('#EXTINF:')) {
        return parseM3U(content, filename);
      }
      if (content.includes(',') && content.split('\n')[0].includes(',')) {
        return parseCSV(content, filename);
      }
      // Fallback to TXT line-by-line
      return parseTXT(content, filename);
  }
}

module.exports = {
  parsePlaylistFile,
  parseM3U,
  parsePLS,
  parseXSPF,
  parseCSV,
  parseJSON,
  parseTXT,
  sanitizeString,
  splitArtistTitle
};
