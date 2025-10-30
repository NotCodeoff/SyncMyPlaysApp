/**
 * Unit Tests for Parallel Processor
 */

const { processInParallel, processInBatches, retryWithBackoff } = require('../../utils/parallelProcessor');

describe('Parallel Processor', () => {
  describe('processInParallel', () => {
    it('should process items in parallel', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn(async (item) => item * 2);

      const results = await processInParallel(items, processor, {
        maxConcurrent: 2,
        batchSize: 10
      });

      expect(results).toHaveLength(5);
      expect(processor).toHaveBeenCalledTimes(5);
      expect(results.filter(r => r.success)).toHaveLength(5);
    });

    it('should handle errors gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item) => {
        if (item === 2) throw new Error('Test error');
        return item * 2;
      });

      const results = await processInParallel(items, processor);

      expect(results).toHaveLength(3);
      expect(results.filter(r => r.success)).toHaveLength(2);
      expect(results.filter(r => !r.success)).toHaveLength(1);
    });

    it('should call progress callback', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item) => item * 2);
      const onProgress = jest.fn();

      await processInParallel(items, processor, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should respect maxConcurrent limit', async () => {
      const items = [1, 2, 3, 4, 5];
      let concurrent = 0;
      let maxConcurrent = 0;

      const processor = async (item) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent--;
        return item;
      };

      await processInParallel(items, processor, { maxConcurrent: 2 });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('processInBatches', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const batchProcessor = jest.fn(async (batch) => batch.map(i => i * 2));

      const results = await processInBatches(items, batchProcessor, {
        batchSize: 2
      });

      expect(results).toHaveLength(5);
      expect(batchProcessor).toHaveBeenCalledTimes(3); // 5 items / 2 per batch = 3 batches
    });

    it('should call progress callback for each batch', async () => {
      const items = [1, 2, 3, 4, 5];
      const batchProcessor = jest.fn(async (batch) => batch);
      const onProgress = jest.fn();

      await processInBatches(items, batchProcessor, {
        batchSize: 2,
        onProgress
      });

      expect(onProgress).toHaveBeenCalledTimes(3);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn(async () => 'success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary failure');
        return 'success';
      });

      const result = await retryWithBackoff(operation, { maxRetries: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Permanent failure');
      });

      await expect(
        retryWithBackoff(operation, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow('Permanent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 2) throw new Error('Temporary failure');
        return 'success';
      });
      const onRetry = jest.fn();

      await retryWithBackoff(operation, { maxRetries: 2, initialDelay: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const delays = [];
      let attempts = 0;

      const operation = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary failure');
        return 'success';
      };

      const onRetry = (error, attempt, delay) => {
        delays.push(delay);
      };

      await retryWithBackoff(operation, {
        maxRetries: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
        onRetry
      });

      expect(delays[0]).toBe(100); // First retry: 100ms
      expect(delays[1]).toBe(200); // Second retry: 200ms
    });
  });
});

