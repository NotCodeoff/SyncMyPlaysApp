/**
 * Cache Management API Routes
 */

const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Cache stats retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await cacheService.getStats();

  res.json({
    success: true,
    stats
  });
}));

/**
 * @swagger
 * /api/cache/clear:
 *   post:
 *     summary: Clear all cache
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Cache cleared
 */
router.post('/clear', asyncHandler(async (req, res) => {
  await cacheService.clear();

  res.json({
    success: true,
    message: 'Cache cleared successfully'
  });
}));

/**
 * @swagger
 * /api/cache/clear/matches:
 *   post:
 *     summary: Clear track match cache
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Match cache cleared
 */
router.post('/clear/matches', asyncHandler(async (req, res) => {
  await cacheService.deletePattern('match:*');

  res.json({
    success: true,
    message: 'Match cache cleared'
  });
}));

/**
 * @swagger
 * /api/cache/clear/playlists:
 *   post:
 *     summary: Clear playlist cache
 *     tags: [Cache]
 *     responses:
 *       200:
 *         description: Playlist cache cleared
 */
router.post('/clear/playlists', asyncHandler(async (req, res) => {
  await cacheService.deletePattern('playlist:*');

  res.json({
    success: true,
    message: 'Playlist cache cleared'
  });
}));

module.exports = router;

