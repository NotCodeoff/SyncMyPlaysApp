/**
 * Parallel Processing Utility
 * Implements efficient parallel processing with batching and rate limiting
 */

const pLimit = require('p-limit');
const config = require('../config/env');
const logger = require('./logger');

/**
 * Process items in parallel with rate limiting and batching
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Results
 */
async function processInParallel(items, processor, options = {}) {
  const {
    maxConcurrent = config.maxParallelRequests,
    batchSize = config.batchSize,
    onProgress = null,
    onError = null,
  } = options;
  
  const limit = pLimit(maxConcurrent);
  const results = [];
  const errors = [];
  
  logger.info(`Starting parallel processing of ${items.length} items with concurrency ${maxConcurrent}`);
  
  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);
    
    logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
    
    // Process batch in parallel
    const batchPromises = batch.map((item, index) => 
      limit(async () => {
        try {
          const result = await processor(item, i + index);
          
          if (onProgress) {
            onProgress({
              current: i + index + 1,
              total: items.length,
              item,
              result,
            });
          }
          
          return { success: true, item, result, index: i + index };
        } catch (error) {
          logger.error(`Error processing item at index ${i + index}`, { error: error.message });
          
          if (onError) {
            onError(error, item, i + index);
          }
          
          return { success: false, item, error, index: i + index };
        }
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to avoid overwhelming the system
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  
  logger.info(`Parallel processing complete: ${successCount} succeeded, ${errorCount} failed`);
  
  return results;
}

/**
 * Process items in batches (for API batch endpoints)
 * @param {Array} items - Items to process
 * @param {Function} batchProcessor - Async function to process a batch
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Results
 */
async function processInBatches(items, batchProcessor, options = {}) {
  const {
    batchSize = config.batchSize,
    onProgress = null,
  } = options;
  
  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  
  logger.info(`Starting batch processing of ${items.length} items in ${totalBatches} batches`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
    
    try {
      const batchResult = await batchProcessor(batch, batchNumber);
      results.push(...(Array.isArray(batchResult) ? batchResult : [batchResult]));
      
      if (onProgress) {
        onProgress({
          currentBatch: batchNumber,
          totalBatches,
          processedItems: i + batch.length,
          totalItems: items.length,
        });
      }
    } catch (error) {
      logger.error(`Error processing batch ${batchNumber}`, { error: error.message });
      throw error;
    }
    
    // Small delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, config.apiRateLimitMs));
    }
  }
  
  logger.info(`Batch processing complete: ${results.length} items processed`);
  
  return results;
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of operation
 */
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = config.maxRetries,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    onRetry = null,
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
        
        logger.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
          error: error.message,
        });
        
        if (onRetry) {
          onRetry(error, attempt + 1, delay);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logger.error(`Operation failed after ${maxRetries + 1} attempts`, { error: lastError.message });
  throw lastError;
}

module.exports = {
  processInParallel,
  processInBatches,
  retryWithBackoff,
};

