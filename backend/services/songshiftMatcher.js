/**
 * Professional-Level Matching - Advanced Accuracy
 * Uses ISRC-first approach with instant lookups for maximum precision
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Professional matching uses ISRC as the primary matching method
// This is why it's so fast and accurate
async function songshiftMatch(sourceTrack, appleHeaders, storefront = 'us') {
  const startTime = Date.now();
  
  // TIER 1: ISRC MATCHING (Professional primary method)
  if (sourceTrack.isrc) {
    try {
      const isrcUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?filter[isrc]=${encodeURIComponent(sourceTrack.isrc)}`;
      
      const response = await axios.get(isrcUrl, { 
        headers: appleHeaders,
        timeout: 2000 // Faster timeout
      });
      
      const songs = response.data?.data || [];
      
      if (songs.length > 0) {
        // Professional logic: prefer exact album matches
        const exactAlbumMatch = songs.find(song => 
          normalizeString(song.attributes?.albumName || '') === normalizeString(sourceTrack.album || '')
        );
        
        const bestMatch = exactAlbumMatch || songs[0];
        const matchTime = Date.now() - startTime;
        
        return {
          success: true,
          match: {
            id: bestMatch.id,
            type: bestMatch.type,
            attributes: bestMatch.attributes,
            matchMethod: 'ISRC',
            matchTime: matchTime,
            confidence: 'high'
          },
          alternatives: songs.slice(1, 6), // Show other ISRC matches
          unavailable: false
        };
      }
    } catch (error) {
      logger.info(`ISRC lookup failed for ${sourceTrack.name}: ${error.message}`);
    }
  }
  
  // TIER 2: FAST METADATA SEARCH (Professional fallback)
  try {
    const searchTerm = `${sourceTrack.name} ${sourceTrack.artists?.[0] || ''}`.trim();
    const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(searchTerm)}&types=songs&limit=10`;
    
      const response = await axios.get(searchUrl, { 
        headers: appleHeaders,
        timeout: 1500 // Faster timeout
      });
    
    const songs = response.data?.results?.songs?.data || [];
    
    if (songs.length > 0) {
      // SongShift scoring: title + artist similarity
      const scoredSongs = songs.map(song => ({
        ...song,
        score: calculateSongshiftScore(sourceTrack, song.attributes)
      })).sort((a, b) => b.score - a.score);
      
      const bestMatch = scoredSongs[0];
      const matchTime = Date.now() - startTime;
      
      if (bestMatch.score >= 80) { // SongShift threshold
        return {
          success: true,
          match: {
            id: bestMatch.id,
            type: bestMatch.type,
            attributes: bestMatch.attributes,
            matchMethod: 'METADATA',
            matchTime: matchTime,
            confidence: bestMatch.score >= 90 ? 'high' : 'medium',
            score: bestMatch.score
          },
          alternatives: scoredSongs.slice(1, 5),
          unavailable: false
        };
      }
    }
  } catch (error) {
    logger.info(`Metadata search failed for ${sourceTrack.name}: ${error.message}`);
  }
  
  // No match found
  return {
    success: false,
    match: null,
    alternatives: [],
    unavailable: true,
    matchTime: Date.now() - startTime
  };
}

// SongShift's scoring algorithm (simplified but effective)
function calculateSongshiftScore(sourceTrack, candidate) {
  let score = 0;
  
  // Title similarity (60% weight)
  const titleSimilarity = stringSimilarity(
    normalizeString(sourceTrack.name || ''),
    normalizeString(candidate.name || '')
  );
  score += titleSimilarity * 60;
  
  // Artist similarity (40% weight)
  const artistSimilarity = stringSimilarity(
    normalizeString(sourceTrack.artists?.[0] || ''),
    normalizeString(candidate.artistName || '')
  );
  score += artistSimilarity * 40;
  
  // Duration bonus (if close)
  if (sourceTrack.duration_ms && candidate.durationInMillis) {
    const durationDiff = Math.abs(candidate.durationInMillis - sourceTrack.duration_ms);
    if (durationDiff <= 2000) {
      score += 5; // Small bonus for duration match
    }
  }
  
  return Math.min(100, Math.round(score));
}

// SongShift's string normalization
function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// SongShift's string similarity (Levenshtein-based)
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

// Batch processing with SongShift speed
async function songshiftBatchMatch(tracks, appleHeaders, storefront = 'us', progressCallback) {
  const results = {
    matched: [],
    unavailable: [],
    errors: []
  };
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    
    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: tracks.length,
        track: track.name,
        artist: track.artists?.[0] || ''
      });
    }
    
    try {
      const result = await songshiftMatch(track, appleHeaders, storefront);
      
      if (result.success && result.match) {
        results.matched.push({
          sourceTrack: track,
          match: result.match,
          alternatives: result.alternatives
        });
      } else {
        results.unavailable.push({
          sourceTrack: track,
          reason: 'not_found'
        });
      }
    } catch (error) {
      results.errors.push({
        sourceTrack: track,
        error: error.message
      });
    }
    
    // No delay - instant speed like SongShift
  }
  
  return results;
}

module.exports = {
  songshiftMatch,
  songshiftBatchMatch,
  calculateSongshiftScore,
  normalizeString,
  stringSimilarity
};
