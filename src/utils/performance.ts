// Performance optimization utilities

// Debounce function calls
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

// Throttle function calls
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Memoization with cache size limit
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  cacheSize = 100
): T {
  const cache = new Map<string, ReturnType<T>>();
  const keys: string[] = [];
  
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = func(...args);
    
    // Implement LRU cache
    if (keys.length >= cacheSize) {
      const oldestKey = keys.shift();
      if (oldestKey) cache.delete(oldestKey);
    }
    
    cache.set(key, result);
    keys.push(key);
    
    return result;
  }) as T;
}

// Virtual scrolling utilities
export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number[];
  totalHeight: number;
  offsetY: number;
}

export function calculateVirtualScroll(
  scrollTop: number,
  totalItems: number,
  config: VirtualScrollConfig
): VirtualScrollResult {
  const { itemHeight, containerHeight, overscan = 5 } = config;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  const visibleItems = Array.from(
    { length: endIndex - startIndex + 1 },
    (_, i) => startIndex + i
  );
  
  const totalHeight = totalItems * itemHeight;
  const offsetY = startIndex * itemHeight;
  
  return {
    startIndex,
    endIndex,
    visibleItems,
    totalHeight,
    offsetY
  };
}

// Lazy loading hook
export function useLazyLoad<T>(
  items: T[],
  pageSize: number = 20
): [T[], boolean, () => void] {
  const [displayedItems, setDisplayedItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  
  useEffect(() => {
    const endIndex = currentPage * pageSize;
    const newItems = items.slice(0, endIndex);
    setDisplayedItems(newItems);
    setHasMore(endIndex < items.length);
  }, [items, currentPage, pageSize]);
  
  const loadMore = useCallback(() => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMore]);
  
  return [displayedItems, hasMore, loadMore];
}

// Image lazy loading
export function useImageLazyLoad(src: string): [string, boolean] {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    if (!src) return;
    
    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
      setIsLoaded(true);
    };
    img.src = src;
    
    return () => {
      img.onload = null;
    };
  }, [src]);
  
  return [imageSrc, isLoaded];
}

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLElement>(null);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    
    observer.observe(element);
    
    return () => {
      observer.unobserve(element);
    };
  }, [options]);
  
  return [ref, isIntersecting];
}

// Performance monitoring
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private marks: Map<string, number> = new Map();
  
  startTimer(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  endTimer(name: string): number {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`Timer '${name}' was not started`);
      return 0;
    }
    
    const duration = performance.now() - startTime;
    this.marks.delete(name);
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(duration);
    
    return duration;
  }
  
  getAverageTime(name: string): number {
    const times = this.metrics.get(name);
    if (!times || times.length === 0) return 0;
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }
  
  getMetrics(): Record<string, { average: number; count: number; min: number; max: number }> {
    const result: Record<string, { average: number; count: number; min: number; max: number }> = {};
    
    for (const [name, times] of this.metrics) {
      result[name] = {
        average: this.getAverageTime(name),
        count: times.length,
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }
    
    return result;
  }
  
  clearMetrics(): void {
    this.metrics.clear();
    this.marks.clear();
  }
}

// Web Worker utilities for heavy computations
export function createWorker<T, R>(
  workerFunction: (data: T) => R
): (data: T) => Promise<R> {
  const workerCode = `
    self.onmessage = function(e) {
      const result = (${workerFunction.toString()})(e.data);
      self.postMessage(result);
    };
  `;
  
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));
  
  return (data: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Worker timeout'));
      }, 30000); // 30 second timeout
      
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        resolve(e.data);
        worker.terminate();
      };
      
      worker.onerror = (e) => {
        clearTimeout(timeout);
        reject(e.error);
        worker.terminate();
      };
      
      worker.postMessage(data);
    });
  };
}

// Batch processing for large datasets
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayBetweenBatches: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    // Add delay between batches to prevent overwhelming the system
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}

// Memory management utilities
export function cleanupMemory(): void {
  if ('gc' in window) {
    // @ts-ignore
    window.gc();
  }
  
  // Clear any cached data
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
}

// Import React hooks
import React, { useState, useEffect, useCallback, useRef } from 'react';
