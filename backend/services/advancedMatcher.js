/**
 * Advanced Music Matching Service - SongShift-level accuracy
 * Implements multi-tier matching with variant detection and user review system
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Normalization utilities
function normalizeString(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a, b) {
  const tokensA = new Set(normalizeString(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeString(b).split(' ').filter(Boolean));
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
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

function stringSimilarity(a, b) {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(normA, normB);
  return 1 - (distance / maxLen);
}

// Track classification helpers
const isLive = (str) => /\b(live|ao\s+vivo|en\s+vivo|concert)\b/i.test(String(str || ''));
const isRemix = (str) => /\b(remix|rework|edit|bootleg|vip\s+mix)\b/i.test(String(str || ''));
const isAcoustic = (str) => /\b(acoustic|unplugged|stripped)\b/i.test(String(str || ''));
const isInstrumental = (str) => /\b(instrumental|karaoke)\b/i.test(String(str || ''));
const isRadioEdit = (str) => /\b(radio\s+edit|single\s+version|clean\s+version)\b/i.test(String(str || ''));
const isExplicit = (str) => /\b(explicit|dirty\s+version)\b/i.test(String(str || ''));
const isCompilation = (str) => /(greatest\s+hits|essentials|the\s+collection|best\s+of|antholog(y|ies)|the\s+very\s+best|collection|compilation)/i.test(String(str || ''));
const isRemaster = (str) => /\b(remaster(ed)?|anniversary\s+edition|deluxe\s+edition|expanded\s+edition)\b/i.test(String(str || ''));

function getTrackVariantType(trackName, albumName) {
  const variants = [];
  if (isLive(trackName) || isLive(albumName)) variants.push('live');
  if (isRemix(trackName)) variants.push('remix');
  if (isAcoustic(trackName)) variants.push('acoustic');
  if (isInstrumental(trackName)) variants.push('instrumental');
  if (isRadioEdit(trackName)) variants.push('radio_edit');
  if (isExplicit(trackName)) variants.push('explicit');
  if (isRemaster(trackName) || isRemaster(albumName)) variants.push('remaster');
  return variants.length > 0 ? variants : ['original'];
}

/**
 * Calculate comprehensive match score between source and candidate track
 */
function calculateMatchScore(sourceTrack, candidate) {
  const score = {
    total: 0,
    breakdown: {},
    confidence: 'low'
  };

  const srcName = normalizeString(sourceTrack.name || '');
  const srcArtist = normalizeString(sourceTrack.artists?.[0] || '');
  const srcAlbum = normalizeString(sourceTrack.album || '');
  const srcDuration = Number(sourceTrack.duration_ms) || 0;

  const candName = normalizeString(candidate.name || '');
  const candArtist = normalizeString(candidate.artistName || '');
  const candAlbum = normalizeString(candidate.albumName || '');
  const candDuration = Number(candidate.durationInMillis) || 0;

  // 1. Title Matching (40 points max)
  const titleSimilarity = stringSimilarity(srcName, candName);
  const titleScore = titleSimilarity * 40;
  score.breakdown.title = { similarity: titleSimilarity, score: titleScore };
  score.total += titleScore;

  // 2. Artist Matching (30 points max)
  const artistSimilarity = stringSimilarity(srcArtist, candArtist);
  const artistScore = artistSimilarity * 30;
  score.breakdown.artist = { similarity: artistSimilarity, score: artistScore };
  score.total += artistScore;

  // 3. Album Matching (20 points max)
  const albumSimilarity = stringSimilarity(srcAlbum, candAlbum);
  const albumScore = albumSimilarity * 20;
  score.breakdown.album = { similarity: albumSimilarity, score: albumScore };
  score.total += albumScore;

  // 4. Duration Matching (10 points max)
  let durationScore = 0;
  if (srcDuration > 0 && candDuration > 0) {
    const durationDiff = Math.abs(candDuration - srcDuration);
    if (durationDiff <= 2000) {
      durationScore = 10;
    } else if (durationDiff <= 5000) {
      durationScore = 7;
    } else if (durationDiff <= 10000) {
      durationScore = 4;
    }
  }
  score.breakdown.duration = { diff: Math.abs(candDuration - srcDuration), score: durationScore };
  score.total += durationScore;

  // 5. Variant Type Matching (bonus/penalty)
  const srcVariants = getTrackVariantType(sourceTrack.name, sourceTrack.album);
  const candVariants = getTrackVariantType(candidate.name, candidate.albumName);
  
  const variantMatch = srcVariants.some(v => candVariants.includes(v));
  const variantMismatch = srcVariants.includes('original') && !candVariants.includes('original');
  
  if (variantMatch && srcVariants[0] === candVariants[0]) {
    score.total += 5; // Bonus for exact variant match
    score.breakdown.variant = { match: true, bonus: 5 };
  } else if (variantMismatch) {
    score.total -= 10; // Penalty for variant mismatch
    score.breakdown.variant = { match: false, penalty: -10 };
  }

  // Determine confidence level
  if (score.total >= 90) {
    score.confidence = 'high';
  } else if (score.total >= 75) {
    score.confidence = 'medium';
  } else if (score.total >= 60) {
    score.confidence = 'low';
  } else {
    score.confidence = 'very_low';
  }

  return score;
}

