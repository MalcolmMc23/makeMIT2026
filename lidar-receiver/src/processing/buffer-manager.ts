/**
 * Memory-aware buffer manager with backpressure
 */

import { EventEmitter } from 'events';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import type { LiDARScan } from '../models/lidar-scan.js';

const logger = createLogger('buffer-manager');

/**
 * Buffer manager events
 */
export interface BufferEvents {
  'overflow': (scan: LiDARScan) => void;
  'dropped': (count: number) => void;
  'backpressure': (level: number) => void;
}

/**
 * Buffer manager with memory-based backpressure
 */
export class BufferManager extends EventEmitter {
  private queue: LiDARScan[] = [];
  private maxQueueSize: number;
  private maxMemoryBytes: number;
  private currentMemoryBytes: number = 0;

  // Statistics
  private stats = {
    received: 0,
    processed: 0,
    dropped: 0,
    peakQueueSize: 0,
    peakMemoryBytes: 0
  };

  constructor(
    maxQueueSize: number = env.MAX_QUEUE_SIZE,
    maxMemoryMB: number = env.MAX_BUFFER_MEMORY_MB
  ) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;

    logger.info({
      maxQueueSize,
      maxMemoryMB
    }, 'BufferManager initialized');
  }

  /**
   * Add scan to buffer
   * Returns true if added, false if dropped due to backpressure
   */
  enqueue(scan: LiDARScan): boolean {
    this.stats.received++;

    // Estimate memory size
    const estimatedSize = this.estimateScanSize(scan);

    // Check memory limit
    if (this.currentMemoryBytes + estimatedSize > this.maxMemoryBytes) {
      logger.warn({
        scanId: scan.scanId,
        currentMemory: this.formatBytes(this.currentMemoryBytes),
        maxMemory: this.formatBytes(this.maxMemoryBytes),
        scanSize: this.formatBytes(estimatedSize)
      }, 'Memory limit reached, dropping scan');

      this.stats.dropped++;
      this.emit('overflow', scan);
      this.emit('dropped', this.stats.dropped);
      return false;
    }

    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn({
        scanId: scan.scanId,
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize
      }, 'Queue size limit reached, dropping scan');

      this.stats.dropped++;
      this.emit('overflow', scan);
      this.emit('dropped', this.stats.dropped);
      return false;
    }

    // Add to queue
    this.queue.push(scan);
    this.currentMemoryBytes += estimatedSize;

    // Update peak stats
    if (this.queue.length > this.stats.peakQueueSize) {
      this.stats.peakQueueSize = this.queue.length;
    }
    if (this.currentMemoryBytes > this.stats.peakMemoryBytes) {
      this.stats.peakMemoryBytes = this.currentMemoryBytes;
    }

    // Emit backpressure warning at 75%
    const fillLevel = this.queue.length / this.maxQueueSize;
    if (fillLevel >= 0.75) {
      this.emit('backpressure', fillLevel);
      logger.warn({
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize,
        fillLevel: `${(fillLevel * 100).toFixed(1)}%`
      }, 'Queue backpressure detected');
    }

    logger.debug({
      scanId: scan.scanId,
      queueSize: this.queue.length,
      memory: this.formatBytes(this.currentMemoryBytes)
    }, 'Scan enqueued');

    return true;
  }

  /**
   * Get next scan from buffer
   */
  dequeue(): LiDARScan | null {
    const scan = this.queue.shift();

    if (scan) {
      this.stats.processed++;
      const estimatedSize = this.estimateScanSize(scan);
      this.currentMemoryBytes = Math.max(0, this.currentMemoryBytes - estimatedSize);

      logger.debug({
        scanId: scan.scanId,
        queueSize: this.queue.length,
        memory: this.formatBytes(this.currentMemoryBytes)
      }, 'Scan dequeued');
    }

    return scan || null;
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      currentMemoryBytes: this.currentMemoryBytes,
      currentMemoryMB: this.currentMemoryBytes / 1024 / 1024,
      peakMemoryMB: this.stats.peakMemoryBytes / 1024 / 1024,
      maxQueueSize: this.maxQueueSize,
      maxMemoryMB: this.maxMemoryBytes / 1024 / 1024,
      fillLevel: this.queue.length / this.maxQueueSize,
      memoryFillLevel: this.currentMemoryBytes / this.maxMemoryBytes
    };
  }

  /**
   * Clear all buffered scans
   */
  clear(): void {
    const count = this.queue.length;
    this.queue = [];
    this.currentMemoryBytes = 0;

    logger.info({ cleared: count }, 'Buffer cleared');
  }

  /**
   * Estimate memory size of a scan
   * Rough estimate: ~20 bytes per point + metadata overhead
   */
  private estimateScanSize(scan: LiDARScan): number {
    const pointsSize = scan.points.length * 20;
    const metadataSize = 1000; // Rough estimate for metadata
    return pointsSize + metadataSize;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /**
   * Drain buffer (for graceful shutdown)
   */
  async *drain(): AsyncGenerator<LiDARScan> {
    while (!this.isEmpty()) {
      const scan = this.dequeue();
      if (scan) {
        yield scan;
      }
    }
  }
}
