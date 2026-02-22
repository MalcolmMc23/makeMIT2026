/**
 * WebSocket Test Client for LiDAR Receiver
 *
 * Usage: bun scripts/test-client.ts [options]
 */

import { WebSocket } from 'ws';
import { encode } from '@msgpack/msgpack';
import type { LiDARScan, LiDARPoint } from '../src/models/lidar-scan.js';

// Configuration
const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
const API_KEY = process.env.API_KEY || 'dev-test-key-change-me-in-production-12345678';
const DEVICE_ID = process.env.DEVICE_ID || 'test-device-001';
const NUM_SCANS = parseInt(process.env.NUM_SCANS || '10');
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '100');

/**
 * Generate random point cloud
 */
function generatePointCloud(numPoints: number = 1000): LiDARPoint[] {
  const points: LiDARPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    points.push({
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
      intensity: Math.random()
    });
  }

  return points;
}

/**
 * Generate test scan
 */
function generateTestScan(index: number): LiDARScan {
  const sessionId = `test-session-${Date.now()}`;

  return {
    scanId: `scan-${Date.now()}-${index}`,
    sessionId,
    deviceId: DEVICE_ID,
    timestamp: Date.now(),
    points: generatePointCloud(500 + Math.floor(Math.random() * 500)),
    metadata: {
      orientation: {
        pitch: Math.random() * 360,
        roll: Math.random() * 360,
        yaw: Math.random() * 360
      },
      confidence: 0.8 + Math.random() * 0.2
    }
  };
}

/**
 * Main test function
 */
async function runTest() {
  console.log('========================================');
  console.log('LiDAR Receiver - WebSocket Test Client');
  console.log('========================================');
  console.log('');
  console.log(`URL:       ${WS_URL}`);
  console.log(`Device ID: ${DEVICE_ID}`);
  console.log(`Scans:     ${NUM_SCANS}`);
  console.log(`Interval:  ${SCAN_INTERVAL_MS}ms`);
  console.log('');

  // Connect to WebSocket
  const url = `${WS_URL}?apiKey=${API_KEY}`;
  const ws = new WebSocket(url, {
    headers: {
      'x-device-id': DEVICE_ID
    }
  });

  // Connection handlers
  ws.on('open', () => {
    console.log('✓ Connected to server');
    console.log('');

    // Start sending scans
    let sentCount = 0;
    let ackCount = 0;

    const interval = setInterval(() => {
      if (sentCount >= NUM_SCANS) {
        clearInterval(interval);
        console.log('');
        console.log('✓ All scans sent');
        console.log(`  Waiting for final acknowledgments...`);

        // Wait for remaining acks, then close
        setTimeout(() => {
          ws.close();
        }, 2000);
        return;
      }

      const scan = generateTestScan(sentCount);
      const encoded = encode(scan);

      ws.send(Buffer.from(encoded));
      sentCount++;

      console.log(`[${sentCount}/${NUM_SCANS}] Sent scan: ${scan.scanId} (${scan.points.length} points)`);
    }, SCAN_INTERVAL_MS);

    // Handle acknowledgments
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'ack' && message.data?.scanId) {
          ackCount++;
          const latency = Date.now() - message.data.received;
          console.log(`       ✓ ACK: ${message.data.scanId} (stored: ${message.data.stored}, latency: ${latency}ms)`);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', (code, reason) => {
    console.log('');
    console.log('========================================');
    console.log('Test Complete');
    console.log('========================================');
    console.log(`Connection closed: ${code} - ${reason || 'Normal closure'}`);
  });
}

// Run test
runTest().catch(console.error);
