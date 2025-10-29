/**
 * WebSocket Service for Real-Time Updates
 * Provides live progress updates during sync operations
 */

const { Server } = require('socket.io');
const logger = require('../utils/logger');
const config = require('../config/env');

class WebSocketService {
  constructor() {
    this.io = null;
    this.rooms = new Map(); // Track active sync sessions
  }

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*', // Configure based on your needs
        methods: ['GET', 'POST']
      },
      path: '/ws/socket.io'
    });

    this.setupEventHandlers();
    logger.info('WebSocket server initialized');
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Join sync session room
      socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        logger.info('Client joined session', { socketId: socket.id, sessionId });
      });

      // Leave sync session room
      socket.on('leave-session', (sessionId) => {
        socket.leave(sessionId);
        logger.info('Client left session', { socketId: socket.id, sessionId });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error('Socket error', { socketId: socket.id, error: error.message });
      });
    });
  }

  /**
   * Emit sync progress update
   */
  emitProgress(sessionId, progress) {
    if (!this.io) return;

    this.io.to(sessionId).emit('sync-progress', {
      sessionId,
      timestamp: Date.now(),
      ...progress
    });

    logger.debug('Progress update sent', { sessionId, progress });
  }

  /**
   * Emit track match result
   */
  emitTrackMatched(sessionId, trackData) {
    if (!this.io) return;

    this.io.to(sessionId).emit('track-matched', {
      sessionId,
      timestamp: Date.now(),
      ...trackData
    });
  }

  /**
   * Emit sync completion
   */
  emitComplete(sessionId, results) {
    if (!this.io) return;

    this.io.to(sessionId).emit('sync-complete', {
      sessionId,
      timestamp: Date.now(),
      ...results
    });

    logger.info('Sync complete notification sent', { sessionId });
  }

  /**
   * Emit error
   */
  emitError(sessionId, error) {
    if (!this.io) return;

    this.io.to(sessionId).emit('sync-error', {
      sessionId,
      timestamp: Date.now(),
      error: error.message || 'Unknown error'
    });

    logger.error('Error notification sent', { sessionId, error: error.message });
  }

  /**
   * Emit status update
   */
  emitStatus(sessionId, status) {
    if (!this.io) return;

    this.io.to(sessionId).emit('sync-status', {
      sessionId,
      timestamp: Date.now(),
      status
    });
  }

  /**
   * Get connected clients count
   */
  getClientsCount() {
    if (!this.io) return 0;
    return this.io.engine.clientsCount;
  }

  /**
   * Get session participants count
   */
  getSessionParticipants(sessionId) {
    if (!this.io) return 0;
    const room = this.io.sockets.adapter.rooms.get(sessionId);
    return room ? room.size : 0;
  }

  /**
   * Close WebSocket server
   */
  close() {
    if (this.io) {
      this.io.close();
      logger.info('WebSocket server closed');
    }
  }
}

// Export singleton instance
module.exports = new WebSocketService();

