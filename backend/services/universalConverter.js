/**
 * Universal Music Service Converter
 * Converts between Apple Music and Spotify formats seamlessly
 * Handles all the differences in metadata, artist formats, and API structures
 */

/**
 * Convert Apple Music track to Spotify format
 */
function appleToSpotify(appleTrack) {
  // Handle both raw Apple Music API format and already processed format
  const attrs = appleTrack.attributes || appleTrack;
  
  // Extract artist information
  let artists = [];
  if (attrs.artists && Array.isArray(attrs.artists)) {
    // Already in array format
    artists = attrs.artists;
  } else if (attrs.artistName) {
    // String format - parse it
    artists = parseArtistString(attrs.artistName);
  }
  
  // Convert to Spotify format
  return {
    id: attrs.id || appleTrack.id,
    name: attrs.name || '',
    artists: artists.map(artist => ({ name: artist })),
    album: {
      name: attrs.albumName || attrs.album || ''
    },
    duration_ms: attrs.durationInMillis || attrs.duration_ms || 0,
    external_ids: {
      isrc: attrs.isrc || null
    },
    explicit: attrs.contentRating === 'explicit'
  };
}

/**
 * Convert Spotify track to Apple Music format
 */
function spotifyToApple(spotifyTrack) {
  const artists = (spotifyTrack.artists || []).map(a => a.name);
  const artistName = artists.join(' & ');
  
  return {
    id: spotifyTrack.id,
    attributes: {
      name: spotifyTrack.name || '',
      artistName: artistName,
      albumName: spotifyTrack.album?.name || '',
      durationInMillis: spotifyTrack.duration_ms || 0,
      isrc: spotifyTrack.external_ids?.isrc || null,
      contentRating: spotifyTrack.explicit ? 'explicit' : null
    }
  };
}

/**
 * Universal search term generator - works for both services
 */
function generateUniversalSearchTerms(track, sourceFormat = 'apple') {
  const terms = [];
  
  // Normalize track to standard format first
  let normalized;
  if (sourceFormat === 'apple') {
    normalized = appleToSpotify(track);
  } else {
    normalized = track; // Already in Spotify format
  }
  
  const name = normalized.name || '';
  // Handle both string arrays and object arrays for artists
  const artists = (normalized.artists || []).map(a => {
    if (typeof a === 'string') return a;
    return a.name || '';
  }).filter(Boolean);
  const primaryArtist = artists[0] || '';
  const album = normalized.album?.name || '';
  
  // Debug logging
  console.log(`🔍 generateUniversalSearchTerms DEBUG:`, {
    sourceFormat,
    name,
    artists,
    primaryArtist,
    album,
    normalized
  });
  
  if (!name) return terms;
  
  // Term 1: Name + Primary Artist (most common)
  if (primaryArtist) {
    terms.push(`${name} ${primaryArtist}`);
  }
  
  // Term 2: Primary Artist + Name (reversed)
  if (primaryArtist) {
    terms.push(`${primaryArtist} ${name}`);
  }
  
  // Term 3: All artists + name (for collaborations)
  if (artists.length > 1) {
    terms.push(`${name} ${artists.join(' ')}`);
  }
  
  // Term 4: Clean version (remove special characters)
  if (primaryArtist) {
    const cleanName = name.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanArtist = primaryArtist.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    terms.push(`${cleanName} ${cleanArtist}`);
  }
  
  // Term 5: With album context
  if (primaryArtist && album) {
    terms.push(`${name} ${primaryArtist} ${album}`);
  }
  
  // Term 6: Just the song name (for very popular songs)
  terms.push(name);
  
  // Term 7: Primary artist only (for artist-specific searches)
  if (primaryArtist) {
    terms.push(primaryArtist);
  }
  
  return [...new Set(terms)]; // Remove duplicates
}

/**
 * Universal similarity calculator - works for both services
 */
