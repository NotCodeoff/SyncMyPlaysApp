/**
 * Enhanced Spotify Matcher - For Apple Music to Spotify Sync
 * Provides SongShift-level accuracy for finding Spotify tracks from Apple Music data
 * Optimized for Apple Music → Spotify direction with advanced matching strategies
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { retryWithBackoff } = require('../utils/parallelProcessor');
const config = require('../config/env');

// Import advanced matching functions for better normalization
const { normalizeString: advancedNormalize, getTrackVariantType, stringSimilarity: advancedStringSimilarity } = require('./advancedMatcher');

// Import universal converter for seamless cross-platform compatibility
const { 
  generateUniversalSearchTerms,
  calculateUniversalSimilarity,
  appleToSpotify,
  stringSimilarity: converterStringSimilarity
} = require('./universalConverter');

// Get Spotify tokens from the main application
let spotifyTokens = { access_token: null };
function setSpotifyTokens(tokens) {
  spotifyTokens = tokens;
}

// OPTIMIZED Rate limiting for Spotify API - Configured via environment
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = config.apiRateLimitMs; // Configurable rate limit
const MAX_RETRIES = config.maxRetries; // Configurable retries
const RETRY_DELAYS = [500, 1000, 2000]; // Progressive backoff

// Rate-limited Spotify API request
async function makeSpotifyRequest(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${spotifyTokens.access_token}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        timeout: 5000
      });
      
      return response;
    } catch (error) {
      if (error.response?.status === 429 && attempt < MAX_RETRIES - 1) {
        const retryAfter = error.response.headers['retry-after'] ? 
          parseInt(error.response.headers['retry-after']) * 1000 : 
          RETRY_DELAYS[attempt];
        
        logger.warn(`Spotify API rate limited, retrying after ${retryAfter}ms`, {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
        });
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        continue;
      }
      
      if (error.code === 'ECONNABORTED') {
        logger.error('Spotify API request timeout', { url, attempt: attempt + 1 });
      } else {
        logger.error('Spotify API request failed', { 
          url, 
          attempt: attempt + 1,
          error: error.message 
        });
      }
      
      throw error;
    }
  }
}

// COMPREHENSIVE Enhanced matching - Multiple strategies for maximum coverage
async function enhancedSpotifyMatcher(appleTrack) {
  const startTime = Date.now();
  
  // Convert Apple Music track to Spotify format using universal converter
  const spotifyFormat = appleToSpotify(appleTrack);
  
  // STRATEGY 1: ISRC Matching (Primary - FASTEST, most accurate)
  if (spotifyFormat.external_ids?.isrc) {
    try {
      const isrcUrl = `https://api.spotify.com/v1/search?q=isrc:${encodeURIComponent(spotifyFormat.external_ids.isrc)}&type=track&limit=5`;
      
      const response = await makeSpotifyRequest(isrcUrl);
      
      const tracks = response.data?.tracks?.items || [];
      
      if (tracks.length > 0) {
        // ISRC is definitive - just return first match (fastest)
        const bestMatch = tracks[0];
        const matchTime = Date.now() - startTime;
        
        return {
          success: true,
          id: bestMatch.id,
          match: bestMatch,
          matchMethod: 'ISRC',
          matchTime: matchTime,
          confidence: 'high'
        };
      }
    } catch (error) {
      // Continue to next strategy on ISRC failure
    }
  }
  
  // STRATEGY 2: MULTIPLE SEARCH TERMS (Maximum coverage)
  const searchTerms = generateUniversalSearchTerms(appleTrack, 'apple');
  
  // Debug logging
  const primaryArtist = (spotifyFormat.artists || [])[0]?.name || '';
  logger.debug(`Searching for track`, {
    name: spotifyFormat.name,
    artist: primaryArtist,
    searchTermsCount: searchTerms.length,
  });
  
  if (searchTerms.length === 0) {
    logger.warn('No search terms generated for track', { name: spotifyFormat.name });
    return {
      success: false,
      id: null,
      match: null,
      unavailable: true,
      matchTime: Date.now() - startTime
    };
  }
  
  // Try multiple search terms for maximum coverage
  for (let i = 0; i < Math.min(3, searchTerms.length); i++) {
    const searchTerm = searchTerms[i];
    logger.debug(`Trying search term ${i + 1}`, { searchTerm });
    
    try {
      const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchTerm)}&type=track&limit=15`;
      
      const response = await makeSpotifyRequest(searchUrl);
      
      const tracks = response.data?.tracks?.items || [];
      
      logger.debug(`Found ${tracks.length} tracks for search term`, { searchTerm, tracksFound: tracks.length });
      
      if (tracks.length > 0) {
        // UNIVERSAL scoring - use universal similarity calculator
        let bestMatch = null;
        let bestScore = -1;
        
        for (const track of tracks) {
          const score = calculateUniversalSimilarity(appleTrack, track, 'apple', 'spotify');
          
          if (score > bestScore && score >= config.matchThreshold) {
            bestMatch = track;
            bestScore = score;
          }
        }
        
        if (bestMatch) {
          logger.debug('Best match found', {
            track: bestMatch.name,
            artist: bestMatch.artists?.[0]?.name,
            score: bestScore,
          });
        }
        
        if (bestMatch && bestScore >= config.matchThreshold) {
          const matchTime = Date.now() - startTime;
          
          return {
            success: true,
            id: bestMatch.id,
            match: bestMatch,
            matchMethod: `UNIVERSAL_SEARCH_${i + 1}`,
            matchTime: matchTime,
            confidence: bestScore >= config.highConfidenceThreshold ? 'high' : bestScore >= 70 ? 'medium' : 'low',
            score: bestScore
          };
        }
      }
    } catch (error) {
      logger.warn(`Search term ${i + 1} failed`, { 
        searchTerm, 
        error: error.message 
      });
      // Continue to next search term
    }
  }
  
  // STRATEGY 3: ARTIST-ONLY SEARCH (Last resort)
  if (primaryArtist) {
    try {
      const artistUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(primaryArtist)}&type=track&limit=20`;
      
      const response = await makeSpotifyRequest(artistUrl);
      
      const tracks = response.data?.tracks?.items || [];
      
      if (tracks.length > 0) {
        let bestMatch = null;
        let bestScore = -1;
        
        for (const track of tracks) {
          const score = calculateUniversalSimilarity(appleTrack, track, 'apple', 'spotify');
          
          if (score > bestScore && score >= 40) { // Very low threshold for artist-only
            bestMatch = track;
            bestScore = score;
          }
        }
        
        if (bestMatch && bestScore >= 40) {
          const matchTime = Date.now() - startTime;
          
          return {
            success: true,
            id: bestMatch.id,
            match: bestMatch,
            matchMethod: 'ARTIST_ONLY',
            matchTime: matchTime,
            confidence: 'low',
            score: bestScore
          };
        }
      }
    } catch (error) {
      // Final fallback failed
    }
  }
  
  // No match found after all strategies
  return {
    success: false,
    id: null,
    match: null,
    unavailable: true,
    matchTime: Date.now() - startTime
  };
}

// Generate multiple search terms for better matching
function generateSearchTerms(appleTrack) {
  const terms = [];
  const name = appleTrack.name || '';
  const artist = appleTrack.artists?.[0] || '';
  const album = appleTrack.album || '';
  
  // Term 1: Full metadata
  if (name && artist && album) {
    terms.push(`${name} ${artist} ${album}`);
  }
  
  // Term 2: Name + Artist
  if (name && artist) {
    terms.push(`${name} ${artist}`);
  }
  
  // Term 3: Artist + Name (reversed)
  if (name && artist) {
    terms.push(`${artist} ${name}`);
  }
  
  // Term 4: Clean name + artist (remove special chars)
  if (name && artist) {
    const cleanName = name.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanArtist = artist.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    terms.push(`${cleanName} ${cleanArtist}`);
  }
  
  // Term 5: Primary artist only (for collaborations)
  if (artist) {
    const primaryArtist = artist.split(/\s+(feat\.?|featuring|ft\.?|&|and|with)\s+/i)[0].trim();
    if (primaryArtist && primaryArtist !== artist) {
      terms.push(`${name} ${primaryArtist}`);
    }
  }
  
  // Term 6: Just the song name (for very common songs)
  if (name) {
    terms.push(name);
  }
  
  return terms;
}

// Find best ISRC match (prefer exact album matches)
function findBestISRCMatch(appleTrack, tracks) {
  const srcAlbumNorm = normalizeScoreTerm(appleTrack.album || '');
  
  // Prefer exact album match
  const exactAlbumMatch = tracks.find(track => 
    normalizeScoreTerm(track.album?.name || '') === srcAlbumNorm
  );
  
  if (exactAlbumMatch) return exactAlbumMatch;
  
  // Fall back to first ISRC match
  return tracks[0];
}

// Enhanced scoring algorithm with version preference and strict vetoes
function calculateEnhancedScore(appleTrack, candidate, searchTerm) {
  let score = 0;
  
  // Duration Veto System - Reject matches with >3500ms difference (SongShift-level strictness)
  const srcDuration = Number(appleTrack.duration_ms) || 0;
  const candDuration = Number(candidate.duration_ms) || 0;
  
  if (srcDuration > 0 && candDuration > 0) {
    const durationDiff = Math.abs(candDuration - srcDuration);
    
    // TIGHTEN VETO: If difference is > 3.5 seconds, veto the match
    if (durationDiff > 3500) { 
      return 0; // Veto: Returns 0 score
    }
  }
  
  // Title similarity (40 points maximum)
  const titleSimilarity = stringSimilarity(
    normalizeScoreTerm(appleTrack.name || ''),
    normalizeScoreTerm(candidate.name || '')
  );
  score += titleSimilarity * 40;
  
  // Artist similarity (40 points maximum)
  const artistSimilarity = stringSimilarity(
    normalizeScoreTerm(appleTrack.artists?.[0] || ''),
    normalizeScoreTerm(candidate.artists?.[0]?.name || '')
  );
  score += artistSimilarity * 40;
  
  // Album similarity (10 points maximum)
  const albumSimilarity = stringSimilarity(
    normalizeScoreTerm(appleTrack.album || ''),
    normalizeScoreTerm(candidate.album?.name || '')
  );
  score += albumSimilarity * 10;
  
  // Duration bonus (10 points maximum for ≤2000ms proximity)
  if (srcDuration > 0 && candDuration > 0) {
    const durationDiff = Math.abs(candDuration - srcDuration);
    if (durationDiff <= 2000) {
      score += 10; // High duration bonus
    } else if (durationDiff <= 3000) {
      score += 5;
    }
  }
  
  // Version Preference Bonus/Penalty (NEW)
  const versionScore = calculateVersionPreferenceScore(appleTrack, candidate);
  score += versionScore;
  
  // Search term relevance bonus
  const searchTermNorm = normalizeScoreTerm(searchTerm);
  const candidateText = normalizeScoreTerm(`${candidate.name} ${candidate.artists?.[0]?.name || ''} ${candidate.album?.name || ''}`);
  if (candidateText.includes(searchTermNorm)) {
    score += 10;
  }
  
  return Math.min(100, Math.round(score));
}

// Version preference scoring - prioritizes original versions over remasters/live/explicit
function calculateVersionPreferenceScore(appleTrack, candidate) {
  let versionScore = 0;
  
  const candidateName = normalizeScoreTerm(candidate.name || '');
  const candidateAlbum = normalizeScoreTerm(candidate.album?.name || '');
  const sourceAlbum = normalizeScoreTerm(appleTrack.album || '');
  
  // Check for version indicators in candidate
  const isLive = /\b(live|concert|ao\s+vivo|en\s+vivo)\b/i.test(candidateName) || /\b(live|concert)\b/i.test(candidateAlbum);
  const isRemaster = /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(candidateName) || /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(candidateAlbum);
  const isExplicit = /\b(explicit|clean|radio\s+edit|single\s+version)\b/i.test(candidateName) || /\b(explicit|clean|radio\s+edit|single\s+version)\b/i.test(candidateAlbum);
  const isInstrumental = /\b(instrumental|karaoke)\b/i.test(candidateName) || /\b(instrumental|karaoke)\b/i.test(candidateAlbum);
  const isAcoustic = /\b(acoustic|unplugged|stripped)\b/i.test(candidateName) || /\b(acoustic|unplugged|stripped)\b/i.test(candidateAlbum);
  
  // Check for version indicators in source
  const sourceIsLive = /\b(live|concert|ao\s+vivo|en\s+vivo)\b/i.test(appleTrack.name || '') || /\b(live|concert)\b/i.test(sourceAlbum);
  const sourceIsRemaster = /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(appleTrack.name || '') || /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(sourceAlbum);
  const sourceIsInstrumental = /\b(instrumental|karaoke)\b/i.test(appleTrack.name || '') || /\b(instrumental|karaoke)\b/i.test(sourceAlbum);
  const sourceIsAcoustic = /\b(acoustic|unplugged|stripped)\b/i.test(appleTrack.name || '') || /\b(acoustic|unplugged|stripped)\b/i.test(sourceAlbum);
  
  // Version matching bonuses - prioritize EXACT version match with source
  if (sourceIsLive && isLive) versionScore += 20; // Strong bonus for live when source is live
  else if (!sourceIsLive && !isLive) versionScore += 15; // Good bonus for non-live when source is non-live
  else if (sourceIsLive && !isLive) versionScore -= 25; // Heavy penalty for non-live when source is live
  else if (!sourceIsLive && isLive) versionScore -= 20; // Heavy penalty for live when source is non-live
  
  if (sourceIsRemaster && isRemaster) versionScore += 15; // Strong bonus for remaster when source is remaster
  else if (!sourceIsRemaster && !isRemaster) versionScore += 10; // Good bonus for non-remaster when source is non-remaster
  else if (sourceIsRemaster && !isRemaster) versionScore -= 15; // Heavy penalty for non-remaster when source is remaster
  else if (!sourceIsRemaster && isRemaster) versionScore -= 10; // Penalty for remaster when source is non-remaster
  
  // Better explicit matching - check Apple Music content rating and Spotify explicit flag
  const appleExplicit = appleTrack.contentRating === 'explicit';
  const spotifyExplicit = candidate.explicit || false;
  
  // Check for explicit indicators in names
  const sourceNameExplicit = /\b(explicit|🅴|e\b)\b/i.test(appleTrack.name || '') || /\b(explicit|🅴|e\b)\b/i.test(sourceAlbum);
  const candidateNameExplicit = /\b(explicit|🅴|e\b)\b/i.test(candidateName) || /\b(explicit|🅴|e\b)\b/i.test(candidateAlbum);
  
  // Check for clean indicators
  const sourceClean = /\b(clean|radio\s+edit|radio\s+version)\b/i.test(appleTrack.name || '') || /\b(clean|radio\s+edit|radio\s+version)\b/i.test(sourceAlbum);
  const candidateClean = /\b(clean|radio\s+edit|radio\s+version)\b/i.test(candidateName) || /\b(clean|radio\s+edit|radio\s+version)\b/i.test(candidateAlbum);
  
  // Determine explicit status
  const sourceIsExplicit = appleExplicit || sourceNameExplicit;
  const candidateIsExplicit = spotifyExplicit || candidateNameExplicit;
  
  // Version matching with moderate penalties
  if (sourceIsExplicit && candidateIsExplicit) versionScore += 15; // Bonus for explicit when source is explicit
  else if (!sourceIsExplicit && !candidateIsExplicit) versionScore += 15; // Bonus for clean when source is clean
  else if (sourceIsExplicit && !candidateIsExplicit) versionScore -= 15; // Moderate penalty for clean when source is explicit
  else if (!sourceIsExplicit && candidateIsExplicit) versionScore -= 15; // Moderate penalty for explicit when source is clean
  
  if (sourceIsInstrumental && isInstrumental) versionScore += 20; // Strong bonus for instrumental when source is instrumental
  else if (!sourceIsInstrumental && !isInstrumental) versionScore += 15; // Good bonus for vocal when source is vocal
  else if (sourceIsInstrumental && !isInstrumental) versionScore -= 25; // Heavy penalty for vocal when source is instrumental
  else if (!sourceIsInstrumental && isInstrumental) versionScore -= 20; // Heavy penalty for instrumental when source is vocal
  
  if (sourceIsAcoustic && isAcoustic) versionScore += 15; // Strong bonus for acoustic when source is acoustic
  else if (!sourceIsAcoustic && !isAcoustic) versionScore += 10; // Good bonus for studio when source is studio
  else if (sourceIsAcoustic && !isAcoustic) versionScore -= 15; // Penalty for studio when source is acoustic
  else if (!sourceIsAcoustic && isAcoustic) versionScore -= 10; // Penalty for acoustic when source is studio
  
  // Album name matching bonus (prefer same album)
  if (sourceAlbum && candidateAlbum && sourceAlbum === candidateAlbum) {
    versionScore += 20; // Strong bonus for exact album match
  }
  
  return versionScore;
}

// Artist-only scoring (for when we only have artist info)
function calculateArtistOnlyScore(appleTrack, candidate) {
  let score = 0;
  
  // Artist similarity (70% weight)
  const artistSimilarity = stringSimilarity(
    normalizeScoreTerm(appleTrack.artists?.[0] || ''),
    normalizeScoreTerm(candidate.artists?.[0]?.name || '')
  );
  score += artistSimilarity * 70;
  
  // Title similarity (30% weight)
  const titleSimilarity = stringSimilarity(
    normalizeScoreTerm(appleTrack.name || ''),
    normalizeScoreTerm(candidate.name || '')
  );
  score += titleSimilarity * 30;
  
  return Math.min(100, Math.round(score));
}

// Light normalization for API search queries (retains edition tags)
function normalizeSearchTerm(str) {
  if (!str || typeof str !== 'string') return '';
  
  // Remove featured artists from search queries but retain edition tags
  const withoutFeatures = str
    .replace(/\(feat\.?\s[^)]*\)/gi, '')
    .replace(/\(featuring\s[^)]*\)/gi, '')
    .replace(/\(ft\.?\s[^)]*\)/gi, '')
    .replace(/\(with\s[^)]*\)/gi, '');
  
  // Light normalization - only clean up excessive spaces and common symbols
  const normalized = withoutFeatures
    .toLowerCase()
    .replace(/&/g, ' and ') // Standardize '&' to 'and'
    .replace(/[""''`]/g, '') // Remove smart quotes and backticks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
}

// Aggressive normalization for scoring (strips all edition/version tags)
function normalizeScoreTerm(str) {
  if (!str || typeof str !== 'string') return '';
  
  const lowered = str.toLowerCase();
  const removedParens = lowered.replace(/\([^)]*\)/g, ' ');
  const removedBrackets = removedParens.replace(/\[[^\]]*\]/g, ' ');
  
  // Layer 1: Aggressive punctuation and character normalization
  const normalizedChars = removedBrackets
    .replace(/[-–—/]/g, ' ') // Replace dashes and slashes with spaces
    .replace(/&/g, ' and ') // Standardize '&' to 'and'
    .replace(/[""''`]/g, '') // Remove smart quotes and backticks
    .replace(/[^\w\s]/g, ' '); // Remove all other punctuation
  
  // Layer 2: Expanded qualifier removal list based on Gemini analysis
  const removedQualifiers = normalizedChars
    .replace(/\b(remaster(?:ed)?|deluxe(?:\sedition)?|explicit|clean|bonus\strack(?:s)?|single|album\sversion|radio\sedit|original\smix|version|mono|stereo|spatial|dolby|feat\.?|featuring|live\sat\s\[venue\]|live\sacoustic|radio\smix|club\smix|pt\.\s\[number\]|remastered\s\[year\]|\[year\]\smix|\[year\]\sversion|from\sthe\s\[film\/album\]|anniversary\sedition|expanded\sedition|special\sedition|collector\sedition|limited\sedition|import|digital\sversion|extended\sversion|short\sversion|instrumental|karaoke|unplugged|stripped|acoustic|live|concert|bootleg|vip\smix|rework|edit|part\s\d+|pt\.\s\d+|chapter\s\d+|track\s\d+)\b/g, ' ');
  
  // Layer 3: Accent and diacritic removal for foreign characters
  const removedAccents = removedQualifiers
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents and diacritics
  
  return removedAccents.replace(/\s+/g, ' ').trim();
}

// String similarity (Levenshtein-based)
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

// UNIVERSAL similarity calculation - uses universal converter
function calculateFastSimilarity(appleTrack, spotifyTrack) {
  // Use universal similarity calculator
  return calculateUniversalSimilarity(appleTrack, spotifyTrack, 'apple', 'spotify');
}

module.exports = {
  enhancedSpotifyMatcher,
  setSpotifyTokens,
  calculateEnhancedScore,
  normalizeSearchTerm,
  normalizeScoreTerm,
  stringSimilarity,
  calculateVersionPreferenceScore,
  calculateFastSimilarity
};
