/**
 * Data retention policy manager
 */

import { unlinkSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import type { ScanDatabase } from './database.js';

const logger = createLogger('retention');

/**
 * Retention policy manager
 */
export class RetentionManager {
  private db: ScanDatabase;
  private scansDir: string;
  private retentionDays: number;
  private interval: Timer | null = null;

  constructor(db: ScanDatabase, scansDir: string = env.SCANS_DIR, retentionDays: number = env.RETENTION_DAYS) {
    this.db = db;
    this.scansDir = scansDir;
    this.retentionDays = retentionDays;

    logger.info({
      scansDir,
      retentionDays
    }, 'RetentionManager initialized');
  }

  /**
   * Start automatic cleanup (runs daily)
   */
  start(): void {
    if (this.interval) {
      logger.warn('Retention manager already running');
      return;
    }

    // Run immediately
    this.cleanup();

    // Then run every 24 hours
    this.interval = setInterval(() => {
      this.cleanup();
    }, 24 * 60 * 60 * 1000);

    logger.info('Retention manager started');
  }

  /**
   * Stop automatic cleanup
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Retention manager stopped');
    }
  }

  /**
   * Run cleanup for old data
   */
  async cleanup(): Promise<void> {
    try {
      const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
      const cutoffDate = new Date(cutoffTime);

      logger.info({
        retentionDays: this.retentionDays,
        cutoffDate: cutoffDate.toISOString()
      }, 'Starting retention cleanup');

      // Get old scans from database
      const oldScans = this.db.getScansByTimeRange(0, cutoffTime);

      if (oldScans.length === 0) {
        logger.info('No old scans to clean up');
        return;
      }

      logger.info({ count: oldScans.length }, 'Found old scans to delete');

      // Delete files
      let filesDeleted = 0;
      let fileErrors = 0;

      for (const scan of oldScans) {
        try {
          const fullPath = join(this.scansDir, scan.filePath);
          unlinkSync(fullPath);
          filesDeleted++;
        } catch (error) {
          // File may already be deleted or not exist
          fileErrors++;
          logger.debug({ error, path: scan.filePath }, 'Failed to delete file');
        }
      }

      // Delete from database
      const dbDeleted = this.db.deleteOldScans(cutoffTime);

      // Clean up empty directories
      this.cleanupEmptyDirs();

      logger.info({
        filesDeleted,
        fileErrors,
        dbDeleted,
        cutoffDate: cutoffDate.toISOString()
      }, 'Retention cleanup completed');

      // Run checkpoint to reclaim space
      this.db.checkpoint();
    } catch (error) {
      logger.error({ error }, 'Retention cleanup failed');
    }
  }

  /**
   * Remove empty directories
   */
  private cleanupEmptyDirs(): void {
    try {
      // Walk directory tree and remove empty directories
      const removeEmptyDirs = (dir: string): boolean => {
        try {
          const files = readdirSync(dir);

          if (files.length === 0) {
            // Directory is empty, remove it
            rmSync(dir, { recursive: true });
            return true;
          }

          // Check subdirectories
          let allEmpty = true;
          for (const file of files) {
            const fullPath = join(dir, file);
            const stats = statSync(fullPath);

            if (stats.isDirectory()) {
              if (!removeEmptyDirs(fullPath)) {
                allEmpty = false;
              }
            } else {
              allEmpty = false;
            }
          }

          // If all subdirectories were empty, this dir might be empty too
          if (allEmpty && readdirSync(dir).length === 0) {
            rmSync(dir, { recursive: true });
            return true;
          }

          return false;
        } catch (error) {
          logger.debug({ error, dir }, 'Failed to clean directory');
          return false;
        }
      };

      removeEmptyDirs(this.scansDir);
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup empty directories');
    }
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    retentionDays: number;
    cutoffDate: Date;
    stats: ReturnType<ScanDatabase['getStats']>;
  } {
    const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);

    return {
      retentionDays: this.retentionDays,
      cutoffDate: new Date(cutoffTime),
      stats: this.db.getStats()
    };
  }
}
