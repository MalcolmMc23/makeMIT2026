/**
 * Main LiDAR scan processor
 */

import { createLogger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { BufferManager } from './buffer-manager.js';
import { FileWriter } from '../storage/file-writer.js';
import { ScanDatabase } from '../storage/database.js';
import type { LiDARScan, ScanMetadata } from '../models/lidar-scan.js';

const logger = createLogger('processor');

/**
 * LiDAR processor orchestrates the full pipeline
 */
export class LiDARProcessor {
  private buffer: BufferManager;
  private fileWriter: FileWriter;
  private db: ScanDatabase;
  private processingInterval: Timer | null = null;
  private isShuttingDown = false;

  // Statistics
  private stats = {
    received: 0,
    processed: 0,
    failed: 0,
    startTime: Date.now()
  };

  constructor(
    buffer: BufferManager,
    fileWriter: FileWriter,
    db: ScanDatabase
  ) {
    this.buffer = buffer;
    this.fileWriter = fileWriter;
    this.db = db;

    // Listen to buffer events
    this.buffer.on('overflow', (scan) => {
      logger.warn({ scanId: scan.scanId }, 'Scan dropped due to buffer overflow');
    });

    this.buffer.on('backpressure', (level) => {
      logger.warn({ fillLevel: `${(level * 100).toFixed(1)}%` }, 'Buffer backpressure detected');
    });

    logger.info('LiDARProcessor initialized');
  }

  /**
   * Start processing loop
   */
  start(): void {
    if (this.processingInterval) {
      logger.warn('Processor already running');
      return;
    }

    logger.info({
      interval: env.PROCESSING_INTERVAL_MS
    }, 'Starting processing loop');

    this.processingInterval = setInterval(() => {
      this.processNext();
    }, env.PROCESSING_INTERVAL_MS);

    this.stats.startTime = Date.now();
  }

  /**
   * Stop processing loop
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Processing loop stopped');
    }
  }

  /**
   * Submit scan for processing (non-blocking)
   */
  submit(scan: LiDARScan): boolean {
    // Validate scan
    if (!this.validateScan(scan)) {
      logger.warn({ scanId: scan.scanId }, 'Invalid scan rejected');
      return false;
    }

    this.stats.received++;

    // Enqueue to buffer
    const enqueued = this.buffer.enqueue(scan);

    if (!enqueued) {
      this.stats.failed++;
      logger.warn({
        scanId: scan.scanId,
        bufferSize: this.buffer.size()
      }, 'Scan rejected due to backpressure');
    }

    return enqueued;
  }

  /**
   * Process next scan from buffer
   */
  private async processNext(): Promise<void> {
    if (this.isShuttingDown) return;

    const scan = this.buffer.dequeue();
    if (!scan) return;

    const startTime = Date.now();

    try {
      // Write to file
      const { filePath, sizeBytes } = await this.fileWriter.writeScan(scan);

      // Store metadata in database
      const metadata: ScanMetadata = {
        scanId: scan.scanId,
        sessionId: scan.sessionId,
        deviceId: scan.deviceId,
        timestamp: scan.timestamp,
        filePath,
        sizeBytes,
        pointCount: scan.points.length
      };

      this.db.insertScan(metadata);

      this.stats.processed++;

      const processingTime = Date.now() - startTime;

      logger.info({
        scanId: scan.scanId,
        sessionId: scan.sessionId,
        points: scan.points.length,
        size: this.formatBytes(sizeBytes),
        processingTime: `${processingTime}ms`,
        queueSize: this.buffer.size()
      }, 'Scan processed successfully');

    } catch (error) {
      this.stats.failed++;
      logger.error({
        error,
        scanId: scan.scanId,
        processingTime: `${Date.now() - startTime}ms`
      }, 'Failed to process scan');
    }
  }

  /**
   * Validate incoming scan
   */
  private validateScan(scan: LiDARScan): boolean {
    // Check required fields
    if (!scan.scanId || !scan.sessionId || !scan.deviceId) {
      logger.warn({ scan }, 'Missing required fields');
      return false;
    }

    // Check timestamp
    if (!scan.timestamp || scan.timestamp <= 0) {
      logger.warn({ scan }, 'Invalid timestamp');
      return false;
    }

    // Check points array
    if (!Array.isArray(scan.points)) {
      logger.warn({ scan }, 'Points must be an array');
      return false;
    }

    if (scan.points.length === 0) {
      logger.warn({ scanId: scan.scanId }, 'Empty point cloud');
      return false;
    }

    // Validate point structure (sample first point)
    if (scan.points.length > 0) {
      const firstPoint = scan.points[0];
      if (
        typeof firstPoint.x !== 'number' ||
        typeof firstPoint.y !== 'number' ||
        typeof firstPoint.z !== 'number'
      ) {
        logger.warn({ scan }, 'Invalid point structure');
        return false;
      }
    }

    return true;
  }

  /**
   * Graceful shutdown - drain buffer
   */
  async shutdown(): Promise<void> {
    logger.info('Starting graceful shutdown');
    this.isShuttingDown = true;

    // Stop accepting new scans
    this.stop();

    // Drain remaining buffer
    const remaining = this.buffer.size();
    if (remaining > 0) {
      logger.info({ remaining }, 'Draining remaining scans');

      for await (const scan of this.buffer.drain()) {
        await this.processNext();
      }
    }

    // Final checkpoint
    this.db.checkpoint();

    logger.info({
      ...this.stats,
      uptime: this.formatUptime(Date.now() - this.stats.startTime)
    }, 'Graceful shutdown completed');
  }

  /**
   * Get processor statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const bufferStats = this.buffer.getStats();
    const dbStats = this.db.getStats();

    return {
      processor: {
        ...this.stats,
        uptime,
        uptimeFormatted: this.formatUptime(uptime),
        throughput: {
          scansPerSecond: this.stats.processed / (uptime / 1000),
          scansPerMinute: this.stats.processed / (uptime / 60000)
        }
      },
      buffer: bufferStats,
      database: dbStats
    };
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
   * Format uptime to human-readable string
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
