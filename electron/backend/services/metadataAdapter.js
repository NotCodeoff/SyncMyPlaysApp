/**
 * Metadata Adapter - Handles differences between Apple Music and Spotify API structures
 * 
 * Apple Music API Structure:
 * - artistName: "Primary Artist & Featured Artist" (single string)
 * - attributes: { name, artistName, albumName, durationInMillis, isrc }
 * 
 * Spotify API Structure:
 * - artists: [{ name: "Primary Artist" }, { name: "Featured Artist" }] (array)
 * - { name, artists, album: { name }, duration_ms, external_ids: { isrc } }
 */

/**
 * Convert Apple Music track to standardized format
 */
function normalizeAppleTrack(appleTrack) {
  const attrs = appleTrack.attributes || appleTrack;
  
  // Debug: Log the input data
  console.log(`🍎 normalizeAppleTrack input:`, {
    appleTrack: appleTrack,
    attrs: attrs,
    artistName: attrs.artistName,
    artists: attrs.artists,
    name: attrs.name
  });
  
  // Handle both formats: artistName (string) or artists (array)
  let artists = [];
  let artistString = '';
  
  if (attrs.artists && Array.isArray(attrs.artists)) {
    // Already in array format
    artists = attrs.artists;
    artistString = artists.join(' & ');
  } else if (attrs.artistName) {
    // String format - parse it
    artistString = attrs.artistName;
    artists = parseArtistString(artistString);
  }
  
  const normalized = {
    id: appleTrack.id,
    name: attrs.name || '',
    artists: artists,
    primaryArtist: artists[0] || '',
    featuredArtists: artists.slice(1),
    album: attrs.albumName || attrs.album || '',
    duration_ms: attrs.durationInMillis || attrs.duration_ms || 0,
    isrc: attrs.isrc || null,
    contentRating: attrs.contentRating || null,
    // Keep original for debugging
    original: {
      artistName: artistString,
      artists: artists,
      appleFormat: true
    }
  };
  
  // Debug: Log the output data
  console.log(`🍎 normalizeAppleTrack output:`, {
    name: normalized.name,
    primaryArtist: normalized.primaryArtist,
    artists: normalized.artists,
    artistString: artistString
  });
  
  return normalized;
}

/**
 * Convert Spotify track to standardized format
 */
function normalizeSpotifyTrack(spotifyTrack) {
  const artists = (spotifyTrack.artists || []).map(a => a.name).filter(Boolean);
  
  return {
    id: spotifyTrack.id,
    name: spotifyTrack.name || '',
    artists: artists,
    primaryArtist: artists[0] || '',
    featuredArtists: artists.slice(1),
    album: spotifyTrack.album?.name || '',
    duration_ms: spotifyTrack.duration_ms || 0,
    isrc: spotifyTrack.external_ids?.isrc || null,
    explicit: spotifyTrack.explicit || false,
    // Keep original for debugging
    original: {
      artistsArray: spotifyTrack.artists || [],
      spotifyFormat: true
    }
  };
}

/**
 * Parse Apple Music artist string into array of individual artists
 * Handles various formats: "Artist A & Artist B", "Artist A feat. Artist B", etc.
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
 * Generate search terms optimized for cross-platform matching
 */
