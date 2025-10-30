/**
 * Unit Tests for Environment Configuration
 */

describe('Environment Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear module cache to force reload
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should load default configuration', () => {
    const config = require('../../config/env');

    expect(config.port).toBeDefined();
    expect(config.host).toBeDefined();
    expect(config.nodeEnv).toBeDefined();
  });

  it('should use environment variables when provided', () => {
    process.env.PORT = '5000';
    process.env.HOST = '0.0.0.0';
    process.env.NODE_ENV = 'production';

    // Reload config with new env vars
    delete require.cache[require.resolve('../../config/env')];
    const config = require('../../config/env');

    expect(config.port).toBe(5000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.nodeEnv).toBe('production');
  });

  it('should parse integer values correctly', () => {
    process.env.MAX_PARALLEL_REQUESTS = '20';
    process.env.BATCH_SIZE = '100';

    delete require.cache[require.resolve('../../config/env')];
    const config = require('../../config/env');

    expect(config.maxParallelRequests).toBe(20);
    expect(config.batchSize).toBe(100);
  });

  it('should have sensible defaults', () => {
    delete require.cache[require.resolve('../../config/env')];
    const config = require('../../config/env');

    expect(config.port).toBeGreaterThan(1023);
    expect(config.port).toBeLessThan(65536);
    expect(config.maxParallelRequests).toBeGreaterThan(0);
    expect(config.batchSize).toBeGreaterThan(0);
  });
});

