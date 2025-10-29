/**
 * Enhanced SongShift-Level Matching - Finds Missing Songs
 * Addresses the 38 missing songs that SongShift finds but SyncMyPlays doesn't
 * Optimized for SongShift-level accuracy (97%+) with dual normalization system
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Import advanced matching functions for better normalization
const { normalizeString: advancedNormalize, getTrackVariantType, stringSimilarity: advancedStringSimilarity } = require('./advancedMatcher');

// Rate limiting for Apple Music API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // 200ms between requests to avoid 429 errors

async function makeAppleMusicRequest(url, headers, timeout = 2000) {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
  
  try {
    const response = await axios.get(url, { headers, timeout });
    return response;
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limited - wait longer and retry
      logger.info(`Rate limited, waiting 2 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      lastRequestTime = Date.now();
      return await axios.get(url, { headers, timeout });
    }
    throw error;
  }
}

// Enhanced matching with multiple search strategies
async function enhancedSongshiftMatch(sourceTrack, appleHeaders, storefront = 'us') {
  const startTime = Date.now();
  
  // STRATEGY 1: ISRC Matching (Primary - like SongShift)
  if (sourceTrack.isrc) {
    try {
      const isrcUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?filter[isrc]=${encodeURIComponent(sourceTrack.isrc)}`;
      
      const response = await makeAppleMusicRequest(isrcUrl, appleHeaders, 2000);
      
      const songs = response.data?.data || [];
      
      if (songs.length > 0) {
        const bestMatch = findBestISRCMatch(sourceTrack, songs);
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
          alternatives: songs.slice(1, 6),
          unavailable: false
        };
      }
    } catch (error) {
      logger.info(`ISRC lookup failed for ${sourceTrack.name}: ${error.message}`);
    }
  }
  
  // STRATEGY 2: Album-First Search (Find exact album matches)
  if (sourceTrack.album && sourceTrack.artists?.[0]) {
    try {
      // Search by album name + artist first to find exact album
      const albumSearchTerm = normalizeSearchTerm(`${sourceTrack.album} ${sourceTrack.artists[0]}`.trim());
      const albumSearchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(albumSearchTerm)}&types=albums&limit=5`;
      
      const albumResponse = await makeAppleMusicRequest(albumSearchUrl, appleHeaders, 2000);
      
      const albums = albumResponse.data?.results?.albums?.data || [];
      
      if (albums.length > 0) {
        // Find the best album match
        const bestAlbum = albums.find(album => {
          const albumName = normalizeScoreTerm(album.attributes?.name || '');
          const srcAlbum = normalizeScoreTerm(sourceTrack.album || '');
          return albumName === srcAlbum || albumName.includes(srcAlbum) || srcAlbum.includes(albumName);
        }) || albums[0];
        
        if (bestAlbum) {
          // Search for the specific song within this album
          const songInAlbumSearchTerm = normalizeSearchTerm(`${sourceTrack.name} ${sourceTrack.artists[0]}`.trim());
          const songInAlbumUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(songInAlbumSearchTerm)}&types=songs&limit=20`;
          
          const songResponse = await makeAppleMusicRequest(songInAlbumUrl, appleHeaders, 2000);
          
          const songs = songResponse.data?.results?.songs?.data || [];
          
          if (songs.length > 0) {
            // Filter songs from the target album
            const albumSongs = songs.filter(song => 
              song.attributes?.albumName === bestAlbum.attributes?.name
            );
            
            if (albumSongs.length > 0) {
              const scoredSongs = albumSongs.map(song => ({
                ...song,
                score: calculateEnhancedScore(sourceTrack, song.attributes, songInAlbumSearchTerm) + 25 // Extra boost for album match
              })).sort((a, b) => b.score - a.score);
              
              const bestMatch = scoredSongs[0];
              const matchTime = Date.now() - startTime;
              
              if (bestMatch.score >= 70) {
                return {
                  success: true,
                  match: {
                    id: bestMatch.id,
                    type: bestMatch.type,
                    attributes: bestMatch.attributes,
                    matchMethod: 'ALBUM_MATCH',
                    matchTime: matchTime,
                    confidence: bestMatch.score >= 85 ? 'high' : 'medium',
                    score: bestMatch.score
                  },
                  alternatives: scoredSongs.slice(1, 6),
                  unavailable: false
                };
              }
            }
          }
        }
      }
    } catch (error) {
      logger.info(`Album search failed for "${sourceTrack.album}": ${error.message}`);
    }
  }
  
  // STRATEGY 3: Single Fast Search (SongShift-style)
  const searchTerm = normalizeSearchTerm(`${sourceTrack.name} ${sourceTrack.artists?.[0] || ''}`.trim());
  
  try {
    const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(searchTerm)}&types=songs&limit=10`;
    
    const response = await makeAppleMusicRequest(searchUrl, appleHeaders, 2000);
    
    const songs = response.data?.results?.songs?.data || [];
    
    if (songs.length > 0) {
      const scoredSongs = songs.map(song => ({
        ...song,
        score: calculateEnhancedScore(sourceTrack, song.attributes, searchTerm)
      })).sort((a, b) => b.score - a.score);
      
      // Album consistency check - prioritize matches on the same album (STRONGER)
      const srcAlbumNorm = normalizeScoreTerm(sourceTrack.album || '');
      if (srcAlbumNorm) {
        const albumMatches = scoredSongs.filter(song => {
          const candidateAlbum = normalizeScoreTerm(song.attributes?.albumName || '');
          return candidateAlbum === srcAlbumNorm || 
                 candidateAlbum.includes(srcAlbumNorm) || 
                 srcAlbumNorm.includes(candidateAlbum);
        });
        if (albumMatches.length > 0) {
          // Reorder to prioritize album matches and boost their scores
          const nonAlbumMatches = scoredSongs.filter(song => {
            const candidateAlbum = normalizeScoreTerm(song.attributes?.albumName || '');
            return candidateAlbum !== srcAlbumNorm && 
                   !candidateAlbum.includes(srcAlbumNorm) && 
                   !srcAlbumNorm.includes(candidateAlbum);
          });
          
          // Boost album match scores by 20 points (increased from 15)
          albumMatches.forEach(song => {
            song.score += 20;
          });
          
          scoredSongs.splice(0, scoredSongs.length, ...albumMatches, ...nonAlbumMatches);
        }
      }
      
      const bestMatch = scoredSongs[0];
      const matchTime = Date.now() - startTime;
      
      if (bestMatch.score >= 70) { // Lower threshold for more matches
        // Artist Similarity Veto - Reject matches with <80% artist similarity
        const artistSim = stringSimilarity(
          normalizeScoreTerm(sourceTrack.artists?.[0] || ''), 
          normalizeScoreTerm(bestMatch.attributes?.artistName || '')
        );
        
        if (artistSim < 0.8) {
          // Artist mismatch despite high score - veto for SongShift accuracy
          logger.info(`Artist veto: "${sourceTrack.artists?.[0]}" vs "${bestMatch.attributes?.artistName}" (${Math.round(artistSim * 100)}%)`);
          // Continue to next strategy instead of returning failure
        } else {
          return {
            success: true,
            match: {
              id: bestMatch.id,
              type: bestMatch.type,
              attributes: bestMatch.attributes,
              matchMethod: 'METADATA',
              matchTime: matchTime,
              confidence: bestMatch.score >= 85 ? 'high' : 'medium',
              score: bestMatch.score
            },
            alternatives: scoredSongs.slice(1, 6),
            unavailable: false
          };
        }
      }
    }
  } catch (error) {
    logger.info(`Search failed for "${searchTerm}": ${error.message}`);
  }
  
  // STRATEGY 4: Artist-Only Search (For missing songs)
  if (sourceTrack.artists && sourceTrack.artists.length > 0) {
    try {
      const artistSearch = normalizeSearchTerm(sourceTrack.artists[0]);
      const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(artistSearch)}&types=songs&limit=15`;
      
      const response = await makeAppleMusicRequest(searchUrl, appleHeaders, 1500);
      
      const songs = response.data?.results?.songs?.data || [];
      
      if (songs.length > 0) {
        const scoredSongs = songs.map(song => ({
          ...song,
          score: calculateArtistOnlyScore(sourceTrack, song.attributes)
        })).sort((a, b) => b.score - a.score);
        
        const bestMatch = scoredSongs[0];
        const matchTime = Date.now() - startTime;
        
        if (bestMatch.score >= 60) { // Even lower threshold for artist-only
          return {
            success: true,
            match: {
              id: bestMatch.id,
              type: bestMatch.type,
              attributes: bestMatch.attributes,
              matchMethod: 'ARTIST_ONLY',
              matchTime: matchTime,
              confidence: 'low',
              score: bestMatch.score
            },
            alternatives: scoredSongs.slice(1, 10),
            unavailable: false
          };
        }
      }
    } catch (error) {
      logger.info(`Artist search failed for ${sourceTrack.artists[0]}: ${error.message}`);
    }
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

// Generate multiple search terms for better matching
function generateSearchTerms(sourceTrack) {
  const terms = [];
  const name = sourceTrack.name || '';
  const artist = sourceTrack.artists?.[0] || '';
  const album = sourceTrack.album || '';
  
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
  
  // Term 5: Just the song name (for very common songs)
  if (name) {
    terms.push(name);
  }
  
  return terms;
}

// Find best ISRC match (prefer exact album matches)
function findBestISRCMatch(sourceTrack, songs) {
  const srcAlbumNorm = normalizeScoreTerm(sourceTrack.album || '');
  
  // Prefer exact album match
  const exactAlbumMatch = songs.find(song => 
    normalizeScoreTerm(song.attributes?.albumName || '') === srcAlbumNorm
  );
  
  if (exactAlbumMatch) return exactAlbumMatch;
  
  // Fall back to first ISRC match
  return songs[0];
}

// Enhanced scoring algorithm with version preference and strict vetoes
function calculateEnhancedScore(sourceTrack, candidate, searchTerm) {
  let score = 0;
  
  // Duration Veto System - Reject matches with >3500ms difference (SongShift-level strictness)
  const srcDuration = Number(sourceTrack.duration_ms) || 0;
  const candDuration = Number(candidate.durationInMillis) || 0;
  
  if (srcDuration > 0 && candDuration > 0) {
    const durationDiff = Math.abs(candDuration - srcDuration);
    
    // TIGHTEN VETO: If difference is > 3.5 seconds, veto the match
    if (durationDiff > 3500) { 
      return 0; // Veto: Returns 0 score
    }
  }
  
  // Title similarity (40 points maximum)
  const titleSimilarity = stringSimilarity(
    normalizeScoreTerm(sourceTrack.name || ''),
    normalizeScoreTerm(candidate.name || '')
  );
  score += titleSimilarity * 40;
  
  // Artist similarity (40 points maximum)
  const artistSimilarity = stringSimilarity(
    normalizeScoreTerm(sourceTrack.artists?.[0] || ''),
    normalizeScoreTerm(candidate.artistName || '')
  );
  score += artistSimilarity * 40;
  
  // Album similarity (10 points maximum)
  const albumSimilarity = stringSimilarity(
    normalizeScoreTerm(sourceTrack.album || ''),
    normalizeScoreTerm(candidate.albumName || '')
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
  const versionScore = calculateVersionPreferenceScore(sourceTrack, candidate);
  score += versionScore;
  
  // Search term relevance bonus
  const searchTermNorm = normalizeScoreTerm(searchTerm);
  const candidateText = normalizeScoreTerm(`${candidate.name} ${candidate.artistName} ${candidate.albumName}`);
  if (candidateText.includes(searchTermNorm)) {
    score += 10;
  }
  
  return Math.min(100, Math.round(score));
}

// Version preference scoring - prioritizes original versions over remasters/live/explicit
function calculateVersionPreferenceScore(sourceTrack, candidate) {
  let versionScore = 0;
  
  const candidateName = normalizeScoreTerm(candidate.name || '');
  const candidateAlbum = normalizeScoreTerm(candidate.albumName || '');
  const sourceAlbum = normalizeScoreTerm(sourceTrack.album || '');
  
  // Check for version indicators in candidate
  const isLive = /\b(live|concert|ao\s+vivo|en\s+vivo)\b/i.test(candidateName) || /\b(live|concert)\b/i.test(candidateAlbum);
  const isRemaster = /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(candidateName) || /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(candidateAlbum);
  const isExplicit = /\b(explicit|clean|radio\s+edit|single\s+version)\b/i.test(candidateName) || /\b(explicit|clean|radio\s+edit|single\s+version)\b/i.test(candidateAlbum);
  const isInstrumental = /\b(instrumental|karaoke)\b/i.test(candidateName) || /\b(instrumental|karaoke)\b/i.test(candidateAlbum);
  const isAcoustic = /\b(acoustic|unplugged|stripped)\b/i.test(candidateName) || /\b(acoustic|unplugged|stripped)\b/i.test(candidateAlbum);
  
  // Check for version indicators in source
  const sourceIsLive = /\b(live|concert|ao\s+vivo|en\s+vivo)\b/i.test(sourceTrack.name || '') || /\b(live|concert)\b/i.test(sourceAlbum);
  const sourceIsRemaster = /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(sourceTrack.name || '') || /\b(remaster|remastered|anniversary|deluxe|expanded|special|collector|limited)\b/i.test(sourceAlbum);
  const sourceIsInstrumental = /\b(instrumental|karaoke)\b/i.test(sourceTrack.name || '') || /\b(instrumental|karaoke)\b/i.test(sourceAlbum);
  const sourceIsAcoustic = /\b(acoustic|unplugged|stripped)\b/i.test(sourceTrack.name || '') || /\b(acoustic|unplugged|stripped)\b/i.test(sourceAlbum);
  
  // Version matching bonuses - prioritize EXACT version match with source
  if (sourceIsLive && isLive) versionScore += 20; // Strong bonus for live when source is live
  else if (!sourceIsLive && !isLive) versionScore += 15; // Good bonus for non-live when source is non-live
  else if (sourceIsLive && !isLive) versionScore -= 25; // Heavy penalty for non-live when source is live
  else if (!sourceIsLive && isLive) versionScore -= 20; // Heavy penalty for live when source is non-live
  
  if (sourceIsRemaster && isRemaster) versionScore += 15; // Strong bonus for remaster when source is remaster
  else if (!sourceIsRemaster && !isRemaster) versionScore += 10; // Good bonus for non-remaster when source is non-remaster
  else if (sourceIsRemaster && !isRemaster) versionScore -= 15; // Heavy penalty for non-remaster when source is remaster
  else if (!sourceIsRemaster && isRemaster) versionScore -= 10; // Penalty for remaster when source is non-remaster
  
  // Better explicit matching - check Spotify explicit flag and Apple Music content rating
  const sourceSpotifyExplicit = sourceTrack.explicit || false;
  const appleExplicit = candidate.contentRating === 'explicit';
  
  // Check for explicit indicators in names
  const sourceNameExplicit = /\b(explicit|🅴|e\b)\b/i.test(sourceTrack.name || '') || /\b(explicit|🅴|e\b)\b/i.test(sourceAlbum);
  const candidateNameExplicit = /\b(explicit|🅴|e\b)\b/i.test(candidateName) || /\b(explicit|🅴|e\b)\b/i.test(candidateAlbum);
  
  // Check for clean indicators
  const sourceClean = /\b(clean|radio\s+edit|radio\s+version)\b/i.test(sourceTrack.name || '') || /\b(clean|radio\s+edit|radio\s+version)\b/i.test(sourceAlbum);
  const candidateClean = /\b(clean|radio\s+edit|radio\s+version)\b/i.test(candidateName) || /\b(clean|radio\s+edit|radio\s+version)\b/i.test(candidateAlbum);
  
  // Determine explicit status
  const sourceIsExplicit = sourceSpotifyExplicit || sourceNameExplicit;
  const candidateIsExplicit = appleExplicit || candidateNameExplicit;
  
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
function calculateArtistOnlyScore(sourceTrack, candidate) {
  let score = 0;
  
  // Artist similarity (70% weight)
  const artistSimilarity = stringSimilarity(
    normalizeScoreTerm(sourceTrack.artists?.[0] || ''),
    normalizeScoreTerm(candidate.artistName || '')
  );
  score += artistSimilarity * 70;
  
  // Title similarity (30% weight)
  const titleSimilarity = stringSimilarity(
    normalizeScoreTerm(sourceTrack.name || ''),
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

// Batch processing with enhanced matching and duplicate prevention
async function enhancedBatchMatch(tracks, appleHeaders, storefront = 'us', progressCallback) {
  const results = {
    matched: [],
    needsReview: [],
    unavailable: []
  };
  
  // Track added songs to prevent duplicates
  const addedSongs = new Set();
  
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
      const result = await enhancedSongshiftMatch(track, appleHeaders, storefront);
      
      if (result.success && result.match) {
        // Create unique identifier for duplicate prevention
        const songKey = createSongKey(track, result.match);
        
        // Check if this song (or a version of it) has already been added
        if (addedSongs.has(songKey)) {
          logger.info(`🔄 Skipping duplicate: "${track.name}" by ${track.artists?.[0]} (already added)`);
          continue;
        }
        
        // Mark this song as added
        addedSongs.add(songKey);
        
        if (result.match.confidence === 'high') {
          results.matched.push({
            sourceTrack: track,
            match: result.match,
            alternatives: result.alternatives
          });
        } else {
          results.needsReview.push({
            sourceTrack: track,
            match: result.match,
            alternatives: result.alternatives
          });
        }
      } else {
        results.unavailable.push({
          sourceTrack: track,
          reason: 'not_found'
        });
      }
    } catch (error) {
      results.unavailable.push({
        sourceTrack: track,
        error: error.message
      });
    }
    
    // No delay - instant speed like SongShift
  }
  
  return results;
}

// Create unique key for duplicate prevention (based on exact string matches only)
function createSongKey(sourceTrack, match) {
  // Use exact original names for strict duplicate detection
  // Only remove exact string matches, not similar songs
  const exactName = (sourceTrack.name || '').trim();
  const exactArtist = (sourceTrack.artists?.[0] || '').trim();
  return `${exactName}|${exactArtist}`;
}

module.exports = {
  enhancedSongshiftMatch,
  enhancedBatchMatch,
  generateSearchTerms,
  calculateEnhancedScore,
  normalizeSearchTerm,
  normalizeScoreTerm,
  stringSimilarity,
  calculateVersionPreferenceScore,
  createSongKey
};