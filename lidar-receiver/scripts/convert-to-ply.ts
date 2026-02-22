/**
 * Convert MessagePack scans to PLY format
 *
 * Usage: bun scripts/convert-to-ply.ts [sessionId]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { decode } from '@msgpack/msgpack';
import { Database } from 'bun:sqlite';
import type { LiDARScan, LiDARPoint } from '../src/models/lidar-scan.js';

const DB_PATH = './data/database.sqlite';
const SCANS_DIR = './data/scans';

interface ConvertOptions {
  sessionId?: string;
  outputPath?: string;
  includeRGB?: boolean;
}

/**
 * Convert scans to PLY format
 */
function convertToPLY(points: LiDARPoint[], options: { includeRGB?: boolean } = {}): string {
  const header = options.includeRGB
    ? `ply
format ascii 1.0
element vertex ${points.length}
property float x
property float y
property float z
property float intensity
property uchar red
property uchar green
property uchar blue
end_header
`
    : `ply
format ascii 1.0
element vertex ${points.length}
property float x
property float y
property float z
property float intensity
end_header
`;

  const vertices = points
    .map(p => {
      if (options.includeRGB) {
        // Convert intensity to grayscale RGB
        const rgb = Math.floor((p.intensity || 1.0) * 255);
        return `${p.x} ${p.y} ${p.z} ${p.intensity || 1.0} ${rgb} ${rgb} ${rgb}`;
      }
      return `${p.x} ${p.y} ${p.z} ${p.intensity || 1.0}`;
    })
    .join('\n');

  return header + vertices;
}

/**
 * Convert scans to OBJ format (point cloud only)
 */
function convertToOBJ(points: LiDARPoint[]): string {
  const vertices = points
    .map(p => `v ${p.x} ${p.y} ${p.z}`)
    .join('\n');

  return `# OBJ file
# ${points.length} vertices
${vertices}
`;
}

/**
 * Get scans for session
 */
function getSessionScans(sessionId: string): LiDARScan[] {
  const db = new Database(DB_PATH);

  const scans = db
    .query('SELECT filePath FROM scans WHERE sessionId = ? ORDER BY timestamp')
    .all(sessionId) as { filePath: string }[];

  return scans.map(({ filePath }) => {
    const fullPath = join(SCANS_DIR, filePath);
    const buffer = readFileSync(fullPath);
    return decode(buffer) as LiDARScan;
  });
}

/**
 * Main conversion function
 */
function convertSession(sessionId: string, format: 'ply' | 'obj' = 'ply'): void {
  console.log(`Converting session ${sessionId} to ${format.toUpperCase()}...`);

  // Get all scans in session
  const scans = getSessionScans(sessionId);
  console.log(`Found ${scans.length} scans`);

  // Combine all points
  const allPoints: LiDARPoint[] = [];
  scans.forEach(scan => {
    allPoints.push(...scan.points);
  });

  console.log(`Total points: ${allPoints.length.toLocaleString()}`);

  // Convert to format
  const content = format === 'ply'
    ? convertToPLY(allPoints, { includeRGB: true })
    : convertToOBJ(allPoints);

  // Write output file
  const outputPath = `./data/exports/session_${sessionId}.${format}`;
  writeFileSync(outputPath, content);

  console.log(`✓ Exported to ${outputPath}`);
  console.log(`  File size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * List available sessions
 */
function listSessions(): void {
  const db = new Database(DB_PATH);

  const sessions = db.query(`
    SELECT
      sessionId,
      deviceId,
      COUNT(*) as scanCount,
      SUM(pointCount) as totalPoints,
      datetime(MIN(timestamp)/1000, 'unixepoch') as startTime
    FROM scans
    GROUP BY sessionId
    ORDER BY MIN(timestamp) DESC
  `).all() as any[];

  console.log('\nAvailable Sessions:\n');
  sessions.forEach(s => {
    console.log(`Session: ${s.sessionId}`);
    console.log(`  Device: ${s.deviceId}`);
    console.log(`  Scans: ${s.scanCount}`);
    console.log(`  Points: ${s.totalPoints.toLocaleString()}`);
    console.log(`  Started: ${s.startTime}`);
    console.log('');
  });
}

// CLI
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--list') {
  listSessions();
} else {
  const sessionId = args[0];
  const format = (args[1] || 'ply') as 'ply' | 'obj';

  // Create exports directory
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync('./data/exports')) {
    mkdirSync('./data/exports', { recursive: true });
  }

  convertSession(sessionId, format);
}
