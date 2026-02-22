/**
 * SQLite database for scan metadata
 */

import { Database } from 'bun:sqlite';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import type { ScanMetadata, SessionMetadata } from '../models/lidar-scan.js';

const logger = createLogger('database');

/**
 * Database manager with optimized SQLite configuration
 */
export class ScanDatabase {
  private db: Database;
  private insertScanStmt: any;
  private insertSessionStmt: any;
  private updateSessionStmt: any;
  private getSessionStmt: any;

  constructor(dbPath: string = env.DB_PATH) {
    logger.info({ dbPath }, 'Initializing database');

    this.db = new Database(dbPath, { create: true });

    // Enable WAL mode for concurrent reads/writes
    this.db.run('PRAGMA journal_mode = WAL');

    // Optimize for write performance
    this.db.run('PRAGMA synchronous = NORMAL');
    this.db.run('PRAGMA cache_size = -64000'); // 64MB cache

    // Create tables
    this.createTables();

    // Prepare statements
    this.insertScanStmt = this.db.query(`
      INSERT INTO scans (
        scanId, sessionId, deviceId, timestamp,
        filePath, sizeBytes, pointCount, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertSessionStmt = this.db.query(`
      INSERT INTO sessions (
        sessionId, deviceId, startTime,
        scanCount, totalPoints, totalSizeBytes, createdAt
      ) VALUES (?, ?, ?, 0, 0, 0, ?)
      ON CONFLICT(sessionId) DO NOTHING
    `);

    this.updateSessionStmt = this.db.query(`
      UPDATE sessions
      SET scanCount = scanCount + 1,
          totalPoints = totalPoints + ?,
          totalSizeBytes = totalSizeBytes + ?,
          endTime = ?
      WHERE sessionId = ?
    `);

    this.getSessionStmt = this.db.query(`
      SELECT * FROM sessions WHERE sessionId = ?
    `);

    logger.info('Database initialized successfully');
  }

  /**
   * Create database tables with indexes
   */
  private createTables(): void {
    // Sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT UNIQUE NOT NULL,
        deviceId TEXT NOT NULL,
        startTime INTEGER NOT NULL,
        endTime INTEGER,
        scanCount INTEGER DEFAULT 0,
        totalPoints INTEGER DEFAULT 0,
        totalSizeBytes INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scans table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scanId TEXT UNIQUE NOT NULL,
        sessionId TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        filePath TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL,
        pointCount INTEGER NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sessionId) REFERENCES sessions(sessionId)
      )
    `);

    // Create indexes for common queries
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scans_sessionId ON scans(sessionId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scans_deviceId ON scans(deviceId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_deviceId ON sessions(deviceId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_startTime ON sessions(startTime)`);

    logger.info('Database tables created/verified');
  }

  /**
   * Insert scan metadata
   */
  insertScan(scan: ScanMetadata): void {
    try {
      // Ensure session exists
      this.insertSessionStmt.run(
        scan.sessionId,
        scan.deviceId,
        scan.timestamp,
        new Date().toISOString()
      );

      // Insert scan
      this.insertScanStmt.run(
        scan.scanId,
        scan.sessionId,
        scan.deviceId,
        scan.timestamp,
        scan.filePath,
        scan.sizeBytes,
        scan.pointCount,
        new Date().toISOString()
      );

      // Update session stats
      this.updateSessionStmt.run(
        scan.pointCount,
        scan.sizeBytes,
        scan.timestamp,
        scan.sessionId
      );

      logger.debug({ scanId: scan.scanId }, 'Scan metadata stored');
    } catch (error) {
      logger.error({ error, scanId: scan.scanId }, 'Failed to insert scan');
      throw error;
    }
  }

  /**
   * Get session metadata
   */
  getSession(sessionId: string): SessionMetadata | null {
    try {
      const result = this.getSessionStmt.get(sessionId);
      return result as SessionMetadata | null;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get session');
      return null;
    }
  }

  /**
   * Get scans by session
   */
  getScansBySession(sessionId: string): ScanMetadata[] {
    try {
      const stmt = this.db.query(`
        SELECT * FROM scans
        WHERE sessionId = ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(sessionId) as ScanMetadata[];
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get scans');
      return [];
    }
  }

  /**
   * Get scans by time range
   */
  getScansByTimeRange(startTime: number, endTime: number): ScanMetadata[] {
    try {
      const stmt = this.db.query(`
        SELECT * FROM scans
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(startTime, endTime) as ScanMetadata[];
    } catch (error) {
      logger.error({ error, startTime, endTime }, 'Failed to get scans by time range');
      return [];
    }
  }

  /**
   * Delete old scans
   */
  deleteOldScans(beforeTimestamp: number): number {
    try {
      const stmt = this.db.query(`
        DELETE FROM scans WHERE timestamp < ?
      `);
      stmt.run(beforeTimestamp);
      logger.info({ deleted: this.db.changes, beforeTimestamp }, 'Deleted old scans');
      return this.db.changes;
    } catch (error) {
      logger.error({ error, beforeTimestamp }, 'Failed to delete old scans');
      return 0;
    }
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalScans: number;
    totalSessions: number;
    totalPoints: number;
    totalSize: number;
    oldestScan: number | null;
    newestScan: number | null;
  } {
    try {
      const scansCount = this.db.query('SELECT COUNT(*) as count FROM scans').get() as { count: number };
      const sessionsCount = this.db.query('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
      const stats = this.db.query(`
        SELECT
          SUM(pointCount) as totalPoints,
          SUM(sizeBytes) as totalSize,
          MIN(timestamp) as oldestScan,
          MAX(timestamp) as newestScan
        FROM scans
      `).get() as {
        totalPoints: number | null;
        totalSize: number | null;
        oldestScan: number | null;
        newestScan: number | null;
      };

      return {
        totalScans: scansCount.count,
        totalSessions: sessionsCount.count,
        totalPoints: stats.totalPoints || 0,
        totalSize: stats.totalSize || 0,
        oldestScan: stats.oldestScan,
        newestScan: stats.newestScan
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return {
        totalScans: 0,
        totalSessions: 0,
        totalPoints: 0,
        totalSize: 0,
        oldestScan: null,
        newestScan: null
      };
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    logger.info('Closing database');
    this.db.close();
  }

  /**
   * Run checkpoint to merge WAL file
   */
  checkpoint(): void {
    try {
      this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
      logger.debug('WAL checkpoint completed');
    } catch (error) {
      logger.error({ error }, 'WAL checkpoint failed');
    }
  }
}
