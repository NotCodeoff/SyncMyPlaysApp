/**
 * Advanced Sync Routes - SongShift-level matching with user review
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const {
  findTrackWithVariants,
  processBatchWithReview
} = require('../services/advancedMatcher');

// Store pending reviews in memory (use Redis/DB in production)
const pendingReviews = new Map();

/**
 * POST /api/sync/advanced/prepare
 * Prepare playlist transfer with variant detection
 * Body: { sourceService, sourcePlaylistId, destinationService, storefront }
 */
router.post('/prepare', async (req, res) => {
  try {
    const { sourceService, sourcePlaylistId, destinationService, storefront = 'us' } = req.body;
    
    if (!sourceService || !sourcePlaylistId || !destinationService) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Generate session ID for this transfer
    const sessionId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      sessionId,
      message: 'Transfer preparation started. Use /status endpoint to track progress.'
    });

    // Process async
    processTransferAsync(sessionId, sourceService, sourcePlaylistId, destinationService, storefront, req.app.locals);
    
  } catch (error) {
    logger.error('Prepare transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sync/advanced/status/:sessionId
 * Get transfer status and review items
 */
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = pendingReviews.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session);
});

/**
 * POST /api/sync/advanced/review/:sessionId
 * Submit user review choices
 * Body: { decisions: [{ trackIndex, action: 'select'|'ignore', selectedVariantId }] }
 */
router.post('/review/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { decisions } = req.body;
    
    const session = pendingReviews.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status !== 'needs_review') {
      return res.status(400).json({ error: 'Session not in review state' });
    }
    
    // Process decisions
    const finalizedTracks = [];
    
    for (const decision of decisions) {
      const reviewItem = session.results.needsReview[decision.trackIndex];
      if (!reviewItem) continue;
      
      if (decision.action === 'select' && decision.selectedVariantId) {
        // Find selected variant
        const variant = [reviewItem.match, ...reviewItem.alternatives]
          .find(v => v && v.id === decision.selectedVariantId);
        
        if (variant) {
          finalizedTracks.push({
            sourceTrack: reviewItem.sourceTrack,
            selectedMatch: variant,
            userSelected: true
          });
        }
      } else if (decision.action === 'ignore') {
        // User chose to skip this track
        finalizedTracks.push({
          sourceTrack: reviewItem.sourceTrack,
          selectedMatch: null,
          userIgnored: true
        });
      }
    }
    
    // Update session
    session.reviewedTracks = finalizedTracks;
    session.status = 'reviewed';
    session.reviewedAt = new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Review submitted successfully',
      finalizedCount: finalizedTracks.filter(t => t.selectedMatch).length,
      ignoredCount: finalizedTracks.filter(t => t.userIgnored).length
    });
    
  } catch (error) {
    logger.error('Review submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/advanced/execute/:sessionId
 * Execute the transfer after review
 */
router.post('/execute/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = pendingReviews.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status === 'processing') {
      return res.status(400).json({ error: 'Transfer already in progress' });
    }
    
    session.status = 'executing';
    
    res.json({
      success: true,
      message: 'Transfer execution started'
    });
    
    // Execute async
    executeTransferAsync(sessionId, req.app.locals);
    
  } catch (error) {
    logger.error('Execute transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Async processing functions
async function processTransferAsync(sessionId, sourceService, sourcePlaylistId, destinationService, storefront, appLocals) {
  const session = {
    sessionId,
    sourceService,
    sourcePlaylistId,
    destinationService,
    storefront,
    status: 'processing',
    progress: { current: 0, total: 0 },
    results: null,
    createdAt: new Date().toISOString()
  };
  
  pendingReviews.set(sessionId, session);
  
  try {
    // Get required functions from app locals
    const {
      fetchSpotifyPlaylistTracks,
      getDeveloperToken,
      appleCredentials,
      makeAppleMusicApiRequest
    } = appLocals;
    
    // Fetch source tracks
    let sourceTracks = [];
    if (sourceService === 'spotify') {
      sourceTracks = await fetchSpotifyPlaylistTracks(sourcePlaylistId);
    } else {
      // Handle Apple Music source
      throw new Error('Apple Music as source not yet implemented');
    }
    
    session.progress.total = sourceTracks.length;
    
    // Get Apple Music headers
    const devToken = await getDeveloperToken(true);
    const headers = {
      'Authorization': `Bearer ${devToken}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    // Process with variant detection
    const results = await processBatchWithReview(
      sourceTracks,
      headers,
      storefront,
      makeAppleMusicApiRequest,
      (progress) => {
        session.progress = progress;
      }
    );
    
    session.results = results;
    session.status = results.needsReview.length > 0 ? 'needs_review' : 'ready';
    session.processedAt = new Date().toISOString();
    
  } catch (error) {
    logger.error('Transfer processing error:', error);
    session.status = 'error';
    session.error = error.message;
  }
}

async function executeTransferAsync(sessionId, appLocals) {
  const session = pendingReviews.get(sessionId);
  if (!session) return;
  
  try {
    const {
      getDeveloperToken,
      appleCredentials,
      addTracksToApplePlaylistInBatches,
      createApplePlaylistInternal
    } = appLocals;
    
    // Collect all tracks to add
    const tracksToAdd = [];
    
    // Add auto-matched tracks
    if (session.results?.autoMatched) {
      tracksToAdd.push(...session.results.autoMatched
        .filter(r => r.match && r.match.id)
        .map(r => String(r.match.id)));
    }
    
    // Add reviewed tracks
    if (session.reviewedTracks) {
      tracksToAdd.push(...session.reviewedTracks
        .filter(r => r.selectedMatch && r.selectedMatch.id)
        .map(r => String(r.selectedMatch.id)));
    }
    
    // Create or use existing destination playlist
    let destPlaylistId = session.destinationPlaylistId;
    if (!destPlaylistId) {
      const created = await createApplePlaylistInternal(`Transferred Playlist ${Date.now()}`);
      destPlaylistId = created.id;
      session.destinationPlaylistId = destPlaylistId;
    }
    
    // Get Apple Music headers
    const devToken = await getDeveloperToken(true);
    const headers = {
      'Authorization': `Bearer ${devToken}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0'
    };
    
    // Add tracks
    if (tracksToAdd.length > 0) {
      await addTracksToApplePlaylistInBatches(destPlaylistId, tracksToAdd, headers);
    }
    
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    session.stats = {
      totalTracks: session.progress.total,
      transferred: tracksToAdd.length,
      unavailable: session.results?.unavailable?.length || 0,
      ignored: session.reviewedTracks?.filter(r => r.userIgnored).length || 0
    };
    
  } catch (error) {
    logger.error('Transfer execution error:', error);
    session.status = 'error';
    session.error = error.message;
  }
}

module.exports = router;

