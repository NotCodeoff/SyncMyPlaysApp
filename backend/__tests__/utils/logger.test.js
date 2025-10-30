/**
 * Unit Tests for Logger
 */

const logger = require('../../utils/logger');

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Log Levels', () => {
    it('should expose error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should expose warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should expose info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should expose debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('Data Sanitization', () => {
    it('should log messages without throwing', () => {
      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });

    it('should log messages with metadata', () => {
      expect(() => {
        logger.info('Test message', { userId: 123, action: 'test' });
      }).not.toThrow();
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Error occurred', { error: error.message });
      }).not.toThrow();
    });
  });

  describe('Sensitive Data Handling', () => {
    it('should handle objects with sensitive fields', () => {
      expect(() => {
        logger.info('User action', {
          userId: 123,
          token: 'secret-token-12345',
          password: 'user-password'
        });
      }).not.toThrow();
    });

    it('should handle nested objects', () => {
      expect(() => {
        logger.info('Nested data', {
          user: {
            id: 123,
            credentials: {
              apiKey: 'secret-key',
              token: 'secret-token'
            }
          }
        });
      }).not.toThrow();
    });
  });
});

