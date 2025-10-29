/**
 * Transfer History API Routes
 */

const express = require('express');
const router = express.Router();
const transferHistory = require('../services/transferHistory');
const { asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Get all transfer history
 *     tags: [History]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of records to return
 *     responses:
 *       200:
 *         description: Transfer history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transfers:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const transfers = await transferHistory.getAllTransfers(limit);

  res.json({
    success: true,
    transfers,
    count: transfers.length
  });
}));

/**
 * @swagger
 * /api/history/{transferId}:
 *   get:
 *     summary: Get specific transfer record
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transfer record retrieved
 *       404:
 *         description: Transfer not found
 */
router.get('/:transferId', asyncHandler(async (req, res) => {
  const { transferId } = req.params;
  const transfer = await transferHistory.getTransfer(transferId);

  if (!transfer) {
    return res.status(404).json({
      success: false,
      error: { message: 'Transfer not found' }
    });
  }

  res.json({
    success: true,
    transfer
  });
}));

/**
 * @swagger
 * /api/history/{transferId}/undo:
 *   post:
 *     summary: Undo a completed transfer
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deleteDestination:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Transfer undone successfully
 *       404:
 *         description: Transfer not found
 */
router.post('/:transferId/undo', asyncHandler(async (req, res) => {
  const { transferId } = req.params;
  const { deleteDestination = true } = req.body;

  const result = await transferHistory.undoTransfer(transferId, deleteDestination);

  res.json({
    success: true,
    ...result
  });
}));

/**
 * @swagger
 * /api/history/{transferId}/replay:
 *   post:
 *     summary: Replay a transfer with same settings
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Replay settings retrieved
 */
router.post('/:transferId/replay', asyncHandler(async (req, res) => {
  const { transferId } = req.params;
  const settings = await transferHistory.replayTransfer(transferId);

  res.json({
    success: true,
    settings
  });
}));

/**
 * @swagger
 * /api/history/{transferId}:
 *   delete:
 *     summary: Delete transfer record
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transfer deleted
 */
router.delete('/:transferId', asyncHandler(async (req, res) => {
  const { transferId } = req.params;
  await transferHistory.deleteTransfer(transferId);

  res.json({
    success: true,
    message: 'Transfer deleted'
  });
}));

/**
 * @swagger
 * /api/history/stats:
 *   get:
 *     summary: Get transfer statistics
 *     tags: [History]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await transferHistory.getStatistics();

  res.json({
    success: true,
    stats
  });
}));

/**
 * @swagger
 * /api/history/cleanup:
 *   post:
 *     summary: Clean up old transfer records
 *     tags: [History]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keepLast:
 *                 type: integer
 *                 default: 100
 *     responses:
 *       200:
 *         description: Cleanup completed
 */
router.post('/cleanup', asyncHandler(async (req, res) => {
  const { keepLast = 100 } = req.body;
  const result = await transferHistory.cleanup(keepLast);

  res.json({
    success: true,
    ...result
  });
}));

module.exports = router;

