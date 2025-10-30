/**
 * Transfer History Service
 * Tracks all playlist transfers with undo capability
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

class TransferHistoryService {
  constructor() {
    this.historyDir = path.join(__dirname, '../data/history');
    this.maxHistorySize = 100; // Keep last 100 transfers
    this.init();
  }

  /**
   * Initialize history storage
   */
  async init() {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      logger.info('Transfer history service initialized');
    } catch (error) {
      logger.error('Failed to initialize history directory', { error: error.message });
    }
  }

  /**
   * Generate transfer ID
   */
  generateTransferId() {
    return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record transfer start
   */
  async recordTransferStart(transferData) {
    const transferId = this.generateTransferId();

    const record = {
      id: transferId,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      sourceService: transferData.sourceService,
      sourcePlaylistId: transferData.sourcePlaylistId,
      sourcePlaylistName: transferData.sourcePlaylistName,
      destinationService: transferData.destinationService,
      destinationPlaylistId: null,
      destinationPlaylistName: transferData.destinationPlaylistName,
      trackCount: transferData.trackCount,
      metadata: {
        userAgent: transferData.userAgent,
        appVersion: transferData.appVersion
      }
    };

    await this.saveTransfer(record);
    logger.info('Transfer started and recorded', { transferId });

    return transferId;
  }

  /**
   * Update transfer progress
   */
  async updateTransferProgress(transferId, progress) {
    const record = await this.getTransfer(transferId);
    if (!record) return false;

    record.progress = progress;
    record.updatedAt = new Date().toISOString();

    await this.saveTransfer(record);
    return true;
  }

  /**
   * Record transfer completion
   */
  async recordTransferComplete(transferId, results) {
    const record = await this.getTransfer(transferId);
    if (!record) return false;

    record.status = 'completed';
    record.completedAt = new Date().toISOString();
    record.destinationPlaylistId = results.destinationPlaylistId;
    record.results = {
      totalTracks: results.totalTracks,
      matched: results.matched,
      unavailable: results.unavailable,
      ignored: results.ignored,
      successRate: results.successRate
    };

    // Store track mapping for undo capability
    record.trackMapping = results.trackMapping || [];

    await this.saveTransfer(record);
    logger.info('Transfer completed and recorded', {
      transferId,
      matched: results.matched,
      unavailable: results.unavailable
    });

    return true;
  }

  /**
   * Record transfer error
   */
  async recordTransferError(transferId, error) {
    const record = await this.getTransfer(transferId);
    if (!record) return false;

    record.status = 'failed';
    record.completedAt = new Date().toISOString();
    record.error = {
      message: error.message,
      stack: error.stack
    };

    await this.saveTransfer(record);
    logger.error('Transfer failed and recorded', { transferId, error: error.message });

    return true;
  }

  /**
   * Get transfer record
   */
  async getTransfer(transferId) {
    try {
      const filePath = path.join(this.historyDir, `${transferId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to read transfer record', { transferId, error: error.message });
      }
      return null;
    }
  }

  /**
   * Save transfer record
   */
  async saveTransfer(record) {
    try {
      const filePath = path.join(this.historyDir, `${record.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');

      // Also cache for quick access
      await cacheService.set(`history:${record.id}`, record, 604800); // 7 days

      return true;
    } catch (error) {
      logger.error('Failed to save transfer record', { transferId: record.id, error: error.message });
      return false;
    }
  }

  /**
   * Get all transfers
   */
  async getAllTransfers(limit = 50) {
    try {
      const files = await fs.readdir(this.historyDir);
      const transfers = [];

      // Read all transfer files
      for (const file of files.slice(0, limit)) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.historyDir, file), 'utf8');
          transfers.push(JSON.parse(data));
        }
      }

      // Sort by date (newest first)
      transfers.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

      return transfers;
    } catch (error) {
      logger.error('Failed to get all transfers', { error: error.message });
      return [];
    }
  }

  /**
   * Get transfers by service
   */
  async getTransfersByService(sourceService, destinationService) {
    const allTransfers = await this.getAllTransfers();

    return allTransfers.filter(t =>
      t.sourceService === sourceService &&
      t.destinationService === destinationService
    );
  }

  /**
   * Undo transfer (delete destination playlist)
   */
  async undoTransfer(transferId, deleteDestination = true) {
    const record = await this.getTransfer(transferId);
    if (!record) {
      throw new Error('Transfer not found');
    }

    if (record.status !== 'completed') {
      throw new Error('Can only undo completed transfers');
    }

    logger.info('Starting transfer undo', {
      transferId,
      destinationPlaylistId: record.destinationPlaylistId,
      deleteDestination
    });

    try {
      // Store undo record
      const undoRecord = {
        ...record,
        status: 'undone',
        undoneAt: new Date().toISOString(),
        deletedDestination: deleteDestination
      };

      await this.saveTransfer(undoRecord);

      // Return undo details for client to execute
      return {
        success: true,
        transferId,
        destinationService: record.destinationService,
        destinationPlaylistId: record.destinationPlaylistId,
        trackMapping: record.trackMapping,
        deleteDestination
      };
    } catch (error) {
      logger.error('Undo failed', { transferId, error: error.message });
      throw error;
    }
  }

  /**
   * Replay transfer (re-run with same settings)
   */
  async replayTransfer(transferId) {
    const record = await this.getTransfer(transferId);
    if (!record) {
      throw new Error('Transfer not found');
    }

    logger.info('Replaying transfer', { transferId });

    return {
      sourceService: record.sourceService,
      sourcePlaylistId: record.sourcePlaylistId,
      destinationService: record.destinationService,
      destinationPlaylistName: record.destinationPlaylistName
    };
  }

  /**
   * Delete transfer record
   */
  async deleteTransfer(transferId) {
    try {
      const filePath = path.join(this.historyDir, `${transferId}.json`);
      await fs.unlink(filePath);
      await cacheService.delete(`history:${transferId}`);

      logger.info('Transfer record deleted', { transferId });
      return true;
    } catch (error) {
      logger.error('Failed to delete transfer', { transferId, error: error.message });
      return false;
    }
  }

  /**
   * Clean up old transfers (keep last N)
   */
  async cleanup(keepLast = 100) {
    try {
      const allTransfers = await this.getAllTransfers();

      if (allTransfers.length <= keepLast) {
        logger.info('No cleanup needed', { total: allTransfers.length });
        return { deleted: 0 };
      }

      const toDelete = allTransfers.slice(keepLast);
      let deleted = 0;

      for (const transfer of toDelete) {
        if (await this.deleteTransfer(transfer.id)) {
          deleted++;
        }
      }

      logger.info('Transfer history cleaned up', { deleted, remaining: keepLast });

      return { deleted, remaining: allTransfers.length - deleted };
    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
      return { deleted: 0, error: error.message };
    }
  }

  /**
   * Get transfer statistics
   */
  async getStatistics() {
    const allTransfers = await this.getAllTransfers();

    const stats = {
      total: allTransfers.length,
      completed: allTransfers.filter(t => t.status === 'completed').length,
      failed: allTransfers.filter(t => t.status === 'failed').length,
      inProgress: allTransfers.filter(t => t.status === 'in_progress').length,
      undone: allTransfers.filter(t => t.status === 'undone').length,
      averageSuccessRate: 0,
      totalTracksTransferred: 0,
      byService: {}
    };

    const completed = allTransfers.filter(t => t.status === 'completed');
    if (completed.length > 0) {
      const totalSuccessRate = completed.reduce((sum, t) => sum + (t.results?.successRate || 0), 0);
      stats.averageSuccessRate = totalSuccessRate / completed.length;
      stats.totalTracksTransferred = completed.reduce((sum, t) => sum + (t.results?.matched || 0), 0);

      // Group by service pair
      completed.forEach(t => {
        const key = `${t.sourceService}_to_${t.destinationService}`;
        if (!stats.byService[key]) {
          stats.byService[key] = { count: 0, tracks: 0, successRate: 0 };
        }
        stats.byService[key].count++;
        stats.byService[key].tracks += t.results?.matched || 0;
        stats.byService[key].successRate += t.results?.successRate || 0;
      });

      // Average success rates per service pair
      Object.keys(stats.byService).forEach(key => {
        stats.byService[key].successRate /= stats.byService[key].count;
      });
    }

    return stats;
  }
}

// Export singleton instance
module.exports = new TransferHistoryService();

