/**
 * Binary file writer for point cloud data
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { encode } from '@msgpack/msgpack';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import type { LiDARScan } from '../models/lidar-scan.js';

const logger = createLogger('file-writer');

/**
 * Generate date-based directory path
 * Format: YYYY/MM/DD/HH
 */
function getDatePath(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');

  return join(String(year), month, day, hour);
}

/**
 * File writer for LiDAR scans
 */
export class FileWriter {
  private baseDir: string;

  constructor(baseDir: string = env.SCANS_DIR) {
    this.baseDir = baseDir;
    logger.info({ baseDir }, 'FileWriter initialized');
  }

  /**
   * Write scan to binary file
   * Returns { filePath, sizeBytes }
   */
  async writeScan(scan: LiDARScan): Promise<{ filePath: string; sizeBytes: number }> {
    try {
      // Generate path
      const datePath = getDatePath(scan.timestamp);
      const dirPath = join(this.baseDir, datePath);
      const fileName = `${scan.scanId}.msgpack`;
      const fullPath = join(dirPath, fileName);

      // Ensure directory exists
      mkdirSync(dirPath, { recursive: true });

      // Encode to MessagePack
      const encoded = encode(scan);
      const buffer = Buffer.from(encoded);

      // Write file
      writeFileSync(fullPath, buffer);

      // Relative path for database
      const relativePath = join(datePath, fileName);

      logger.debug({
        scanId: scan.scanId,
        path: relativePath,
        size: buffer.length,
        points: scan.points.length
      }, 'Scan written to file');

      return {
        filePath: relativePath,
        sizeBytes: buffer.length
      };
    } catch (error) {
      logger.error({ error, scanId: scan.scanId }, 'Failed to write scan');
      throw error;
    }
  }

  /**
   * Write multiple scans in batch
   */
  async writeBatch(scans: LiDARScan[]): Promise<Array<{ filePath: string; sizeBytes: number }>> {
    const results: Array<{ filePath: string; sizeBytes: number }> = [];

    for (const scan of scans) {
      try {
        const result = await this.writeScan(scan);
        results.push(result);
      } catch (error) {
        logger.error({ error, scanId: scan.scanId }, 'Failed to write scan in batch');
        // Continue with other scans
      }
    }

    return results;
  }

  /**
   * Estimate file size without writing
   */
  estimateSize(scan: LiDARScan): number {
    try {
      const encoded = encode(scan);
      return encoded.length;
    } catch {
      // Rough estimate: ~20 bytes per point + metadata overhead
      return scan.points.length * 20 + 1000;
    }
  }
}
