// Jest setup file
// Runs before each test suite

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3002'; // Different port for testing
process.env.LOG_LEVEL = 'error'; // Less verbose logging in tests

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(), // Mock console.log
  debug: jest.fn(), // Mock console.debug
  info: jest.fn(), // Mock console.info
  warn: jest.fn(), // Keep console.warn
  error: jest.fn(), // Keep console.error
};

// Set longer timeout for integration tests
jest.setTimeout(10000);

// Clean up after tests
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 500));
});