function generateCrossPlatformSearchTerms(normalizedTrack) {
  const terms = [];
  const { name, artists, primaryArtist, featuredArtists, album } = normalizedTrack;
  
  // Debug: Log the input
  console.log(`🔍 generateCrossPlatformSearchTerms input:`, {
    name: name,
    artists: artists,
    primaryArtist: primaryArtist,
    featuredArtists: featuredArtists,
    album: album
  });
  
  if (!name) return terms;
  
  // Term 1: Primary artist + song name (most common format)
  if (primaryArtist) {
    terms.push(`${name} ${primaryArtist}`);
  }
  
  // Term 2: All artists + song name (for collaborations)
  if (artists.length > 1) {
    terms.push(`${name} ${artists.join(' ')}`);
  }
  
  // Term 3: Song name + primary artist (reversed)
  if (primaryArtist) {
    terms.push(`${primaryArtist} ${name}`);
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
  
  // Term 6: Just song name (for very popular songs)
  terms.push(name);
  
  // Term 7: Primary artist only (for artist-specific searches)
  if (primaryArtist) {
    terms.push(primaryArtist);
  }
  
  const uniqueTerms = [...new Set(terms)]; // Remove duplicates
  
  // Debug: Log the output
  console.log(`🔍 generateCrossPlatformSearchTerms output:`, {
    terms: uniqueTerms,
    count: uniqueTerms.length
  });
  
  return uniqueTerms;
}

/**
 * Calculate cross-platform similarity score
 */
function calculateCrossPlatformSimilarity(track1, track2) {
  let score = 0;
  
  // Title similarity (40 points)
  const titleSim = stringSimilarity(
    normalizeForComparison(track1.name),
    normalizeForComparison(track2.name)
  );
  score += titleSim * 40;
  
  // Primary artist similarity (30 points)
  const primaryArtistSim = stringSimilarity(
    normalizeForComparison(track1.primaryArtist),
    normalizeForComparison(track2.primaryArtist)
  );
  score += primaryArtistSim * 30;
  
  // Album similarity (15 points)
  const albumSim = stringSimilarity(
    normalizeForComparison(track1.album),
    normalizeForComparison(track2.album)
  );
  score += albumSim * 15;
  
  // Duration similarity (10 points)
  if (track1.duration_ms > 0 && track2.duration_ms > 0) {
    const durationDiff = Math.abs(track1.duration_ms - track2.duration_ms);
    if (durationDiff <= 2000) {
      score += 10;
    } else if (durationDiff <= 5000) {
      score += 5;
    }
  }
  
  // Featured artist bonus (5 points)
  if (track1.featuredArtists.length > 0 && track2.featuredArtists.length > 0) {
    const hasCommonFeatured = track1.featuredArtists.some(f1 => 
      track2.featuredArtists.some(f2 => 
        stringSimilarity(normalizeForComparison(f1), normalizeForComparison(f2)) > 0.8
      )
    );
    if (hasCommonFeatured) {
      score += 5;
    }
  }
  
  return Math.min(100, Math.round(score));
}

/**
 * Normalize text for comparison (aggressive normalization)
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

/**
 * Check if two tracks are likely the same song across platforms
 */
function isLikelySameTrack(track1, track2, threshold = 75) {
  const similarity = calculateCrossPlatformSimilarity(track1, track2);
  
  // Additional checks for high-confidence matches
  if (similarity >= threshold) {
    // ISRC match is definitive
    if (track1.isrc && track2.isrc && track1.isrc === track2.isrc) {
      return { match: true, confidence: 'definitive', similarity: 100 };
    }
    
    // High similarity with duration match
    if (similarity >= 85) {
      const durationDiff = Math.abs(track1.duration_ms - track2.duration_ms);
      if (durationDiff <= 3000) {
        return { match: true, confidence: 'high', similarity };
      }
    }
    
    // Medium similarity with good artist match
    if (similarity >= 75) {
      const artistSim = stringSimilarity(
        normalizeForComparison(track1.primaryArtist),
        normalizeForComparison(track2.primaryArtist)
      );
      if (artistSim >= 0.8) {
        return { match: true, confidence: 'medium', similarity };
      }
    }
  }
  
  return { match: false, confidence: 'low', similarity };
}

module.exports = {
  normalizeAppleTrack,
  normalizeSpotifyTrack,
  parseArtistString,
  generateCrossPlatformSearchTerms,
  calculateCrossPlatformSimilarity,
  isLikelySameTrack,
  stringSimilarity,
  normalizeForComparison
};
