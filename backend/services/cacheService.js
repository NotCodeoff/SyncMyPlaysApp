/**
 * Redis Caching Service
 * Provides caching layer for API responses and track matches
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');
const config = require('../config/env');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = 86400; // 24 hours in seconds
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('Redis connection error', { error: error.message });
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      // Wait for connection
      await this.client.ping();
      this.isConnected = true;
      logger.info('Redis cache service initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      // Continue without cache if Redis unavailable
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      if (value) {
        logger.debug('Cache hit', { key });
        return JSON.parse(value);
      }
      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isConnected) return false;

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key) {
    if (!this.isConnected) return false;

    try {
      await this.client.del(key);
      logger.debug('Cache delete', { key });
      return true;
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern) {
    if (!this.isConnected) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.debug('Cache delete pattern', { pattern, count: keys.length });
      }
      return true;
    } catch (error) {
      logger.error('Cache delete pattern error', { pattern, error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get cache key for track match
   */
  getTrackMatchKey(sourceService, trackId) {
    return `match:${sourceService}:${trackId}`;
  }

  /**
   * Get cache key for playlist
   */
  getPlaylistKey(service, playlistId) {
    return `playlist:${service}:${playlistId}`;
  }

  /**
   * Get cache key for track search
   */
  getTrackSearchKey(query, service) {
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');
    return `search:${service}:${normalizedQuery}`;
  }

  /**
   * Cache track match result
   */
  async cacheTrackMatch(sourceService, trackId, matchResult, ttl = 86400) {
    const key = this.getTrackMatchKey(sourceService, trackId);
    return await this.set(key, matchResult, ttl);
  }

  /**
   * Get cached track match
   */
  async getCachedTrackMatch(sourceService, trackId) {
    const key = this.getTrackMatchKey(sourceService, trackId);
    return await this.get(key);
  }

  /**
   * Cache playlist data
   */
  async cachePlaylist(service, playlistId, playlistData, ttl = 3600) {
    const key = this.getPlaylistKey(service, playlistId);
    return await this.set(key, playlistData, ttl);
  }

  /**
   * Get cached playlist
   */
  async getCachedPlaylist(service, playlistId) {
    const key = this.getPlaylistKey(service, playlistId);
    return await this.get(key);
  }

  /**
   * Invalidate playlist cache
   */
  async invalidatePlaylist(service, playlistId) {
    const key = this.getPlaylistKey(service, playlistId);
    return await this.delete(key);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) return null;

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');
      
      return {
        connected: this.isConnected,
        info,
        keyspace
      };
    } catch (error) {
      logger.error('Cache stats error', { error: error.message });
      return null;
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    if (!this.isConnected) return false;

    try {
      await this.client.flushdb();
      logger.warn('Cache cleared');
      return true;
    } catch (error) {
      logger.error('Cache clear error', { error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }
}

// Export singleton instance
module.exports = new CacheService();