function calculateUniversalSimilarity(track1, track2, format1 = 'apple', format2 = 'spotify') {
  try {
    // Convert both tracks to standard format
    const normalized1 = format1 === 'apple' ? appleToSpotify(track1) : track1;
    const normalized2 = format2 === 'spotify' ? track2 : spotifyToApple(track2);
    
    // Safety checks
    if (!normalized1 || !normalized2) {
      console.log(`🔍 calculateUniversalSimilarity SAFETY CHECK FAILED:`, {
        track1: track1,
        track2: track2,
        normalized1: normalized1,
        normalized2: normalized2
      });
      return 0;
    }
    
    let score = 0;
    
    // Title similarity (40 points)
    const title1 = normalized1.name || '';
    const title2 = normalized2.name || '';
    if (title1 && title2) {
      const titleSim = stringSimilarity(
        normalizeForComparison(title1),
        normalizeForComparison(title2)
      );
      score += titleSim * 40;
    }
    
    // Primary artist similarity (35 points)
    const artist1 = (normalized1.artists || [])[0] ? 
      (typeof (normalized1.artists || [])[0] === 'string' ? (normalized1.artists || [])[0] : (normalized1.artists || [])[0].name) || '' : '';
    const artist2 = (normalized2.artists || [])[0] ? 
      (typeof (normalized2.artists || [])[0] === 'string' ? (normalized2.artists || [])[0] : (normalized2.artists || [])[0].name) || '' : '';
    if (artist1 && artist2) {
      const artistSim = stringSimilarity(
        normalizeForComparison(artist1),
        normalizeForComparison(artist2)
      );
      score += artistSim * 35;
    }
    
    // Album similarity (15 points)
    const album1 = normalized1.album?.name || '';
    const album2 = normalized2.album?.name || '';
    if (album1 && album2) {
      const albumSim = stringSimilarity(
        normalizeForComparison(album1),
        normalizeForComparison(album2)
      );
      score += albumSim * 15;
    }
    
    // Duration similarity (10 points)
    const duration1 = normalized1.duration_ms || 0;
    const duration2 = normalized2.duration_ms || 0;
    if (duration1 > 0 && duration2 > 0) {
      const durationDiff = Math.abs(duration1 - duration2);
      if (durationDiff <= 3000) {
        score += 10;
      } else if (durationDiff <= 5000) {
        score += 5;
      }
    }
    
    return Math.min(100, Math.round(score));
  } catch (error) {
    logger.info(`🔍 calculateUniversalSimilarity ERROR:`, error.message);
    return 0;
  }
}

/**
 * Parse artist string into array (handles all collaboration formats)
 */
function parseArtistString(artistString) {
  if (!artistString || typeof artistString !== 'string') return [];
  
  // Common collaboration separators
  const separators = [
    /\s+&\s+/gi,           // "Artist A & Artist B"
    /\s+feat\.?\s+/gi,     // "Artist A feat. Artist B"
    /\s+featuring\s+/gi,   // "Artist A featuring Artist B"
    /\s+ft\.?\s+/gi,       // "Artist A ft. Artist B"
    /\s+with\s+/gi,        // "Artist A with Artist B"
    /\s+x\s+/gi,           // "Artist A x Artist B"
    /\s+\+\s+/gi,          // "Artist A + Artist B"
    /\s*,\s*/gi,           // "Artist A, Artist B"
    /\s*;\s*/gi,           // "Artist A; Artist B"
  ];
  
  let artists = [artistString.trim()];
  
  // Split by each separator
  for (const separator of separators) {
    const newArtists = [];
    for (const artist of artists) {
      const split = artist.split(separator);
      newArtists.push(...split.map(a => a.trim()).filter(Boolean));
    }
    artists = newArtists;
  }
  
  // Remove duplicates and clean up
  const uniqueArtists = [...new Set(artists)]
    .map(artist => artist.trim())
    .filter(artist => artist.length > 0);
  
  return uniqueArtists;
}

/**
 * Normalize text for comparison
 */
function normalizeForComparison(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * String similarity using Levenshtein distance
 */
function stringSimilarity(a, b) {
  if (a === b) return 1.0;
  if (!a || !b) return 0;
  
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / maxLen);
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

module.exports = {
  appleToSpotify,
  spotifyToApple,
  generateUniversalSearchTerms,
  calculateUniversalSimilarity,
  parseArtistString,
  normalizeForComparison,
  stringSimilarity
};
