/**
 * Unit Tests for Cache Service
 */

const cacheService = require('../../services/cacheService');

describe('Cache Service', () => {
  beforeAll(async () => {
    // Connect to test Redis instance
    await cacheService.connect().catch(() => {
      console.log('Redis not available for testing, tests will be skipped');
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    if (cacheService.isConnected) {
      await cacheService.clear();
      await cacheService.disconnect();
    }
  });

  beforeEach(async () => {
    // Clear cache before each test
    if (cacheService.isConnected) {
      await cacheService.clear();
    }
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      if (!cacheService.isConnected) {
        return; // Skip if Redis not available
      }

      const key = 'test-key';
      const value = { foo: 'bar', num: 123 };

      await cacheService.set(key, value, 10);
      const retrieved = await cacheService.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      if (!cacheService.isConnected) return;

      const retrieved = await cacheService.get('non-existent-key');
      expect(retrieved).toBeNull();
    });

    it('should delete keys', async () => {
      if (!cacheService.isConnected) return;

      const key = 'test-key';
      await cacheService.set(key, 'value', 10);
      await cacheService.delete(key);
      const retrieved = await cacheService.get(key);

      expect(retrieved).toBeNull();
    });

    it('should check key existence', async () => {
      if (!cacheService.isConnected) return;

      const key = 'test-key';
      await cacheService.set(key, 'value', 10);

      const exists = await cacheService.exists(key);
      expect(exists).toBe(true);

      await cacheService.delete(key);
      const stillExists = await cacheService.exists(key);
      expect(stillExists).toBe(false);
    });
  });

  describe('Track Match Caching', () => {
    it('should cache track matches', async () => {
      if (!cacheService.isConnected) return;

      const matchResult = {
        success: true,
        id: 'spotify-track-123',
        score: 95,
        confidence: 'high'
      };

      await cacheService.cacheTrackMatch('apple', 'apple-track-456', matchResult);
      const cached = await cacheService.getCachedTrackMatch('apple', 'apple-track-456');

      expect(cached).toEqual(matchResult);
    });

    it('should generate correct cache keys', () => {
      const key = cacheService.getTrackMatchKey('spotify', 'track-123');
      expect(key).toBe('match:spotify:track-123');
    });
  });

  describe('Playlist Caching', () => {
    it('should cache playlists', async () => {
      if (!cacheService.isConnected) return;

      const playlist = {
        id: 'playlist-123',
        name: 'My Playlist',
        tracks: ['track-1', 'track-2']
      };

      await cacheService.cachePlaylist('spotify', 'playlist-123', playlist);
      const cached = await cacheService.getCachedPlaylist('spotify', 'playlist-123');

      expect(cached).toEqual(playlist);
    });

    it('should invalidate playlist cache', async () => {
      if (!cacheService.isConnected) return;

      const playlist = { id: 'playlist-123', name: 'Test' };

      await cacheService.cachePlaylist('spotify', 'playlist-123', playlist);
      await cacheService.invalidatePlaylist('spotify', 'playlist-123');
      const cached = await cacheService.getCachedPlaylist('spotify', 'playlist-123');

      expect(cached).toBeNull();
    });
  });

  describe('Pattern Deletion', () => {
    it('should delete keys by pattern', async () => {
      if (!cacheService.isConnected) return;

      // Set multiple keys
      await cacheService.set('test:1', 'value1', 10);
      await cacheService.set('test:2', 'value2', 10);
      await cacheService.set('other:1', 'value3', 10);

      // Delete pattern
      await cacheService.deletePattern('test:*');

      // Check results
      expect(await cacheService.get('test:1')).toBeNull();
      expect(await cacheService.get('test:2')).toBeNull();
      expect(await cacheService.get('other:1')).not.toBeNull();
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle disconnected state gracefully', async () => {
      // Save connection state
      const wasConnected = cacheService.isConnected;
      cacheService.isConnected = false;

      // Operations should not throw
      const getResult = await cacheService.get('any-key');
      const setResult = await cacheService.set('any-key', 'value');
      const delResult = await cacheService.delete('any-key');

      expect(getResult).toBeNull();
      expect(setResult).toBe(false);
      expect(delResult).toBe(false);

      // Restore connection state
      cacheService.isConnected = wasConnected;
    });
  });
});