/**
 * Advanced track matching with multi-variant detection
 * Returns: { match, alternatives, unavailable }
 */
async function findTrackWithVariants(sourceTrack, headers, storefront = 'us', apiRequestFunc) {
  const result = {
    sourceTrack,
    match: null,           // Best match (if confidence >= 75)
    alternatives: [],      // Alternative versions for user review
    unavailable: false,    // True if no matches found at all
    needsReview: false,    // True if match confidence < 90
    searchAttempts: []
  };

  const primaryArtist = sourceTrack.artists?.[0] || '';
  
  // TIER 1: ISRC Matching (Gold Standard)
  if (sourceTrack.isrc) {
    try {
      const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?filter[isrc]=${encodeURIComponent(sourceTrack.isrc)}`;
      const res = await apiRequestFunc(url, { headers });
      const data = res?.data?.data || [];
      
      result.searchAttempts.push({
        tier: 1,
        method: 'ISRC',
        query: sourceTrack.isrc,
        resultsCount: data.length
      });

      if (data.length > 0) {
        // Score all ISRC matches
        const scoredMatches = data.map(candidate => ({
          ...candidate,
          matchScore: calculateMatchScore(sourceTrack, candidate.attributes)
        })).sort((a, b) => b.matchScore.total - a.matchScore.total);

        // Best match
        const best = scoredMatches[0];
        if (best.matchScore.total >= 75) {
          result.match = {
            id: best.id,
            type: best.type,
            attributes: best.attributes,
            matchScore: best.matchScore,
            matchMethod: 'ISRC'
          };
          
          // Add alternatives (other ISRC matches with decent scores)
          result.alternatives = scoredMatches.slice(1, 6)
            .filter(m => m.matchScore.total >= 60)
            .map(m => ({
              id: m.id,
              type: m.type,
              attributes: m.attributes,
              matchScore: m.matchScore,
              matchMethod: 'ISRC_ALT'
            }));
          
          result.needsReview = best.matchScore.confidence !== 'high';
          return result;
        }
      }
    } catch (error) {
      logger.error('ISRC search failed:', error.message);
    }
  }

  // TIER 2: Precise Metadata Search
  try {
    const searchTerms = [
      sourceTrack.name,
      primaryArtist,
      sourceTrack.album
    ].filter(Boolean).map(normalizeString).join(' ').substring(0, 200);

    const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(searchTerms)}&types=songs&limit=25`;
    const res = await apiRequestFunc(url, { headers });
    const songs = res?.data?.results?.songs?.data || [];
    
    result.searchAttempts.push({
      tier: 2,
      method: 'Precise Metadata',
      query: searchTerms,
      resultsCount: songs.length
    });

    if (songs.length > 0) {
      // Score all candidates
      const scoredMatches = songs.map(candidate => ({
        ...candidate,
        matchScore: calculateMatchScore(sourceTrack, candidate.attributes)
      })).sort((a, b) => b.matchScore.total - a.matchScore.total);

      // Best match
      const best = scoredMatches[0];
      if (best.matchScore.total >= 75) {
        result.match = {
          id: best.id,
          type: best.type,
          attributes: best.attributes,
          matchScore: best.matchScore,
          matchMethod: 'Metadata_Precise'
        };
        
        // Add top alternatives
        result.alternatives = scoredMatches.slice(1, 10)
          .filter(m => m.matchScore.total >= 50)
          .map(m => ({
            id: m.id,
            type: m.type,
            attributes: m.attributes,
            matchScore: m.matchScore,
            matchMethod: 'Metadata_Alt'
          }));
        
        result.needsReview = best.matchScore.confidence !== 'high';
        return result;
      } else if (scoredMatches.length > 0) {
        // Low confidence matches - all need review
        result.alternatives = scoredMatches.filter(m => m.matchScore.total >= 40)
          .slice(0, 10)
          .map(m => ({
            id: m.id,
            type: m.type,
            attributes: m.attributes,
            matchScore: m.matchScore,
            matchMethod: 'Metadata_Low_Confidence'
          }));
        result.needsReview = true;
        
        if (result.alternatives.length > 0) {
          return result;
        }
      }
    }
  } catch (error) {
    logger.error('Metadata search failed:', error.message);
  }

  // TIER 3: Flexible Search (Artist + Title only)
  try {
    const flexibleTerms = [sourceTrack.name, primaryArtist]
      .filter(Boolean)
      .map(normalizeString)
      .join(' ')
      .substring(0, 150);

    const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(flexibleTerms)}&types=songs&limit=25`;
    const res = await apiRequestFunc(url, { headers });
    const songs = res?.data?.results?.songs?.data || [];
    
    result.searchAttempts.push({
      tier: 3,
      method: 'Flexible Search',
      query: flexibleTerms,
      resultsCount: songs.length
    });

    if (songs.length > 0) {
      const scoredMatches = songs.map(candidate => ({
        ...candidate,
        matchScore: calculateMatchScore(sourceTrack, candidate.attributes)
      }))
      .filter(m => m.matchScore.total >= 40) // Only consider reasonable matches
      .sort((a, b) => b.matchScore.total - a.matchScore.total);

      if (scoredMatches.length > 0) {
        result.alternatives = scoredMatches.slice(0, 10).map(m => ({
          id: m.id,
          type: m.type,
          attributes: m.attributes,
          matchScore: m.matchScore,
          matchMethod: 'Flexible_Search'
        }));
        result.needsReview = true;
        return result;
      }
    }
  } catch (error) {
    logger.error('Flexible search failed:', error.message);
  }

  // No matches found - mark as unavailable
  result.unavailable = true;
  return result;
}

/**
 * Process batch of tracks with variant detection
 */
async function processBatchWithReview(tracks, headers, storefront, apiRequestFunc, progressCallback) {
  const results = {
    autoMatched: [],      // High confidence matches (score >= 90)
    needsReview: [],      // Medium/low confidence matches
    unavailable: []       // No matches found
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

    const matchResult = await findTrackWithVariants(track, headers, storefront, apiRequestFunc);
    
    if (matchResult.unavailable) {
      results.unavailable.push(matchResult);
    } else if (matchResult.match && matchResult.match.matchScore.confidence === 'high') {
      results.autoMatched.push(matchResult);
    } else {
      results.needsReview.push(matchResult);
    }

    // Rate limiting
    // No delay - instant speed
  }

  return results;
}

module.exports = {
  normalizeString,
  jaccardSimilarity,
  stringSimilarity,
  calculateMatchScore,
  findTrackWithVariants,
  processBatchWithReview,
  getTrackVariantType
};

